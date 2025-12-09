const DATA_URL = 'data/outages.json';
const CHECK_INTERVAL = 60000; // Check every minute
const STORAGE_KEY = 'lastSchedule';

let notificationsEnabled = false;

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

function updateCurrentTime() {
    const now = new Date();
    const timeStr = now.toLocaleString('uk-UA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('currentTime').textContent = `🕐 ${timeStr}`;
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

function compareSchedules(oldData, newData) {
    if (!oldData || !newData) return false;
    return JSON.stringify(oldData.days) !== JSON.stringify(newData.days);
}

async function loadSchedule() {
    try {
        const response = await fetch(DATA_URL + '?t=' + Date.now());
        if (!response.ok) {
            throw new Error('Failed to load data');
        }
        
        const data = await response.json();
        renderSchedule(data);

        // Check for changes and send notification
        const lastSchedule = localStorage.getItem(STORAGE_KEY);
        if (lastSchedule && notificationsEnabled) {
            const oldData = JSON.parse(lastSchedule);
            if (compareSchedules(oldData, data)) {
                sendNotification('Графік відключень змінено!', 
                    'Перевірте оновлений розклад відключень електроенергії');
            }
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        
    } catch (error) {
        console.error('Error loading schedule:', error);
        document.getElementById('content').innerHTML = 
            '<div class="error">Помилка завантаження даних. Спробуйте пізніше.</div>';
    }
}

async function requestNotificationPermission() {
    const btn = document.getElementById('notificationBtn');
    const statusDiv = document.getElementById('notificationStatus');

    if (!('Notification' in window)) {
        statusDiv.innerHTML = '<div class="status warning">Ваш браузер не підтримує сповіщення</div>';
        btn.disabled = true;
        return;
    }

    if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        btn.textContent = 'Сповіщення увімкнено ✓';
        btn.style.background = '#666';
        statusDiv.innerHTML = '<div class="status success">Сповіщення активні</div>';
        return;
    }

    if (Notification.permission === 'denied') {
        statusDiv.innerHTML = '<div class="status warning">Сповіщення заблоковані. Увімкніть їх у налаштуваннях браузера</div>';
        btn.disabled = true;
        return;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
        notificationsEnabled = true;
        btn.textContent = 'Сповіщення увімкнено ✓';
        btn.style.background = '#666';
        statusDiv.innerHTML = '<div class="status success">Сповіщення активні</div>';
        sendNotification('Сповіщення активовано', 'Ви будете отримувати повідомлення про зміни у графіку');
    } else {
        statusDiv.innerHTML = '<div class="status warning">Дозвіл на сповіщення не надано</div>';
    }
}

function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '⚡',
            badge: '⚡',
            requireInteraction: false
        });
    }
}

// Event listeners
document.getElementById('notificationBtn').addEventListener('click', requestNotificationPermission);

// Initialize
updateCurrentTime();
setInterval(updateCurrentTime, 1000);

loadSchedule();
setInterval(loadSchedule, CHECK_INTERVAL);

// Check notification permission on load
if ('Notification' in window && Notification.permission === 'granted') {
    notificationsEnabled = true;
    const btn = document.getElementById('notificationBtn');
    btn.textContent = 'Сповіщення увімкнено ✓';
    btn.style.background = '#666';
    document.getElementById('notificationStatus').innerHTML = 
        '<div class="status success">Сповіщення активні</div>';
}
