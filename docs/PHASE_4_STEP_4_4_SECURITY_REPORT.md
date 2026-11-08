# VIRUX — Phase 4, Step 4.4 Security Report
## Screen Mirroring Security Architecture & Threat Analysis

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  
**Firebase Project ID:** `virux-504a5`  
**Status:** Complete  

---

## 1. Security Architecture Principles

Screen mirroring is an exceptionally sensitive capability because it grants access to the visual display of the handset. The VIRUX Step 4.4 implementation adheres to the following strict defense-in-depth security principles:

1. **Explicit Multi-Tier Consent:**
   - Tier 1: User must sign in with authenticated Firebase account.
   - Tier 2: The device must be an active, verified, un-revoked paired hardware device.
   - Tier 3: The Android handset displays an in-app confirmation modal whenever a web session requests screen sharing.
   - Tier 4: The Android operating system presents the official `MediaProjectionManager` system confirmation dialog ("VIRUX will start capturing everything displayed on your screen").
   - Capture cannot start without explicit user confirmation at both the app and OS level.

2. **Zero Hidden Background Capture:**
   - Under Android 14 (API 34) and Android 15 (API 35), `MediaProjection` requires an active foreground service of type `mediaProjection`.
   - `ViruxScreenMirrorService` starts foreground immediately with an ongoing, non-dismissible system notification (`setOngoing(true)`).
   - The notification clearly displays "Screen Mirroring Active — VIRUX" and provides an instant "Stop Mirroring" button.

3. **Single-Use Token & Anti-Reuse Protection:**
   - Android 14 enforces that `MediaProjection` intent tokens can only be used once.
   - VIRUX never persists the `resultData` intent to SharedPreferences, disk, or memory cache.
   - The token is passed directly and solely to `ScreenCapturerAndroid`.
   - References are nullified immediately upon session teardown.

4. **Zero Remote Control & No Input Injection:**
   - Step 4.4 implements unidirectional video transmission only.
   - No accessibility services, touch injection, keyboard emulation, or remote input protocols are implemented or permitted.

5. **Transport Security (DTLS-SRTP):**
   - Media frames never pass through Google servers or third-party cloud relays.
   - WebRTC establishes peer-to-peer UDP channels with DTLS handshake (ECDSA/RSA certificates) and SRTP payload encryption.
   - Only the authenticated browser and device possess the session keys negotiated over DTLS.

---

## 2. Threat Modeling & Mitigation Matrix

| Threat | Risk Level | Mitigation in Step 4.4 |
| :--- | :--- | :--- |
| **Unauthorized screen capture from web** | Critical | Requires authenticated Firebase Auth token, device ownership match in Firestore, active pairing, and explicit physical touch approval on the handset OS dialog. |
| **Background / covert surveillance** | Critical | Foreground service type `mediaProjection` required; Android OS displays active screen capture icon in status bar; persistent notification displays "Stop Mirroring" action. |
| **Token reuse / replay attacks** | High | Consent intent is non-reusable under Android 14/15; consumed only once by `ScreenCapturerAndroid`; never serialized or saved to storage. |
| **Stale or orphaned signaling sessions** | Medium | Firestore rules enforce strict 120-second session expiry (`request.time < resource.data.expiresAt`). Sessions cannot be extended. |
| **Eavesdropping on display stream** | High | Media packets are transmitted via direct P2P UDP encrypted end-to-end with DTLS-SRTP; no cloud intermediary can decrypt frames. |
| **Sensitive content in logs** | Medium | No SDP encryption keys, private credentials, or frame buffers are written to logcat or console. |

---

## 3. Residual Teardown Limitations

> [!WARNING]
> Cloud Firestore Security Rules enforce access to the signaling metadata documents, but Firestore rules **cannot directly terminate an already-established WebRTC UDP socket**.
> 
> When a session expires (after 120s) or is marked `revoked`/`closed` in Firestore:
> 1. Both the Android client (`PeerConnectionManager`) and Web Dashboard (`useScreenMirrorSession`) maintain real-time snapshot listeners on the signaling session document.
> 2. When the session reaches a terminal state (`isTerminal == true`), both clients cooperatively invoke their local `close()` / `dispose()` methods, shutting down the `RTCPeerConnection`, stopping `ScreenCapturerAndroid`, and releasing the `VirtualDisplay`.
> 3. If a malicious client disconnects from Firestore while maintaining a direct UDP stream, the native Android `MediaProjection.Callback` and ongoing notification ensure the user retains complete local control to press "Stop Mirroring" on the handset at any time.

