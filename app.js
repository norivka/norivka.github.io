const DATA_URL = 'data/outages.json';
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

function renderSchedule(data) {
    const content = document.getElementById('content');
    
    if (!data || !data.days || data.days.length === 0) {
        content.innerHTML = '<div class="status warning">Немає даних про відключення</div>';
        return;
    }

    const currentMinutes = getCurrentTime();
    let html = '';

    data.days.forEach(day => {
        const date = new Date(day.date);
        const dateStr = date.toLocaleDateString('uk-UA', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });

        html += `<div class="day-section">`;
        html += `<div class="day-title">${dateStr}</div>`;

        if (day.outages.length === 0) {
            html += `<div class="no-outages">Відключень немає</div>`;
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

    if (data.lastUpdate) {
        const updateTime = new Date(data.lastUpdate).toLocaleString('uk-UA');
        html += `<div class="last-update">Останнє оновлення: ${updateTime}</div>`;
    }

    content.innerHTML = html;
}

async function loadSchedule() {
    try {
        const response = await fetch(DATA_URL + '?t=' + Date.now());
        if (!response.ok) {
            throw new Error('Failed to load data');
        }
        
        const data = await response.json();
        renderSchedule(data);
        
    } catch (error) {
        console.error('Error loading schedule:', error);
        document.getElementById('content').innerHTML = 
            '<div class="error">Помилка завантаження даних. Спробуйте пізніше.</div>';
    }
}

// Initialize
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
