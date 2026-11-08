# VIRUX — PHASE 4 ARCHITECTURE & SECURITY SPECIFICATION (REVISED)
## Asymmetric Device Identity, Pairing State Machine, and Serverless Presence on Firebase Spark

> **Project:** VIRUX — *Your Devices. One Ecosystem.*  
> **Firebase Project ID:** `virux-504a5` | **Plan:** Spark (Free Tier — Zero Cloud Functions, No Blaze, No External Backend)  
> **Android Target:** Android 15 (API 35), Min SDK 26  
> **Web Stack:** React 19, TypeScript strict mode, Vite 6, Tailwind CSS v4  
> **Document Revision:** 2.0 (Post-Security Review)

---

## 1. Cryptographic Device Identity & Pairing Token Security

### The Limitations of Shared-Secret Tokens
In naive implementations, a pairing session stores a random secret token in Firestore, and the scanning client claims the session by reading the token and echoing it back. 

**Critical Architectural Vulnerability:** Because both the Web Dashboard and the Android device authenticate under the same Firebase Auth account (`request.auth.uid == ownerUid`), any client or script running under that account has full read access to `/users/{ownerUid}/pairingSessions/{sessionId}`. Therefore, echoing a stored token provides **zero cryptographic proof of possession of the physical device or scanner**.

### The VIRUX Asymmetric Identity Architecture
To ensure genuine hardware identity and non-repudiation without a privileged backend, VIRUX implements hardware-backed asymmetric cryptography:

```
[ Android Keystore (Hardware TEE / StrongBox) ]
                     |
         Generates EC Key Pair (NIST P-256)
         - Private Key: Unexportable, bound to Keystore silicon
         - Public Key: Exportable (PEM/DER format)
                     |
                     v
             `devicePublicKey` (Cryptographic Device Fingerprint)
```

1. **Hardware-Backed Device Identity:**
   - On first install, the Android app generates an asymmetric Elliptic Curve key pair (`EC`, curve `secp256r1` / NIST P-256) inside the **Android Keystore system**.
   - The private key is non-exportable and never leaves the hardware Trusted Execution Environment (TEE) or StrongBox chip.
   - The public key is exported and serves as the permanent cryptographic identity of the device (`devicePublicKey`).
2. **Challenge-Response Pairing Protocol:**
   - When the Web Dashboard creates a pairing session, it generates a cryptographically secure 256-bit random challenge (`challengeNonce`) using `window.crypto.getRandomValues()`.
   - The challenge is stored in the session document and embedded into the QR code payload.
   - The QR code contains:
     ```json
     {
       "v": 1,
       "sid": "7b8d3a1f-4c2e-4b92-91a5-8e3b7c2a1e0f",
       "uid": "VX_9a8b7c6d5e4f3a2b1c",
       "cn": "a8f3b4c1d2e9f0a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
       "pin": "849201",
       "exp": 1794012600000
     }
     ```
   - When Android scans the QR code, it signs the challenge buffer:
     $$\text{payload} = \text{SHA-256}(\text{challengeNonce} \parallel \text{sessionId} \parallel \text{ownerUid} \parallel \text{deviceId})$$
     $$\text{signature} = \text{ECDSA\_Sign}(\text{privateKey}, \text{payload})$$
   - Android submits:
     - `claimedByDeviceId`: Device UUID
     - `devicePublicKey`: Base64 DER encoded public key
     - `signature`: Base64 encoded ECDSA signature
3. **Verification Boundary: Rules vs. Client:**
   - **What Firestore Rules Enforce:**
     - Path isolation (`request.auth.uid == userId`)
     - State machine transition (`resource.data.status == 'pending' -> request.resource.data.status == 'claimed'`)
     - Server timestamp expiration (`request.time < resource.data.expiresAt`)
     - Immutable field preservation (`ownerUid`, `createdAt`)
     - Single-use consumption (once claimed, no further claims can be submitted)
   - **What the Web Client Enforces:**
     - Because Firestore Security Rules do **not** possess cryptographic verification primitives (rules cannot verify ECDSA signatures or parse ASN.1/DER public keys), **the Web Dashboard verifies the signature using the Web Crypto API (`window.crypto.subtle.verify`)** upon receiving the `claimed` snapshot.
     - If the signature verification fails, the Web Dashboard immediately flags the session as corrupted, revokes the device registration, and rejects pairing.

---

## 2. Same-Account Pairing Security Analysis

In VIRUX, both the Web Dashboard and Android device authenticate under the same Firebase UID (`request.auth.uid`). This introduces specific trust-boundary realities that must be clearly stated:

### Threat Scenario Analysis

| Threat Scenario | Attacker Action | System Defense & Real-world Outcome |
| :--- | :--- | :--- |
| **Authenticated Rogue Script Claims Another Session** | An attacker who stole account credentials runs a script under that UID to claim an active QR session. | **Outcome:** The attacker *can* update the session document because they possess the user's Auth token. However, to pass verification on the victim's Web Dashboard, the attacker must provide a public key and valid signature. If they provide their own key, the Web Dashboard accepts *their* rogue client as a paired device. **Defense:** Pairing is not a defense against compromised user credentials; user account security depends on Firebase Auth (MFA, password hygiene). |
| **Client Reads Session to Extract Pairing Secret** | A client reads `/users/{uid}/pairingSessions/{sessionId}` to extract secrets. | **Outcome:** The pairing secret (`challengeNonce`) is readable by any client authenticated with that UID. However, reading `challengeNonce` does not allow impersonating the real Android hardware unless the attacker also steals the hardware-backed private key (which is impossible via software extraction from the Android Keystore). |
| **User/Emulator Registers a Fake Device** | A modified APK or script writes spoofed hardware metadata (e.g. claiming to be a "Samsung Galaxy S24" on Android 15 instead of an emulator). | **Outcome:** **Allowed by Firestore.** Without Google Play Integrity API or a trusted attestation backend, Firestore security rules cannot verify whether the reporting hardware is physical silicon or an emulator. The Web Dashboard displays whatever metadata the authenticated client wrote into its own registry. |
| **Heartbeat Spoofing** | A rogue script writes `lastSeen: request.time` repeatedly to keep a fake device online. | **Outcome:** Rules enforce `request.resource.data.lastSeen == request.time` (the attacker cannot forge a future or past timestamp), but they *can* keep sending heartbeats. This only impacts the user's own dashboard telemetry. |
| **Session Reuse / Replay** | An attacker captures an expired or already-claimed QR payload and attempts to claim it again. | **Outcome:** **Hard-blocked by Firestore Rules.** Firestore rules assert `resource.data.status == 'pending' && request.time < resource.data.expiresAt`. Any claim against a non-pending or expired document is rejected at the database engine level. |

---

## 3. Firestore Rules & Write Atomicity

### Can Firestore Rules Guarantee Cross-Document Atomicity?
- **The Engine Reality:** Firestore client SDKs provide `runTransaction` and `writeBatch`, ensuring that multiple writes succeed or fail atomically on the database engine.
- **The Security Rules Reality:** Firestore security rules evaluate operations on a **per-document** basis. While rules on `/devices/{deviceId}` could inspect `/pairingSessions/{sessionId}` using `get()`, rules do not natively guarantee that Document A and Document B were submitted in the *same batch* without complex transactional dependency.
- **Enforcement Architecture:**
  - Client-side code executes the claim as an **atomic Firestore transaction**:
    1. Read `users/{uid}/pairingSessions/{sessionId}`
    2. Check `status == 'pending'` and `now < expiresAt`
    3. Update `users/{uid}/pairingSessions/{sessionId}` with `status = 'claimed'`, `claimedByDeviceId`, `devicePublicKey`, `signature`
    4. Set `users/{uid}/devices/{deviceId}` with device profile and `createdAt = serverTimestamp()`
  - If either write violates security rules or network fails, the entire transaction rolls back.
  - Independently, the security rule on `pairingSessions` prevents double-claiming, and the rule on `devices` enforces field allowlists.

### Narrowly Scoped Phase 4 Firestore Rules
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // ─── Users Profile (Hardened in Phase 3) ──────────────────
    match /users/{userId} {
      allow read: if isOwner(userId);
      allow create: if isOwner(userId);
      allow update: if isOwner(userId);
      allow delete: if false;

      // ─── Pairing Sessions Subcollection ─────────────────────
      match /pairingSessions/{sessionId} {
        allow read: if isOwner(userId);

        // Web creates pairing session
        allow create: if isOwner(userId)
          && request.resource.data.keys().hasOnly([
            'sessionId', 'ownerUid', 'pin', 'challengeNonce',
            'status', 'createdAt', 'expiresAt',
            'claimedByDeviceId', 'devicePublicKey', 'signature', 'claimedAt'
          ])
          && request.resource.data.sessionId == sessionId
          && request.resource.data.ownerUid == userId
          && request.resource.data.status == 'pending'
          && request.resource.data.createdAt == request.time
          && request.resource.data.expiresAt > request.time;

        // Android claims session (or Web cancels it)
        allow update: if isOwner(userId)
          && resource.data.status == 'pending'
          && request.time < resource.data.expiresAt
          && (
            // Claim by Android device
            (request.resource.data.status == 'claimed'
             && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
               'status', 'claimedByDeviceId', 'devicePublicKey', 'signature', 'claimedAt'
             ])
             && request.resource.data.claimedAt == request.time)
            ||
            // Cancellation by Web user
            (request.resource.data.status == 'revoked'
             && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'revokedAt']))
          );

        allow delete: if isOwner(userId);
      }

      // ─── Registered Devices Subcollection ────────────────────
      match /devices/{deviceId} {
        allow read: if isOwner(userId);

        // Android registers device upon pairing
        allow create: if isOwner(userId)
          && request.resource.data.keys().hasOnly([
            'deviceId', 'ownerUid', 'deviceName', 'deviceType', 'manufacturer',
            'model', 'androidVersion', 'sdkVersion', 'appVersion', 'devicePublicKey',
            'createdAt', 'lastSeen', 'batteryLevel', 'isCharging', 'networkType',
            'capabilities', 'revokedAt'
          ])
          && request.resource.data.deviceId == deviceId
          && request.resource.data.ownerUid == userId
          && request.resource.data.createdAt == request.time
          && request.resource.data.lastSeen == request.time;

        // Heartbeat or metadata update
        allow update: if isOwner(userId)
          && request.resource.data.deviceId == resource.data.deviceId
          && request.resource.data.ownerUid == resource.data.ownerUid
          && request.resource.data.createdAt == resource.data.createdAt
          && request.resource.data.devicePublicKey == resource.data.devicePublicKey
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            'deviceName', 'lastSeen', 'batteryLevel', 'isCharging', 'networkType',
            'capabilities', 'revokedAt'
          ])
          && (
            !request.resource.data.diff(resource.data).affectedKeys().hasAny(['lastSeen'])
            || request.resource.data.lastSeen == request.time
          );

        // Unpair / deletion
        allow delete: if isOwner(userId);
      }
    }

    // ─── Default Lock: All other collections denied ───────────
    match /{document=**} {
      allow read, write: if false;
    }

  }
}
```

---

## 4. Heartbeat Architecture & Android 15 Execution Constraints

### Removal of Client-Supplied "status"
The field `status: 'online'` has been **removed** from the device schema. Clients are prohibited from declaring themselves authoritative regarding presence. 

Instead, the only stored heartbeat metric is:
`lastSeen: FieldValue.serverTimestamp()`

The Web Dashboard deterministically derives presence using a sliding window:
$$\text{isOnline} = (\text{now} - \text{lastSeen} < \text{THRESHOLD})$$

### Android 15 (API 35) Execution Realities
On modern Android versions, running a persistent background heartbeat faces strict OS power management:

1. **Foreground Service Restrictions (Target SDK 35):**
   - Android 14/15 requires declaring a specific foreground service type (`android:foregroundServiceType="dataSync"`).
   - The service must display a persistent, non-dismissible user notification.
   - Google Play policy restricts `dataSync` to user-initiated tasks. Using it for standing 24/7 pings risks Google Play review rejection unless user-toggleable and clearly justified.
2. **Doze Mode & App Standby:**
   - When the device is unplugged and stationary with screen off, Android enters deep Doze mode.
   - Network access is suspended and coroutine timers are throttled. WorkManager and AlarmManager wakeups are grouped into maintenance windows that may fire only every 10–15 minutes.
3. **Low Memory Killer (LMK):**
   - Under heavy memory pressure, Android terminates foreground services, stopping heartbeat coroutines until the user relaunches the app.
4. **Why 90-Second Offline Detection Cannot Always Be Promised:**
   - Cellular handovers, elevator rides, or dead zones drop sockets without sending a disconnect signal.
   - If a phone in deep Doze skips a 45-second ping, a 90-second threshold will trigger a false-positive "offline" status while the phone is actually powered on.
   - **Recommended Architecture:**
     - Heartbeat interval when app is active/foregrounded: **45 seconds**.
     - Heartbeat interval when app is backgrounded (WorkManager): **15 minutes** (standard Android minimum).
     - Dashboard threshold:
       - Displays "Active now" (< 2 minutes)
       - Displays "Idle / Background" (2–15 minutes)
       - Displays "Offline" (> 15 minutes)
       - Displays exact relative time: `"Last seen 3 minutes ago"`.

---

## 5. Privacy & Telemetry Minimization

To respect user privacy and avoid requesting sensitive Android permissions:

| Telemetry Metric | Necessity | Privacy Impact & Permission Required | Architectural Decision |
| :--- | :--- | :--- | :--- |
| **Wi-Fi SSID** | Low | **High Privacy Risk.** Android 10+ requires `ACCESS_FINE_LOCATION` and active GPS Location to read SSID. | **DROPPED.** We will not request Location permission for a device manager. |
| **Network Type** | Medium | **Zero Permission.** Derived via `ConnectivityManager.getNetworkCapabilities()` (`TRANSPORT_WIFI`, `TRANSPORT_CELLULAR`, `TRANSPORT_ETHERNET`). | **KEPT.** General network type only (`"Wi-Fi"` or `"Cellular"`). |
| **IP Address** | Optional | Low (Local subnet IP only, e.g. `192.168.1.x`). Useful for Phase 5 direct P2P. | **OPTIONAL & NULLABLE.** Null by default; populated only during active local Wi-Fi transfers. |
| **Battery Level & Charging** | High | **Zero Permission.** Read via standard system broadcast `Intent.ACTION_BATTERY_CHANGED`. | **KEPT.** User utility to know phone charge level from PC. |
| **Model & Manufacturer** | High | **Zero Permission.** Read from `Build.MANUFACTURER` and `Build.MODEL`. | **KEPT.** Essential for device identification in dashboard cards. |
| **OS & SDK Version** | High | **Zero Permission.** Read from `Build.VERSION.RELEASE` and `Build.VERSION.SDK_INT`. | **KEPT.** Essential for compatibility and feature toggling. |

---

## 6. Firebase Spark Plan Constraints & Boundaries

- **No Cloud Functions:** We cannot run server-side cryptographic verification or automatic document cleanup on token expiration.
- **No Background Sweeper:** Expired pairing sessions remain in Firestore until overwritten or cleaned up by the client.
- **No Cascade Deletion:** When a user unpairs a device, the client must perform the deletion directly.
- **Client Signature Verification:** Asymmetric signature verification must run client-side on the Web Dashboard using Web Crypto.

---

## 7. Next Step

Awaiting your review and explicit approval of this revised architecture and [`docs/PHASE_4_SECURITY_LIMITATIONS.md`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/docs/PHASE_4_SECURITY_LIMITATIONS.md) before writing any implementation code.
