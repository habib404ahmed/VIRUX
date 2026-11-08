# VIRUX — Phase 4, Step 4.1: Screen Mirroring & File Transfer Architecture & Feasibility Audit (Corrected)

> **Project:** VIRUX — Your Devices. One Ecosystem.  
> **Android Package:** `com.virux.app` (`compileSdk 35`, `minSdk 26`, `targetSdk 35`)  
> **Firebase Project:** `virux-504a5` (Firebase Spark Free Tier)  
> **Audit Phase:** Phase 4, Step 4.1 (Audit & Technical Design Only — No Implementation Code Modified)  
> **Revision:** 2.0 (Technical Audit Corrections Applied)  
> **Date:** November 8, 2026  

---

## 1. Executive Summary & Audit Scope

This document provides a technical feasibility, architecture, and constraints audit for the implementation of:
1. **Low-Latency Android Screen Mirroring** to the VIRUX Web Dashboard.
2. **Secure Bidirectional File Transfer** between the Android Native Application and the VIRUX Web Dashboard.

### Core Architectural Boundaries:
- **Zero-Cost Core Architecture:** The initial implementation must operate strictly within the free **Google Firebase Spark Tier**.
- **Transport Independence:** During a successful direct peer-to-peer (P2P) WebRTC connection, **all video frames, audio tracks, and file payloads bypass Firebase entirely**, travelling directly across peer sockets.
- **Signaling Quota Realities:** Cloud Firestore acts purely as a signaling intermediary for session negotiation (SDP Offer/Answer and ICE candidates). Firestore reads, writes, and metadata operations **do** consume standard Firestore quota and must be strictly controlled to prevent quota exhaustion.
- **P2P-Only Initial Scope:** The baseline VIRUX implementation is strictly direct P2P. No TURN relay or cloud storage bucket is activated. Where direct P2P connectivity cannot be established, the system fails gracefully with transparent user-facing diagnostics.

---

## 2. Part A — Screen Mirroring Architecture Deep Dive

### 2.1 Android Screen Capture: `MediaProjection` API & Lifecycle

Android captures device screen content via the [`android.media.projection.MediaProjection`](https://developer.android.com/reference/android/media/projection/MediaProjection) subsystem.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Android OS MediaProjection                      │
├────────────────────────────┬─────────────────────────────┬─────────────┤
│ User Prompts (System UI)   │ MediaProjection Token       │ Virtual     │
│ Consent Dialog             │ ActivityResult / Intent     │ Display     │
│ "Share single app or screen"│ Passed to ForegroundService │ -> Surface │
└────────────────────────────┴─────────────────────────────┴─────────────┘
```

#### Detailed Capture Flow:
1. **Initiation:** The user requests or confirms screen mirroring in the VIRUX application.
2. **System Consent Intent:** The app invokes `MediaProjectionManager.createScreenCaptureIntent()`.
3. **User Confirmation Dialog:** The Android operating system renders a secure, un-bypassable system dialog displaying: *"Start recording or casting with VIRUX?"*
4. **Token Reception:** The user's explicit grant returns an `Intent` containing a `MediaProjection` token to `ActivityResultLauncher.onSuccess`.
5. **VirtualDisplay Creation:** The token is passed to a dedicated foreground service that invokes `mediaProjection.createVirtualDisplay(...)`, binding the virtual display to a hardware-accelerated video input `Surface` provided by the WebRTC video capturer.

---

### 2.2 Android 14 (API 34) and Android 15 (API 35) Restrictions

Because `compileSdk` and `targetSdk` are set to **35** (`com.virux.app`), modern Android foreground service execution rules apply strictly:

1. **Mandatory Foreground Service Type:**
   - Manifest must declare:
     ```xml
     <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
     <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
     ```
   - Service declaration:
     ```xml
     <service
         android:name=".service.ViruxScreenMirrorService"
         android:exported="false"
         android:foregroundServiceType="mediaProjection" />
     ```
2. **Strict Launch Order (Android 14+):**
   - Under Android 14+, `Service.startForeground()` with `FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION` **must be called only after** the user has granted consent through `createScreenCaptureIntent()` and the `Intent` result has been received.
   - Calling `startForeground()` without prior consent or before receiving the result throws a fatal `SecurityException`.
3. **Single App vs. Full Device Sharing (Android 14/15):**
   - Android 14 introduced partial screen sharing (sharing a single task/app window vs the entire device display).
   - If the user selects a single app, the `VirtualDisplay` captures only that application. If that app is minimized, the stream renders a blank surface.
   - Android 15 (API 35) further requires handling `MediaProjection.Callback.onStop()` and `onCapturedContentVisibilityChanged()` when the captured window changes visibility.
4. **No Background Projection Launches:**
   - A remote command from the Web Dashboard (e.g. via Firestore or FCM) **cannot** unilaterally initiate screen capture in the background. The Android device must display the system consent prompt in the foreground.

---

### 2.3 WebRTC Video Streaming & Transport Encryption

WebRTC provides real-time peer-to-peer audio and video transmission with low latency over UDP.

#### Codec Selection & Hardware Acceleration:
- **H.264 (AVC Baseline/Main Profile):**
  - Supported in Android hardware encoders (`MediaCodec`) across Qualcomm, MediaTek, Exynos, and Google Tensor chipsets.
  - Native hardware-accelerated decoding across all modern browsers (Chrome, Edge, Safari, Firefox).
  - Recommended default for VIRUX screen mirroring.
- **VP8 / VP9:**
  - Standard open fallback codecs supported natively in Chromium and WebRTC native code.

#### Resolution, Orientation & Frame Rate Management:
- **Dynamic Resolution Scaling:**
  - Recommended baseline: `720p` (`720x1600` portrait or `1280x720` landscape) at 30 fps (target bitrate: 2.0 – 3.5 Mbps).
  - High resolution (1080p+) can be negotiated dynamically if network conditions and device thermals permit.
- **Orientation Switches:**
  - When the user rotates their phone, Android triggers configuration changes. The `VirtualDisplay` must be reconfigured with matching dimensions, or the video track adapts its aspect ratio dynamically using WebRTC video constraints.
- **Battery & Thermal Mitigation:**
  - Screen capture + hardware encoding + radio transmission generates significant thermal load.
  - Frame rate should automatically drop from 30 fps to 15 fps if the device reports high battery temperature or low battery (< 20%).

#### Transport Encryption (DTLS & SRTP):
- WebRTC enforces end-to-end transport encryption via **DTLS** (Datagram Transport Layer Security) and **SRTP** (Secure Real-time Transport Protocol).
- **Dynamic Negotiation Reality:** Specific cipher suites (e.g., `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256`, `AES_CM_128_HMAC_SHA1_80`) and DTLS versions (DTLS 1.2 vs 1.3) are **dynamically negotiated** during the peer handshake between the Android WebRTC native engine and the browser's WebRTC implementation.
- **Verification Strategy During Implementation:**
  - Do not hardcode or guarantee a static cipher suite in architecture documentation.
  - During Step 4.4 and Step 4.7 testing, negotiated parameters must be inspected programmatically via `peerConnection.getStats()`:
    ```typescript
    const stats = await peerConnection.getStats()
    stats.forEach((report) => {
      if (report.type === 'transport') {
        console.log('DTLS Version:', report.tlsVersion)
        console.log('DTLS Cipher:', report.dtlsCipher)
        console.log('SRTP Cipher:', report.srtpCipher)
      }
    })
    ```
  - Test assertions must verify that a valid secure cipher suite is active before streaming proceeds.

---

### 2.4 NAT Traversal, STUN Discovery, and TURN Requirements

Establishing a peer-to-peer WebRTC connection across the internet requires navigating Network Address Translation (NAT) and firewall boundaries using the Interactive Connectivity Establishment (ICE) protocol.

```
                     ┌──────────────────────────────┐
                     │     Google Public STUN       │
                     │ (stun:stun.l.google.com:19302│
                     └──────────────┬───────────────┘
                                    │ STUN Binding Requests
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       ┌─────────────────────────┐     ┌─────────────────────────┐
       │     Android Device      │     │      Web Dashboard      │
       │   Behind Home Router    │     │   Behind Office Router  │
       │         (NAT A)         │     │         (NAT B)         │
       └────────────┬────────────┘     └────────────┬────────────┘
                    │                               │
                    │   Direct STUN Connectivity    │
                    │   Checks (UDP Binding Pings)  │
                    └═══════════════════════════════┘
                    IF SUCCESSFUL: Direct P2P Media Stream
                    IF FAILED: ICE Connection State -> 'failed'
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │   Optional TURN Relay        │
                     │ (Requires separate paid host)│
                     └──────────────────────────────┘
```

#### Detailed ICE Connectivity Lifecycle:
1. **STUN Discovery & Candidate Gathering:**
   - Each peer contacts a public STUN server (e.g. `stun:stun.l.google.com:19302`).
   - STUN servers reflect the peer's public-facing IP and port mapping back to the client.
   - The client gathers three candidate types:
     - `host`: Local interface addresses (e.g., `192.168.1.50`, used for direct LAN communication).
     - `srflx` (Server Reflexive): Public IP and port allocated by the NAT router discovered via STUN.
     - `prflx` (Peer Reflexive): Addresses discovered during direct connectivity checks.
2. **Direct P2P Connectivity Checks:**
   - Peers exchange their gathered candidates via Cloud Firestore signaling.
   - Once candidates are paired, the peers send direct STUN binding requests to each other across the network to find a valid bidirectional UDP path.
3. **ICE Failure Detection:**
   - Both Web and Android WebRTC stacks monitor connection progress via `iceConnectionState`:
     `new -> checking -> connected / completed`.
   - If NAT configurations prevent direct hole-punching (for instance, when both endpoints sit behind Symmetric NATs or Carrier-Grade NAT (CGNAT) on cellular networks), the connectivity checks timeout.
   - The state transitions to `disconnected` and ultimately `failed` (`peerConnection.oniceconnectionstatechange`).
4. **Graceful Retry & User-Facing Failure States:**
   - When `iceConnectionState === 'failed'`, VIRUX will:
     - Attempt one automatic ICE restart (`peerConnection.restartIce()`).
     - If the restart fails, gracefully terminate the session, close the `MediaProjection` service, and display a clear diagnostic state in the Web Dashboard:
       *"Direct peer-to-peer connection could not be established across your current network configurations. Ensure both devices are on the same Wi-Fi network, or connect via a network that permits direct UDP traffic."*
5. **Optional TURN Relay Requirements & Costs:**
   - A TURN (Traversal Using Relays around NAT) server acts as an intermediary relay for media packets when direct P2P fails.
   - **Spark Plan Limitation:** Firebase **does not provide a TURN server**.
   - **Operational Cost:** TURN servers relay heavy raw media (video streams consume 1–2 GB/hour). Managed TURN providers (such as Twilio, Xirsys, or Cloudflare Calls) charge per-GB egress ($0.02 – $0.05 / GB), and self-hosted Coturn servers require dedicated VPS hosting ($5–$20/month).
   - **Initial Policy:** The initial VIRUX implementation **remains strictly P2P-only**. TURN relay is documented as an optional future enhancement requiring separate user-provided credentials or a paid cloud configuration.

---

## 3. Part B — File Transfer Architecture Deep Dive

### 3.1 Comparison of Transfer Approaches & Firebase Storage Reality

| Criterion | 1. Direct WebRTC DataChannels (RECOMMENDED) | 2. Firebase Storage (`gs://`) | 3. Dedicated HTTP Backend Server |
| :--- | :--- | :--- | :--- |
| **Transport Model** | Direct P2P over SCTP (`RTCDataChannel`) | Cloud upload & download | Client -> Server -> Client |
| **Firebase Spark Compatibility** | **100% Free** (Only signaling touches Firestore) | **Not Guaranteed on Modern Free Tiers** | **Requires external hosting** (VPS or Cloud Functions) |
| **Bandwidth Consumption** | **Zero Firebase bandwidth** (transfers direct P2P) | Consumes Firebase Storage upload & download quota | Consumes server bandwidth |
| **User Privacy** | **Maximum** (Zero cloud retention; files never touch remote disks) | Files reside on Google cloud buckets until deleted | Files reside on intermediary server disks |
| **File Size Limits** | Unlimited (memory-buffered chunking) | Spark free limit quickly exhausted by multi-GB transfers | Limited by server disk quota |
| **Offline Buffering** | Requires both devices online simultaneously | Recipient can download hours/days later | Recipient can download hours/days later |
| **Operating Cost** | **\$0.00 / month** | Requires Blaze plan verification for production buckets | \$5.00 – \$25.00+ / month for compute & egress |
| **NAT Fallback Requirement** | Fails on strict NAT without TURN | Always works (direct HTTPS to Google servers) | Always works (direct HTTPS to server) |

#### Firebase Storage Eligibility Clarification:
- Historical Firebase documentation cited a free 5 GB storage allowance on Spark. However, in modern Firebase projects, creating a Cloud Storage default bucket frequently requires upgrading to the **Blaze (Pay-As-You-Go)** plan or completing cloud billing verification.
- **VIRUX Policy:** Firebase Storage will **not** be activated, and the project will **not** be upgraded to Blaze. Direct P2P WebRTC DataChannel is the sole approved baseline architecture for file transfer.

---

### 3.2 WebRTC DataChannel Protocol & Signaling Traffic Control

Direct peer-to-peer file transfer over WebRTC utilizes SCTP-based [`RTCDataChannel`](https://developer.android.com/reference/android/webrtc/RTCDataChannel).

#### Controlling Firestore Signaling Traffic (ICE Candidate Volume):
- **Issue:** A naive WebRTC implementation writes each gathered ICE candidate as an individual Firestore document in real-time ("trickle ICE"). A single peer can gather 5 to 15 candidates across multiple interfaces (IPv4, IPv6, Wi-Fi, cellular, VPN). Two peers exchanging candidates individually could generate 20 to 40 Firestore document writes per session attempt, quickly eating into Spark's 20,000 writes/day quota.
- **Traffic Control Architecture:**
  1. **Candidate Batching:** Rather than individual candidate documents, ICE candidates are accumulated locally and written as a bounded array within the session document or in a single consolidated subcollection document.
  2. **Debounce Interval:** Candidates are flushed in batches with a 250ms debounce window.
  3. **Candidate Limiting:** Non-functional or duplicate candidate types (e.g. redundant link-local IPv6 addresses) are pruned before writing to Firestore.

#### DataChannel Chunking Protocol:
- **Chunk Sizing:** 64 KB per binary frame. Fits within standard WebRTC SCTP buffer limits without triggering IP fragmentation.
- **Flow Control & Backpressure:**
  - Senders monitor `dataChannel.bufferedAmount`.
  - If `bufferedAmount > 4 MB`, sending is paused until `onbufferedamountlow` fires (threshold set to 1 MB).
- **Integrity Verification:**
  - Sender computes SHA-256 hash across the entire file before transmission.
  - Receiver writes chunks incrementally to temporary storage while calculating an incremental SHA-256 digest.
  - Upon completion, the received digest must match the sender's announced hash exactly.

---

### 3.3 Android Storage Access Framework (SAF) & File Security

#### Android Storage Access Framework Realities:
- **Scoped Storage Compliance:** Modern Android versions (API 29–35) forbid raw `/sdcard/` file access. VIRUX uses the Storage Access Framework (SAF) via `ActivityResultContracts.OpenDocument` and `CreateDocument`.
- **SAF Limitations to Address:**
  - `ContentResolver` streams cannot be treated as seekable `java.io.File` descriptors. Transfers must read/write via sequential `InputStream` and `OutputStream`.
  - Content URI access grants can expire if not persisted (`takePersistableUriPermission`).
  - Reading from slow content providers (e.g. cloud-backed SAF providers) can block threads; all I/O must run strictly on `Dispatchers.IO`.

#### Robust Unicode Filename Sanitization:
Previous audit drafts suggested a crude ASCII whitelist (`^[a-zA-Z0-9._-]+$`), which destructively renames legitimate user files in non-Latin scripts (e.g. `Dokumentation_München.pdf`, `プレゼンテーション.pptx`, `简历.docx`).

**Refined Sanitization Rules:**
1. **Preserve Valid Unicode:** Keep valid alphanumeric Unicode characters across international scripts, spaces, hyphens, underscores, and dots.
2. **Strip Path Traversal & Directory Separators:** Remove all forward slashes (`/`), backslashes (`\`), parent directory indicators (`../`, `..\`), and drive prefixes (`C:`).
3. **Strip Control Characters:** Remove ASCII control characters (`\x00-\x1F`, `\x7F`) and Unicode directional control characters.
4. **Reject Windows Reserved Names:** Strip or prefix reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
5. **Strip Leading / Trailing Dots and Spaces:** Prevent hidden files (`.bashrc`) or truncated Windows filenames (`file. `).
6. **Fallback Name:** If sanitization produces an empty string, fallback to `virux_transfer_<timestamp>.<ext>`.

---

## 4. Part C — Firestore Signaling Path Recommendation

### 4.1 Path Evaluation

We evaluated three potential Firestore document paths for WebRTC signaling:

1. **Option A: `/webrtcSessions/{sessionId}` (Root Collection)**
   - *Pros:* Simple flat path.
   - *Cons:* Breaks the VIRUX owner-isolation security model. Requires complex multi-tenant query rules; increases risk of cross-user information leakage.
2. **Option B: `/users/{userId}/pairingSessions/{sessionId}/signaling/{sigId}`**
   - *Pros:* Reuses pairing session structure.
   - *Cons:* Conflates pairing (a one-time device onboarding protocol) with ongoing operational sessions. Pairing sessions expire and are discarded.
3. **Option C: `/users/{userId}/devices/{deviceId}/signaling/{sessionId}` (RECOMMENDED)**
   - *Pros:*
     - Fully aligned with the Phase 4 Step 3 device ownership model.
     - Natural hierarchical ownership: the signaling session is scoped directly to the target registered hardware device.
     - Enforces device state checks: rules can verify `/users/{userId}/devices/{deviceId}` exists and has `revokedAt == null` using standard Firestore `get()` or path references.
     - Inherits `isOwner(userId)` access restrictions automatically.

### 4.2 Extending Firestore Default-Deny Rules (Future Step 4.2)
In the current approved `firebase/firestore.rules`, all collections outside `/users/{userId}`, `/users/{userId}/pairingSessions/{sessionId}`, and `/users/{userId}/devices/{deviceId}` are blocked by the catch-all:
```javascript
match /{document=**} {
  allow read, write: if false;
}
```
In a future, separately authorized implementation step (Step 4.2), this will be extended with an explicit subcollection block inside `match /devices/{deviceId}`:
```javascript
match /signaling/{sessionId} {
  // Guarded by isOwner(userId) and active device validation
}
```
**Strict Restriction:** The actual `firebase/firestore.rules` file remains **undeployed and unmodified** during this audit step.

---

## 5. Part D — Revocation & Teardown Architecture

### 5.1 Teardown State Machine

When a device is unpaired, a session is cancelled, or an error occurs, the teardown must be executed systematically across both native and web clients:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIRUX Comprehensive Teardown                    │
├────────────────────────────┬───────────────────────────────────────────┤
│ Subsystem                  │ Mandatory Teardown Actions                │
├────────────────────────────┼───────────────────────────────────────────┤
│ 1. RTCPeerConnection       │ peerConnection.close(), dispose native    │
│                            │ PeerConnectionFactory, remove listeners   │
├────────────────────────────┼───────────────────────────────────────────┤
│ 2. MediaProjection         │ mediaProjection.stop(), unregister        │
│                            │ MediaProjection.Callback, stopForeground  │
├────────────────────────────┼───────────────────────────────────────────┤
│ 3. Video Tracks & Surface  │ videoTrack.setEnabled(false),             │
│                            │ videoTrack.dispose(), surface.release()   │
├────────────────────────────┼───────────────────────────────────────────┤
│ 4. RTCDataChannels         │ dataChannel.close(), unregister observer, │
│                            │ purge memory buffers                      │
├────────────────────────────┼───────────────────────────────────────────┤
│ 5. Pending File Transfers  │ Cancel active Coroutine jobs / Web worker,│
│                            │ immediately delete partial temporary files│
├────────────────────────────┼───────────────────────────────────────────┤
│ 6. Firestore Signaling Doc │ Transition status to 'closed',            │
│                            │ delete signaling doc to release quota     │
└────────────────────────────┴───────────────────────────────────────────┘
```

### 5.2 Server-Enforced vs. Client-Side Revocation Reality

> [!WARNING]
> **Trust Boundary Notice:** Client-side Firestore listeners cannot provide absolute, server-grade instantaneous revocation against a compromised or modified client.

- **Legitimate Clients:** When a device is unpaired on the Web Dashboard, Firestore sets `revokedAt = request.time`. Both clients receive the Firestore snapshot update and immediately invoke their local teardown state machines.
- **Malicious / Modified Clients:** If an attacker modifies the Android client to ignore Firestore snapshot events, Cloud Firestore has **no mechanism to terminate an already-established direct UDP peer-to-peer socket**. Firestore rules only govern database document reads and writes; they do not control network interfaces or WebRTC UDP sockets.
- **Mitigation:**
  - The Web Dashboard immediately closes its end of the `RTCPeerConnection`. Because WebRTC is a bidirectional protocol, closing the connection at one endpoint terminates the active media and data stream immediately, regardless of what the peer does.
  - Future signaling attempts are completely blocked by Firestore rules because `resource.data.revokedAt != null`.

---

## 6. Audit Conclusions & Summary

1. **Screen Mirroring Feasibility:** Fully feasible via Android `MediaProjection` and WebRTC H.264 video tracks over direct P2P connections at zero cloud cost.
2. **File Transfer Feasibility:** Fully feasible via WebRTC SCTP `RTCDataChannel` in 64 KB chunks with incremental SHA-256 verification and SAF scoped storage integration.
3. **Firebase Spark Quota Safety:** Zero media or file bytes touch Firebase. Signaling traffic is tightly controlled via candidate batching and short TTLs (120s).
4. **P2P Baseline:** Initial implementation is strictly direct P2P. Where strict symmetric NAT prevents direct connection, the system fails gracefully with transparent user diagnostics.
5. **Rules & Code Status:** **UNTOUCHED & UNDEPLOYED.** No code has been modified and no rules have been deployed.
