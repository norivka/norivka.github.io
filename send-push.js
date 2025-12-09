const webpush = require('web-push');
const fs = require('fs');

// VAPID keys
const vapidKeys = {
    publicKey: 'BGW2Wfv-M7w1xX13v8MQzutf_8xsMhN52wKP-wGfo_5afyTMHt8g7MjtBxsI5MJousR00UonmckEMp-hSEbv5BI',
    privateKey: process.env.VAPID_PRIVATE_KEY || 'nRwqExorCe8_HgeWGgQ7RYpVfmklSreWFMAs3dHrDes'
};

webpush.setVapidDetails(
    'mailto:your-email@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Read subscriptions from file (in real app, this would be from a database)
const subscriptionsFile = process.argv[2] || 'subscriptions.json';

let subscriptions = [];
if (fs.existsSync(subscriptionsFile)) {
    try {
        const data = fs.readFileSync(subscriptionsFile, 'utf8');
        subscriptions = JSON.parse(data);
    } catch (error) {
        console.log('No subscriptions found or invalid JSON');
    }
}

if (subscriptions.length === 0) {
    console.log('No push subscriptions to send to.');
    console.log('Users need to enable notifications in the app first.');
    process.exit(0);
}

const payload = JSON.stringify({
    title: 'Графік відключень змінено!',
    body: 'Перевірте оновлений розклад відключень електроенергії'
});

// Send notifications to all subscribers
Promise.all(subscriptions.map(subscription => {
    return webpush.sendNotification(subscription, payload)
        .then(() => {
            console.log('Notification sent successfully');
        })
        .catch(error => {
            console.error('Error sending notification:', error);
            if (error.statusCode === 410) {
                console.log('Subscription expired, should remove from database');
            }
        });
})).then(() => {
    console.log('All notifications sent');
});
