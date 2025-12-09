# Web Push Setup Instructions

## Setting up push notifications

### 1. Add GitHub Secret

Go to your repository settings → Secrets and variables → Actions → New repository secret:

- Name: `VAPID_PRIVATE_KEY`
- Value: `nRwqExorCe8_HgeWGgQ7RYpVfmklSreWFMAs3dHrDes`

### 2. How users subscribe

When users click "Увімкнути сповіщення" in the app:
1. Their browser requests notification permission
2. The app subscribes them to web push
3. The subscription is saved in browser localStorage

### 3. Adding subscriptions to the repository

Currently, subscriptions are stored in `subscriptions.json`. Since this is a static site, you have two options:

**Option A: Manual subscription management (current)**
- Users enable notifications in the app
- Copy their subscription from browser console (it's logged)
- Manually add it to `subscriptions.json` and commit

**Option B: Use a backend service**
- Set up a simple server (Vercel/Netlify functions, or dedicated server)
- Store subscriptions in a database
- Have the app POST subscriptions to your server
- GitHub Actions queries your server for subscriptions

### 4. Testing push notifications

1. Enable notifications in the app
2. Check browser console for the subscription object
3. Add it to `subscriptions.json`:
```json
[
  {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
]
```
4. Commit and wait for the workflow to run when data changes

## How it works

1. GitHub Actions runs every 6 minutes
2. Fetches latest outage data
3. If data changed, commits it
4. Sends web push notifications to all subscribed users
5. Users receive notification even if app is closed

## Limitations

- Subscriptions must be manually added to repo (or use a backend)
- VAPID private key is in repository secrets
- Free solution with some manual work required
