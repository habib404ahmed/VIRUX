# VIRUX — Firebase Console Configuration Guide

> **Project ID:** `virux-504a5`  
> **Firebase Plan:** Spark (Free Tier)  
> **Target Android App:** `com.virux.app`

---

## 1. Enable Authentication Providers

1. Open the [Firebase Console](https://console.firebase.google.com/project/virux-504a5/authentication/providers).
2. Navigate to **Build > Authentication > Sign-in method**.
3. Under **Sign-in providers**, configure:
   - **Email/Password**: Enable and click **Save** (do not enable Email link/passwordless).
   - **Google**: Enable, select your project support email, and click **Save**.

---

## 2. Register Android Keystore Fingerprints

Google Sign-In on Android requires registered SHA certificate fingerprints in your Firebase project.

1. Navigate to **Project Settings > General > Your apps > Android apps (`com.virux.app`)**.
2. Click **Add fingerprint** and insert the debug fingerprints extracted from your development machine:

### Development Keystore Fingerprints:
- **SHA-1:**
  ```
  34:DC:B5:C9:7D:F9:33:A7:11:4B:0D:F5:A3:4A:D3:36:8A:D1:C3:09
  ```
- **SHA-256:**
  ```
  2A:62:58:48:83:EE:EE:1A:41:9E:BA:F6:99:D9:A0:AF:E4:C1:6B:79:E1:3F:88:39:1D:90:09:2C:C3:A9:9C:7E
  ```
3. After adding the fingerprints, download the updated `google-services.json` and replace `android-app/app/google-services.json`.

---

## 3. Web Dashboard Authorized Domains

1. In **Authentication > Settings > Authorized domains**, verify:
   - `localhost`
   - `127.0.0.1`
   - `virux-504a5.firebaseapp.com`
   - `virux-504a5.web.app`

---

## 4. Web Environment Credentials (`.env.local`)

Copy `web-dashboard/.env.example` to `web-dashboard/.env.local` and populate the actual project keys from **Project Settings > General > Web apps (`web-dashboard`)**:

```ini
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=virux-504a5.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=virux-504a5
VITE_FIREBASE_STORAGE_BUCKET=virux-504a5.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...
```

*Note:* Never commit `.env.local` or Firebase service account private keys to source control. `.env.local` is protected in `.gitignore`.

