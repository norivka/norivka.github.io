// VAPID Public Key - safe to expose publicly
const VAPID_PUBLIC_KEY = 'BGW2Wfv-M7w1xX13v8MQzutf_8xsMhN52wKP-wGfo_5afyTMHt8g7MjtBxsI5MJousR00UonmckEMp-hSEbv5BI';

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

async function subscribeToPush(registration) {
    try {
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        
        // Save subscription to localStorage
        localStorage.setItem('pushSubscription', JSON.stringify(subscription));
        
        // In a real app, you'd send this to your server
        // For now, we'll use it in GitHub Actions
        console.log('Push subscription:', JSON.stringify(subscription));
        
        return subscription;
    } catch (error) {
        console.error('Failed to subscribe to push:', error);
        throw error;
    }
}

async function unsubscribeFromPush(registration) {
    try {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await subscription.unsubscribe();
            localStorage.removeItem('pushSubscription');
        }
    } catch (error) {
        console.error('Failed to unsubscribe:', error);
    }
}

export { subscribeToPush, unsubscribeFromPush, VAPID_PUBLIC_KEY };
