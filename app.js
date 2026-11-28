const DATA_BASE_URL = (window.OUTAGE_DATA_BASE_URL || '').replace(/\/$/, '');
const dataUrl = path => DATA_BASE_URL ? `${DATA_BASE_URL}/${path}` : path;
const DATA_URLS = {
    yasno: 'data/outages.json',
    dtek: 'data/dtek-outages.json'
};
const DTEK_ADDRESS_URL = 'data/dtek-address.json';

let displayedSources = [];
const savedSchedules = {};
let refreshInProgress;
const STALE_AFTER_MS = 15 * 60 * 1000;

function renderFreshness(now = Date.now()) {
    const banner = document.getElementById('data-freshness');
    const messages = [];
    for (const source of displayedSources) {
        const timestamp = Date.parse(savedSchedules[source].lastUpdate);
        if (!Number.isFinite(timestamp)) messages.push('Час останнього оновлення невідомий.');
        else if (now - timestamp > STALE_AFTER_MS) messages.push('Дані не оновлювалися понад 15 хвилин і можуть бути застарілими.');
    }
    banner.textContent = [...new Set(messages)].join(' ');
    banner.hidden = messages.length === 0;
}
const FOREGROUND_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes when app is visible

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function calculateDuration(start, end) {
    const durationMinutes = end - start;
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    
    if (hours > 0 && mins > 0) {
        return `${hours} год ${mins} хв`;
    } else if (hours > 0) {
        return `${hours} год`;
    } else {
        return `${mins} хв`;
    }
}

function getCurrentTime() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes;
}

function renderSchedule(content, data) {
    
    const currentMinutes = getCurrentTime();
    let html = '';

    // Check if there's valid data to display
    if (data?.group === null) {
        html = '<div class="status warning">Не вдалося визначити графік для черги цієї адреси.</div>';
    } else if (!data || !data.days || data.days.length === 0) {
        html = '<div class="status warning">Інформація щодо графіків відсутня</div>';
    } else {
        data.days.forEach(day => {
            // Skip tomorrow's section if it has no outages
            if (!day.isToday && day.outages.length === 0) {
                return;
            }

            const date = new Date(day.date);
            const dateStr = date.toLocaleDateString('uk-UA', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
            });

            html += `<div class="day-section">`;
            html += `<div class="day-title">${dateStr}</div>`;

            if (day.outages.length === 0) {
                html += '<div class="status warning">Інформація щодо графіків відсутня</div>';
            } else {
                day.outages.forEach(outage => {
                    const isActive = day.isToday && currentMinutes >= outage.start && currentMinutes < outage.end;
                    const activeClass = isActive ? ' style="border-left-color: #ff6b6b; background: #fff5f5;"' : '';
                    
                    html += `<div class="outage-item"${activeClass}>`;
                    html += `<div class="outage-time">`;
                    if (isActive) html += '🔴 ';
                    html += `${formatTime(outage.start)} — ${formatTime(outage.end)}`;
                    html += `</div>`;
                    html += `<div class="outage-duration">Тривалість: ${calculateDuration(outage.start, outage.end)}</div>`;
                    html += `</div>`;
                });
            }

            html += `</div>`;
        });
    }

    content.innerHTML = html;
}

function formatAddressDate(value, compact = false) {
    // Both formats represent local Kyiv time, without a UTC offset.
    const timeFirst = /^(\d{2}:\d{2}) (\d{2}\.\d{2}\.\d{4})$/.exec(value);
    if (timeFirst) value = `${timeFirst[2]} ${timeFirst[1]}`;
    const match = /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
    if (!match) return value;
    const [, day, month, year, hour, minute] = match;
    if (compact) return `${day}.${month} ${hour}:${minute}`;
    return `${day}.${month}.${year}, ${hour}:${minute}`;
}

function renderDtekNotice(data) {
    const notice = document.getElementById('dtek-notice');
    notice.replaceChildren();
    const fields = [data?.sub_type, data?.start_date, data?.end_date];
    const hasNotice = fields.some(value => typeof value === 'string' && value.trim());
    notice.hidden = !hasNotice;
    if (notice.hidden) return;

    function addLine(text, className) {
        const line = document.createElement('div');
        line.textContent = text;
        if (className) line.className = className;
        notice.append(line);
    }

    addLine('⚠️ Повідомлення від ДТЕК', 'address-notice-title');
    addLine(data.sub_type || 'Відключення електроенергії', 'address-notice-type');
    const isEmergency = /аварійн|екстрен/iu.test(data.sub_type || '');
    if (data.start_date) addLine(`Початок: ${formatAddressDate(data.start_date, isEmergency)}`);
    if (data.end_date) addLine(`Завершення: ${isEmergency ? 'орієнтовно ' : ''}${formatAddressDate(data.end_date, isEmergency)}`);
    if (data.lastUpdate) {
        const updated = data.sourceUpdate ? formatAddressDate(data.sourceUpdate) :
            new Date(data.lastUpdate).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
        addLine(`Інформацію оновлено: ${updated}`, 'last-update');
    }
}

async function fetchData(path) {
    const response = await fetch(dataUrl(path) + '?t=' + Date.now(), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Failed to load ' + path);
    return response.json();
}

async function loadDtekNotice() {
    try {
        renderDtekNotice(await fetchData(DTEK_ADDRESS_URL));
    } catch (error) {
        console.error('Error loading DTEK address information:', error);
    }
}

async function loadScheduleData(source) {
    try {
        const data = await fetchData(DATA_URLS[source]);
        if (!Array.isArray(data?.days)) throw new Error('Invalid schedule');
        savedSchedules[source] = data;
    } catch (error) {
        console.error('Error loading schedule:', source, error);
    }
}

async function loadLatestSchedule() {
    await Promise.all([loadScheduleData('dtek'), loadScheduleData('yasno')]);
    const { dtek, yasno } = savedSchedules;
    const views = displayedSchedules(dtek, yasno);
    for (const { group, schedule, source } of views) {
        const prefix = group === '13.1' ? '' : 'old-';
        const content = document.getElementById(prefix + 'content');
        const footer = document.getElementById(prefix + 'schedule-update');
        footer.hidden = !schedule;
        if (!dtek && !yasno) {
            content.innerHTML = '<div class="error">Помилка завантаження даних. Спробуйте пізніше.</div>';
            continue;
        }
        renderSchedule(content, schedule);
        if (!schedule) continue;
        const name = source === 'dtek' ? 'ДТЕК' : 'ЯСНО';
        const updatedAt = Date.parse(schedule.lastUpdate);
        footer.textContent = Number.isFinite(updatedAt)
            ? `Останнє оновлення: ${new Date(updatedAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })} (${name})`
            : `Час оновлення невідомий (${name})`;
    }
    displayedSources = [...new Set(views.map(view => view.source).filter(Boolean))];
    renderFreshness();
    const emergencyGroups = views.filter(view => view.source === 'yasno' && view.schedule.today?.status === 'EmergencyShutdowns');
    const emergency = document.getElementById('yasno-emergency');
    emergency.hidden = !emergencyGroups.length;
    if (!emergency.hidden) {
        emergency.textContent = '⚠️ Екстрені відключення · ' + emergencyGroups.map(view => 'група ' + view.group).join(', ');
    }
}

function loadSchedule() {
    if (!refreshInProgress) {
        refreshInProgress = Promise.all([loadLatestSchedule(), loadDtekNotice()])
            .finally(() => { refreshInProgress = null; });
    }
    return refreshInProgress;
}

loadSchedule();

// Poll for updates when app is visible
let visibilityCheckInterval;

function startVisibilityPolling() {
    if (!document.hidden) {
        visibilityCheckInterval = setInterval(() => {
            if (!document.hidden) {
                loadSchedule();
            }
        }, FOREGROUND_CHECK_INTERVAL);
    }
}

// Start/stop polling based on page visibility
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearInterval(visibilityCheckInterval);
    } else {
        loadSchedule(); // Load immediately when page becomes visible
        startVisibilityPolling();
    }
});

// Start polling if page is initially visible
startVisibilityPolling();

// Re-evaluate age even if the network is unavailable.
setInterval(() => { if (!document.hidden) renderFreshness(); }, 60 * 1000);
