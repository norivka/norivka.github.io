const CACHE_NAME = 'outages-v1';
const DATA_URL = 'data/outages.json';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
    console.log('Push received:', event);
    
    let notificationData = {
        title: 'Графік відключень змінено!',
        body: 'Перевірте оновлений розклад відключень електроенергії',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: 'schedule-update',
        requireInteraction: false,
        vibrate: [200, 100, 200]
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            if (data.title) notificationData.title = data.title;
            if (data.body) notificationData.body = data.body;
        } catch (e) {
            console.error('Error parsing push data:', e);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            // Check if app is already open
            for (const client of clients) {
                if (client.url === self.registration.scope && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window if not
            if (self.clients.openWindow) {
                return self.clients.openWindow('/');
            }
        })
    );
});

// Fetch event - serve from network, don't cache data
self.addEventListener('fetch', (event) => {
    // Don't cache the data file
    if (event.request.url.includes('outages.json')) {
        event.respondWith(
            fetch(event.request, {
                cache: 'no-store'
            })
        );
    }
});
