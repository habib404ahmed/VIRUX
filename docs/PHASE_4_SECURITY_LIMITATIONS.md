# VIRUX — Phase 4 Security Limitations & Threat Model

> **Project:** VIRUX — *Your Devices. One Ecosystem.*  
> **Environment:** Firebase Spark (Free Tier — Zero Cloud Functions, Zero Serverless Compute)  
> **Document Status:** Architectural Security Disclosure  

---

## 1. Threat Model & Trust Boundaries

In the VIRUX Phase 4 architecture, the security perimeter is defined by three distinct execution environments:

```
+-----------------------------------------------------------------------------------------+
|                                    TRUST BOUNDARIES                                     |
+-----------------------------------------------------------------------------------------+
|  [ Web Browser (Untrusted Client) ]   <--->   [ Android Device (Semi-Trusted Client) ]  |
|          Web Crypto API                                Android Keystore (TEE)           |
+----------------------------------------+------------------------------------------------+
                                         |
                                         v
                         +-------------------------------+
                         |   [ Cloud Firestore Engine ]  |
                         |     Security Rules Language   |
                         |     (Rule Engine Boundary)    |
                         +-------------------------------+
```

### Trust Boundary Definitions:
1. **The Firestore Security Rule Engine (High Trust):**
   - Runs on Google infrastructure.
   - Evaluates boolean security expressions synchronously on incoming read/write operations.
   - Authoritative for: User authentication UID (`request.auth.uid`), server clock (`request.time`), schema field allowlists (`keys().hasOnly()`), diff inspection (`affectedKeys()`), and subcollection path isolation.
2. **Android Keystore (Medium-High Trust):**
   - Private key generation and ECDSA signing run in hardware-backed Trusted Execution Environment (TEE) or StrongBox Keymaster where supported.
   - The private key cannot be extracted or cloned via software tampering or debugging tools.
3. **Web Browser & Android App Application Memory (Low Trust):**
   - Code running in the browser and app memory is vulnerable to client-side reverse engineering, script injection, dev tools manipulation, and modified APK execution.

---

## 2. Enforced Security Guarantees vs. Client-Side-Only Checks

It is critical to distinguish between what is **cryptographically and structurally enforced at the database layer** versus what relies on **client-side verification**:

| Security Property | Layer Enforced | Enforcement Mechanism | Failure / Bypass Implication |
| :--- | :---: | :--- | :--- |
| **Cross-User Data Isolation** | **Firestore Rules** | `request.auth.uid == userId` path matching | Impossible to read or modify another user's pairing sessions or devices. |
| **Session Expiration** | **Firestore Rules** | `request.time < resource.data.expiresAt` | An expired QR code cannot be claimed even if client clocks are altered. |
| **Single-Use Session Claim** | **Firestore Rules** | `resource.data.status == 'pending' -> 'claimed'` | Replaying a QR code fails immediately at the database engine level. |
| **Device Ownership Immutability** | **Firestore Rules** | `incoming.ownerUid == current.ownerUid` | A device cannot be transferred or hijacked across accounts. |
| **Field Allowlisting** | **Firestore Rules** | `keys().hasOnly(...)` | Attackers cannot inject unauthorized metadata fields. |
| **ECDSA Challenge Signature Verification** | **Web Client Only** | `window.crypto.subtle.verify()` | **Limitation:** Firestore rules do not possess crypto verification primitives. If an attacker bypasses the Web client JS checks (e.g. via modified browser console), Firestore accepts the written public key and signature without verification. |
| **Device Silicon Authenticity** | **Client Self-Reported** | `Build.MODEL`, `Build.MANUFACTURER` | **Limitation:** A modified APK or rooted device can report any phone model or Android version. Rules cannot verify genuine physical silicon without a backend Play Integrity API verification server. |
| **Presence Verification** | **Derived on Web Client** | Sliding window on `lastSeen` server timestamp | **Limitation:** A device cannot forge `lastSeen` into the future/past (rules assert `lastSeen == request.time`), but an automated script can keep sending pings to appear online continuously. |

---

## 3. Known Attack Scenarios & Real-World Impact

### Scenario A: Attacker Eavesdrops QR Code Over the Shoulder
- **Vector:** The user displays a pairing QR code in an office or coffee shop. An attacker photographs the QR code.
- **Analysis:** The QR payload contains `sid`, `uid`, `pin`, and `challengeNonce`.
- **Result:** **ATTACK DEFEATED.** To submit a claim for `/users/{uid}/pairingSessions/{sid}`, the claiming request must present a Firebase Auth JWT where `request.auth.uid == uid`. The attacker is authenticated under their own account (or unauthenticated), so Firestore rejects the write with `PERMISSION_DENIED`.

### Scenario B: Attacker Obtains User Account Credentials (Stolen Password / Token)
- **Vector:** The attacker obtains the victim's Firebase Auth credentials and logs into a modified web or mobile client.
- **Analysis:** Because the attacker has the valid `request.auth.uid`, Firestore treats them as the authenticated owner.
- **Result:** **ACCOUNT COMPROMISED.** The attacker can view existing devices, unpair hardware, and pair their own rogue device.
- **Defense:** Device pairing is an internal hardware registry authorization, not an account authentication factor. Protection against compromised credentials relies on Firebase Auth Multi-Factor Authentication (MFA) and secure credential storage.

### Scenario C: Modified APK Claims Pairing Without Keystore Private Key
- **Vector:** An attacker intercepts a QR code on an infected phone and runs a modified client without hardware Keystore backing.
- **Analysis:** The modified client can write a software-generated public key and signature into Firestore.
- **Result:** **DETECTED & REJECTED BY WEB CLIENT.** The Web Dashboard verifies the ECDSA signature against the challenge nonce using Web Crypto. If the signature is invalid or does not match the public key, the dashboard revokes the device and displays a security alert.

### Scenario D: Battery Saver / Mobile Network Drops Delaying Heartbeats
- **Vector:** An authentic paired phone enters deep Doze mode or travels through a subway tunnel without signal.
- **Analysis:** Heartbeat coroutines are deferred by Android OS power management or socket drops.
- **Result:** **FALSE OFFLINE INDICATION.** The Web Dashboard's sliding window (e.g. 90–120s) evaluates the device as "offline". When the device reconnects or exits Doze mode, the next heartbeat restores the "online" state. This is an inherent trade-off of serverless presence on Spark.

---

## 4. Remaining Architectural Limitations Under Firebase Spark

1. **No Cryptographic Rule Primitives in Firestore:**
   Firestore rules v2 cannot verify RSA or ECDSA signatures. True end-to-end cryptographic authorization of public keys must be performed client-side on the Web Dashboard.
2. **No Hardware Attestation Verification:**
   Google Play Integrity API generates a cryptographically signed hardware attestation token that proves the app is unmodified and running on genuine, non-rooted Google Play-certified hardware. However, verifying this token requires a Google API secret key and trusted backend compute (Cloud Functions), which is forbidden on Spark.
3. **No Automated Document Garbage Collection:**
   Without Cloud Functions or Cloud Tasks, expired pairing sessions remain in Firestore unless explicitly deleted or overwritten by client logic.

---

## 5. Recommended Future Migration Path (When Backend Compute Is Available)

If VIRUX transitions in the future to a Blaze plan or dedicated container backend (e.g. Cloud Run / Go / Node.js):

```
                        [ FUTURE TRUSTED BACKEND ARCHITECTURE ]
                                          
 [ Android Keystore ] ---> (Play Integrity Token + Keystore ECDSA Signature)
                                       |
                                       v
                             [ Trusted Backend API ]
                             - Validates Google Play Integrity Attestation
                             - Verifies ECDSA signature against server challenge
                             - Writes device record with Admin SDK
                             - Schedules automated presence timeout via Cloud Tasks
```

1. **Server-Side Challenge Verification:** The backend server issues short-lived cryptographically signed challenge nonces and verifies the Android Keystore ECDSA signature using server-side OpenSSL / Web Crypto.
2. **Google Play Integrity Verification:** The server decrypts and verifies the Play Integrity verdict to ensure zero emulator or tampered APK execution.
3. **Server-Side Presence TTL via Cloud Tasks / Realtime Database Presence:** Real-time presence using Firebase Realtime Database `.info/connected` or Cloud Tasks cancellation timers for deterministic 60-second offline flipping.

---

## 6. Conclusion

Under the strict constraints of the Firebase Spark plan, the revised Phase 4 architecture represents the **highest mathematically and structurally achievable security posture**:
- Path isolation prevents any cross-user leaks.
- Single-use and expiration are hard-enforced by server timestamps in Firestore security rules.
- Hardware-backed asymmetric keys eliminate trivial token forging.
- The system is ready for review and implementation approval.

