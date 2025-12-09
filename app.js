const DATA_URL = 'data/outages.json';
const STORAGE_KEY = 'lastSchedule';
const FOREGROUND_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes when app is visible

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
        const response = await fetch(DATA_URL + '?t=' + Date.now(), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
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

    if (!('serviceWorker' in navigator)) {
        statusDiv.innerHTML = '<div class="status warning">Ваш браузер не підтримує Service Worker</div>';
        btn.disabled = true;
        return;
    }

    if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        btn.textContent = 'Сповіщення увімкнено ✓';
        btn.style.background = '#666';
        statusDiv.innerHTML = '<div class="status success">Сповіщення активні</div>';
        // Subscribe to push if not already subscribed
        await subscribeToPushNotifications();
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
        
        // Subscribe to push notifications
        await subscribeToPushNotifications();
        
        sendNotification('Сповіщення активовано', 'Ви будете отримувати повідомлення про зміни у графіку');
    } else {
        statusDiv.innerHTML = '<div class="status warning">Дозвіл на сповіщення не надано</div>';
    }
}

async function subscribeToPushNotifications() {
    try {
        const registration = await navigator.serviceWorker.ready;
        
        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            const vapidPublicKey = 'BGW2Wfv-M7w1xX13v8MQzutf_8xsMhN52wKP-wGfo_5afyTMHt8g7MjtBxsI5MJousR00UonmckEMp-hSEbv5BI';
            const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
            
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
            
            console.log('Push subscription created:', subscription);
        }
        
        // Save subscription to localStorage for GitHub Actions to use
        localStorage.setItem('pushSubscription', JSON.stringify(subscription));
        
        return subscription;
    } catch (error) {
        console.error('Failed to subscribe to push notifications:', error);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
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
//document.getElementById('notificationBtn').addEventListener('click', requestNotificationPermission);

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
            console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
            console.error('Service Worker registration failed:', error);
        });
}

// Initialize
loadSchedule();

// Poll for updates when app is visible (Service Worker handles background updates)
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

// Check notification permission on load
/*
if ('Notification' in window && Notification.permission === 'granted') {
    notificationsEnabled = true;
    const btn = document.getElementById('notificationBtn');
    btn.textContent = 'Сповіщення увімкнено ✓';
    btn.style.background = '#666';
    document.getElementById('notificationStatus').innerHTML = 
        '<div class="status success">Сповіщення активні</div>';
}
*/
