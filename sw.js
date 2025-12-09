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

// Periodic background sync (when supported)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-outages') {
        event.waitUntil(checkForUpdates());
    }
});

// Background sync fallback
self.addEventListener('sync', (event) => {
    if (event.tag === 'check-outages') {
        event.waitUntil(checkForUpdates());
    }
});

// Check for schedule updates
async function checkForUpdates() {
    try {
        const response = await fetch(DATA_URL + '?t=' + Date.now(), {
            cache: 'no-store'
        });
        
        if (!response.ok) {
            console.error('Failed to fetch data:', response.status);
            return;
        }
        
        const newData = await response.json();
        
        // Get stored data
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match('cached-schedule');
        
        if (cachedResponse) {
            const oldData = await cachedResponse.json();
            
            // Compare schedules
            if (JSON.stringify(oldData.days) !== JSON.stringify(newData.days)) {
                // Schedule changed - send notification
                await self.registration.showNotification('Графік відключень змінено!', {
                    body: 'Перевірте оновлений розклад відключень електроенергії',
                    icon: 'icon-192.png',
                    badge: 'icon-192.png',
                    tag: 'schedule-update',
                    requireInteraction: false,
                    vibrate: [200, 100, 200]
                });
            }
        }
        
        // Store new data
        await cache.put('cached-schedule', new Response(JSON.stringify(newData)));
        
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

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
