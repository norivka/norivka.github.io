const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { scheduleSnapshot, changedScheduleDates, scheduleChangeKind, addressNotice, isNotifiableAddressNotice, isStabilizationNotice, addressChangeKind } = require('./schedule-changes');

const { displayedSchedules } = require('../../schedule-source');

const SOURCES = {
    dtek: { name: 'ДТЕК', file: 'data/dtek-outages.json' },
    yasno: { name: 'ЯСНО', file: 'data/outages.json' }
};
const PUSH_SEGMENTS = ['Total Subscriptions'];

function formatAddressTime(value, timeOnly = false) {
    // DTEK already supplies Kyiv wall time; do not reinterpret it as a UTC date.
    const match = /^(\d{1,2}):(\d{2}) (\d{1,2})\.(\d{1,2})\.\d{4}$/u.exec(value);
    if (!match) return value;
    const [, hour, minute, day, month] = match;
    if (timeOnly) return `${hour.padStart(2, '0')}:${minute}`;
    return `${day.padStart(2, '0')}.${month.padStart(2, '0')} ${Number(hour)}:${minute}`;
}

function addressNotificationBody(notice) {
    const timeOnly = isStabilizationNotice(notice);
    const start = formatAddressTime(notice.start_date, timeOnly);
    const end = formatAddressTime(notice.end_date, timeOnly);
    if (start && end) return `${start} - ${end}`;
    if (start) return `Початок: ${start}`;
    if (end) return `Завершення: ${end}`;
    return '';
}

/** @param {{sub_type: string, start_date: string, end_date: string} | null} addressData */
function buildNotification(source, previousState, data, config, addressData = null, now = new Date()) {
    if (!Object.hasOwn(SOURCES, source)) throw new Error('Unknown schedule source');
    const previous = scheduleSnapshot(previousState);
    // An unresolved address group must not be interpreted as a schedule cancellation.
    const next = data.group === null ? previous : scheduleSnapshot(data);
    const dates = changedScheduleDates(previous, next);
    const kind = scheduleChangeKind(previous, next, kyivDate(now));
    return composeNotification(previousState, config, addressData, { days: next }, dates.length > 0,
        kind ? [{ source, kind }] : []);
}

function kyivDate(now) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
}

function buildDisplayedNotification(previousState, dtek, yasno, config, addressData, now = new Date()) {
    const groups = { ...previousState.groups };
    const changes = [];
    const today = kyivDate(now);
    for (const { group, source, schedule } of displayedSchedules(dtek, yasno)) {
        if (!schedule) continue; // A missing group is not a cancellation.
        const days = scheduleSnapshot(schedule);
        // A pre-migration baseline has no group label. Seed the displayed groups once.
        if (previousState.groups) {
            const kind = scheduleChangeKind(groups[group] ?? [], days, today);
            if (kind) changes.push({ source, group, kind });
        }
        groups[group] = days;
    }
    const changed = JSON.stringify(previousState.groups) !== JSON.stringify(groups);
    return composeNotification(previousState, config, addressData, { groups }, changed, changes);
}

function composeNotification(previousState, config, addressData, nextState, scheduleChanged, changes) {
    const beforeNotice = addressNotice(previousState.address);
    const nextNotice = addressNotice(addressData);
    const isRepair = /^аварійні ремонтні роботи$/iu.test(nextNotice.sub_type);
    // Older states silently acknowledged non-emergency notices. Deliver a current
    // notice once under the expanded policy, keeping failed sends pending.
    const pendingNotice = previousState.addressNotificationVersion !== 1 &&
        isNotifiableAddressNotice(nextNotice) && !isRepair && !isStabilizationNotice(nextNotice);
    const emergencyRemoved = /аварійн|екстрен/iu.test(beforeNotice.sub_type) &&
        !isNotifiableAddressNotice(nextNotice);
    const noticeKind = emergencyRemoved ? 'removed' :
        pendingNotice ? 'appeared' : addressChangeKind(beforeNotice, nextNotice);
    if (!scheduleChanged && JSON.stringify(beforeNotice) === JSON.stringify(nextNotice) && !pendingNotice) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.appId)) {
        throw new Error('Invalid OneSignal App ID');
    }
    if (!previousState.revision) throw new Error('Missing notification state revision');

    // A stable UUID deduplicates retries even after a failed acknowledgement commit.
    // Chaining the previous revision lets a later A → B change get its own message.
    // Include the audience so correcting a target does not reuse a failed send's key.
    const next = nextState.groups ?? nextState.days;
    const bytes = createHash('sha256').update(JSON.stringify(['dtek', previousState.revision, next, nextNotice, PUSH_SEGMENTS])).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const noticeTitle = noticeKind
        ? (emergencyRemoved
            ? (/екстрен/iu.test(beforeNotice.sub_type) ? 'Скасовано екстрені відключення' : 'Скасовано аварійні відключення')
            : isStabilizationNotice(nextNotice) ? 'відключення згідно графіку'
                : nextNotice.sub_type || 'Повідомлення про відключення')
        : '';
    const titles = {
        published: 'нові графіки відключень',
        changed: 'зміни у графіках відключень',
        cancelled: 'скасовано графіки відключень'
    };
    const scheduleTitles = changes.map(({ group, kind }) => group ? `Група ${group}: ${titles[kind]}` : titles[kind]);
    const heading = noticeKind ? SOURCES.dtek.name :
        [...new Set(changes.map(change => SOURCES[change.source].name))].join(' / ');
    const times = noticeKind ? addressNotificationBody(nextNotice) : '';
    const body = [noticeTitle, times, ...scheduleTitles].filter(Boolean).join('\n').toLocaleLowerCase('uk-UA');
    const url = new URL(config.siteUrl);
    if (url.protocol !== 'https:') throw new Error('Notification URL must use HTTPS');
    return {
        state: { ...nextState, address: nextNotice, addressNotificationVersion: 1, revision: id },
        // Acknowledge every change so reappearance can trigger a new notification.
        payload: !changes.length && !noticeKind ? null : {
            app_id: config.appId,
            included_segments: PUSH_SEGMENTS,
            target_channel: 'push',
            isAnyWeb: true,
            headings: { en: heading, uk: heading },
            contents: { en: body, uk: body },
            url: url.href,
            ttl: !noticeKind && changes.every(change => change.kind === 'published') ? 60 * 60 : 5 * 60,
            idempotency_key: id
        }
    };
}

async function sendNotification(payload, apiKey, { fetchImpl = fetch, sleep = delay } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
        let response;
        try {
            response = await fetchImpl('https://api.onesignal.com/notifications?c=push', {
                method: 'POST',
                headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000)
            });
        } catch {
            if (attempt === 2) throw new Error('OneSignal network request failed after 3 attempts');
        }
        if (response?.ok) {
            const result = await response.json();
            if (result.id) return { delivered: true, id: result.id };
            // With no eligible subscribers OneSignal creates no notification.
            if (Array.isArray(result.errors) && result.errors.length > 0 &&
                result.errors.every(error => typeof error === 'string' && /not subscribed|no subscribers/i.test(error))) {
                throw new Error('OneSignal found no subscribed devices in the target audience; notification remains pending');
            }
            throw new Error('OneSignal did not create a notification; check the app configuration');
        }
        if (response && response.status !== 429 && response.status < 500) {
            throw new Error(`OneSignal rejected notification (HTTP ${response.status})`);
        }
        if (attempt === 2) throw new Error(`OneSignal unavailable (HTTP ${response.status})`);
        const retryAfter = Number(response?.headers?.get('retry-after'));
        await sleep(Math.min(Math.max(2 ** attempt * 1000, retryAfter * 1000 || 0), 60000));
    }
}

module.exports = { buildDisplayedNotification, buildNotification, sendNotification };
