const { setTimeout: delay } = require('node:timers/promises');
const { buildNotification, sendNotification } = require('./notification-core');
const { latestScheduleSource } = require('../../schedule-source');
const { selectGroup } = require('./group-schedule');

const FILES = { schedule: 'dtek-outages.json', address: 'dtek-address.json', yasno: 'outages.json', yasnoGroup: 'yasno-group.json' };

// A partial upstream outage is degraded service, not a failed publication.
function collectionFailed(run) {
    return run.updated.length === 0 && Object.keys(run.errors).length > 0;
}

function reportSourceErrors(errors) {
    for (const [source, message] of Object.entries(errors)) {
        // Escape workflow command data from untrusted upstream error messages.
        const detail = `${source}: ${message}`.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
        console.warn(`::warning::${detail}`);
    }
}

async function collectData(previous, loaders, { sleep = delay, fallback } = {}) {
    const data = { ...previous };
    const errors = {};
    const updated = [];
    await Promise.all(Object.entries(loaders).map(async ([key, load]) => {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data[FILES[key]] = await load();
                updated.push(key);
                return;
            } catch (error) {
                if (attempt === 2) errors[key] = error instanceof Error ? error.message : 'Source fetch failed';
                else await sleep(2000 * (attempt + 1));
            }
        }
    }));
    const httpErrors = { ...errors };
    const recovered = [];
    const failedDtek = ['schedule', 'address'].filter(key => errors[key]);
    if (fallback && failedDtek.length) {
        try {
            const report = await fallback();
            for (const key of failedDtek) {
                const step = report.steps?.find(step => step.name === key);
                if (step?.ok && step.data) {
                    data[FILES[key]] = step.data;
                    updated.push(key);
                    recovered.push(key);
                    delete errors[key];
                } else errors[key] += `; browser: ${step?.error || 'No usable data'}`;
            }
        } catch (error) {
            for (const key of failedDtek) errors[key] += `; browser: ${error.message || 'Fallback failed'}`;
        }
    }
    // The address and both schedules refresh independently. Re-select even when only the address changed.
    for (const [source, file, groupFile] of [
        ['dtek', FILES.schedule, FILES.address], ['yasno', FILES.yasno, FILES.yasnoGroup],
    ]) {
        const address = data[groupFile];
        const schedule = data[file];
        if (schedule?.schedules) {
            data[file] = { ...selectGroup(source, schedule, address?.group ?? null),
                groupCheckedAt: address?.lastUpdate ?? null };
        } else if (schedule && address && Object.hasOwn(address, 'group')) {
            // A pre-migration file cannot identify which group's intervals it contains.
            data[file] = { ...schedule, days: [], group: null, ...(source === 'yasno' ? { today: null } : {}) };
        }
    }
    return { data, errors, updated, httpErrors, recovered };
}

async function waitForPublication(data, siteUrl, {
    // deploy-pages itself may wait ten minutes; allow setup/propagation as well.
    fetchImpl = fetch, sleep = delay, clock = Date.now, timeoutMs = 11 * 60 * 1000, intervalMs = 10000,
} = {}) {
    const deadline = clock() + timeoutMs;
    while (clock() < deadline) {
        try {
            const matches = await Promise.all(Object.entries(data).map(async ([file, expected]) => {
                const url = new URL(`data/${file}`, siteUrl);
                url.searchParams.set('t', String(clock()));
                const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
                // Include lastUpdate: the user must see this specific published fetch.
                return response.ok && JSON.stringify(await response.json()) === JSON.stringify(expected);
            }));
            if (matches.every(Boolean)) return;
        } catch { /* A Pages rollout can temporarily serve old or missing files. */ }
        const remaining = deadline - clock();
        if (remaining > 0) await sleep(Math.min(intervalMs, remaining));
    }
    throw new Error('GitHub Pages has not published the fetched data; push remains pending');
}

async function notifySources({ data, updated, states, config, apiKey, acknowledge,
    send = sendNotification, wait = waitForPublication, now = new Date() }) {
    await wait(data, config.siteUrl);
    if (!updated.length) return {};
    const dtek = data[FILES.schedule];
    const yasno = data[FILES.yasno];
    const source = latestScheduleSource(dtek, yasno);
    try {
        // The existing DTEK state records what subscribers have already been told.
        const previous = states.dtek;
        if (!previous?.revision) throw new Error('Missing migrated notification state');
        const schedule = source === 'yasno' ? yasno : dtek;
        const address = data[FILES.address] ?? previous.address;
        if (!schedule && !data[FILES.address]) throw new Error('Source data incomplete');
        const notification = buildNotification(source ?? 'dtek', previous, schedule ?? { group: null, days: [] },
            config, address, now);
        if (!notification) return {};
        if (notification.payload) {
            if (!apiKey) throw new Error('OneSignal secret is missing');
            const result = await send(notification.payload, apiKey);
            if (!result?.delivered) throw new Error('OneSignal did not accept notification');
            console.log(`Push accepted; id=${result.id}`);
        }
        await acknowledge('dtek', notification.state);
        return {};
    } catch (error) {
        return { [source ?? 'dtek']: error instanceof Error ? error.message : 'Notification failed' };
    }
}

module.exports = { FILES, collectData, collectionFailed, reportSourceErrors, waitForPublication, notifySources };
