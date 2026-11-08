# VIRUX — Phase 4, Step 4.3 Security Report
# WebRTC Peer Connection & Screen Mirroring Security Architecture

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Firebase Project ID:** `virux-504a5`  

---

## 1. Threat Model & Security Scope

Phase 4, Step 4.3 introduces runtime peer-connection management and Android screen-capture integration. The threat vectors addressed include:
1. **Unconsented Screen Capture / Background Surveillance:** Malicious actors or unauthorized scripts attempting to capture the Android display without the user's knowledge.
2. **Foreground Service Spoofing:** Attempting to start a screen mirroring service without obtaining user consent or without displaying an ongoing notification.
3. **Session Hijacking & MITM:** Intercepting SDP payloads or tampering with DTLS fingerprints.
4. **Zombie Media Streams:** WebRTC UDP sockets remaining open after device unpairing or session expiration.
5. **Overlapping Security Rules Injection:** Tampering with Firestore rules to bypass parent device checks.

---

## 2. Security Controls & Mitigations

### 2.1 Android 14/15 MediaProjection Consent Invariants
- **Non-Bypassable OS System Prompt:** Android's `MediaProjectionManager.createScreenCaptureIntent()` produces an operating-system level dialog ("Start recording or casting with VIRUX?"). No app code or background thread can bypass or automatically accept this dialog.
- **Token Verification:** `ViruxScreenMirrorService` requires a valid `resultCode` and `resultData` intent token passed from the user's manual grant. If absent or invalid, the service immediately calls `stopSelf()`.
- **Foreground Service Type:** Android 14+ strictly requires `android:foregroundServiceType="mediaProjection"`. Invoking `startForeground()` without user consent throws a fatal `SecurityException`.
- **Persistent Notification:** An un-dismissible ongoing notification is displayed in the Android system tray while mirroring is active. The user is provided an immediate "Stop Mirroring" action to revoke access instantly.
- **System Callback Hooks:** `mediaProjection.registerCallback()` immediately tears down the virtual display and stops the service if the user revokes casting from the Android system settings.

### 2.2 Transport-Level Encryption (DTLS-SRTP)
- In WebRTC, peer-to-peer media streams are authenticated and encrypted end-to-end via **DTLS** (Datagram Transport Layer Security) and **SRTP** (Secure Real-time Transport Protocol).
- Media packets travel directly between peer IP sockets and are never transmitted through, inspected by, or stored in Firebase.
- No cryptographic private keys or tokens are stored in Cloud Firestore.

### 2.3 Firestore Rules & Tenant Isolation Preservation
- Security rules established in Step 4.2 remain unchanged.
- Path isolation: `/users/{userId}/devices/{deviceId}/signaling/{sessionId}` ensures that only the authenticated device owner (`request.auth.uid == userId`) can create or participate in signaling.
- Revocation checks: Every signaling operation asserts `get(/.../devices/{deviceId}).data.revokedAt == null`.
- 120-second TTL: Strict server-evaluated expiry prevents zombie or replayed sessions.

### 2.4 Client-Side Teardown & Socket Boundaries
- Cloud Firestore rules govern database operations, but cannot physically terminate established OS network sockets.
- **Mitigation:** Both `WebRtcPeerConnectionService` and `PeerConnectionManager` observe Firestore session state changes via snapshot listeners. If a session transitions to `closed`, `revoked`, or `expired`, the clients immediately execute local teardown:
  - Web: invokes `peerConnection.close()` and stops media tracks.
  - Android: invokes `peerConnectionManager.close()`, releases `VirtualDisplay`, calls `mediaProjection.stop()`, and cancels foreground notifications.

---

## 3. Security Compliance Declaration

- [x] **Zero Paid Infrastructure:** Free Spark Tier maintained; no TURN relays or Cloud Functions provisioned.
- [x] **Zero Production Rule Deployment:** Rules tested exclusively on local emulator `127.0.0.1:8080`.
- [x] **Privacy Preservation:** Screen capture cannot start silently; explicit user consent is enforced by Android OS.
- [x] **No File Transfer Code:** File streaming, downloads, and storage activation are strictly excluded from Step 4.3.

