# VIRUX — Security Policy

> **Version:** 0.1.0-alpha | **Phase:** 1 — Foundation

---

## 1. Security Principles

1. **Deny by default** — All Firestore access is denied unless explicitly granted.
2. **Authenticate before authorizing** — Every resource access requires a valid Firebase Auth token.
3. **Owner-only access** — Users can only access their own data (`request.auth.uid == resource.data.ownerId`).
4. **Never expose Admin credentials** — Firebase Admin SDK and service account keys are never stored in client code or committed to Git.
5. **Environment variables for all secrets** — API keys live in `.env.local`, which is listed in `.gitignore`.
6. **Minimal permissions** — Capabilities are granted incrementally, not all at once.

---

## 2. Firebase Security Rules

### Phase 1 (Current)
All reads and writes are denied globally:

```
match /{document=**} {
  allow read, write: if false;
}
```

### Phase 2 (Planned)
User profile access:

```
match /users/{userId} {
  allow read, write: if request.auth != null
                    && request.auth.uid == userId;
}
```

### Phase 3 (Planned)
Device access — owner only:

```
match /devices/{deviceId} {
  allow read, write: if request.auth != null
                    && request.auth.uid == resource.data.ownerId;
  allow create: if request.auth != null
               && request.auth.uid == request.resource.data.ownerId;
}
```

---

## 3. Android Security

| Area | Measure |
|---|---|
| Package name | `com.virux.app` — unique namespace |
| `google-services.json` | Included in repo (private); remove from tracking if open-sourcing |
| Permissions | Only required permissions declared in `AndroidManifest.xml` |
| ProGuard | Enabled in release builds |
| Network | HTTPS only (Android enforces this by default) |
| Keystore | Never committed to Git (`.gitignore` excludes `*.jks`, `*.keystore`) |

---

## 4. Web Dashboard Security

| Area | Measure |
|---|---|
| Firebase config | Stored in `.env.local` (gitignored) |
| `.env.example` | Committed — contains placeholder values only |
| API keys | Restricted by Firebase App Check (Phase 2) |
| CSP headers | Configured via Firebase Hosting `firebase.json` |
| Security headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |

---

## 5. Known Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Firebase API key exposed in browser | Firebase API keys are designed to be public; security is enforced by Firestore rules + App Check |
| Firestore open access | Deny-by-default rules in Phase 1 |
| WebRTC SDP leakage | Sessions expire after 10 minutes; deleted after connection |
| Stale FCM tokens | Devices update FCM token on app start and after token refresh |
| `@grpc/grpc-js` audit warning | Affects only Firebase emulator SDK (dev-time, not browser bundle); not a production risk |

---

## 6. Incident Response

For security vulnerabilities:
1. Do not commit a fix that exposes the vulnerability details in the commit message.
2. Update Firestore rules immediately if data is at risk.
3. Rotate Firebase API key if compromised (via Firebase Console → Project Settings).
4. Revoke affected user sessions via Firebase Auth Console.

