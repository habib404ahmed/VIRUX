# VIRUX — Phase 4: Screen Mirroring & File Transfer Implementation Roadmap (Corrected)

> **Project:** VIRUX — Your Devices. One Ecosystem.  
> **Android Package:** `com.virux.app`  
> **Target Subsystems:** Screen Mirroring (WebRTC Media) & File Transfer (WebRTC DataChannel)  
> **Current Status:** Step 4.1 Completed (Audit & Roadmap Only — Implementation Not Started)  
> **Revision:** 2.0 (Technical Audit Corrections Applied)  
> **Date:** November 8, 2026  

---

## 1. Roadmap Architecture Overview

The implementation of Screen Mirroring and File Transfer is structured into **7 discrete, reviewable steps**. The baseline architecture is strictly **direct peer-to-peer (P2P)** operating on the free **Firebase Spark Tier**, with zero cloud storage activation and zero paid TURN relays.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Phase 4 Implementation Sequence                      │
├───────────────────┬────────────────────────────────────────────────────┤
│ Step 4.1 (Current)│ Architecture, Feasibility & Security Audit (DONE)  │
├───────────────────┼────────────────────────────────────────────────────┤
│ Step 4.2          │ WebRTC Signaling Foundation & Session Management   │
├───────────────────┼────────────────────────────────────────────────────┤
│ Step 4.3          │ Android MediaProjection Engine & Video Track       │
├───────────────────┼────────────────────────────────────────────────────┤
│ Step 4.4          │ Web Dashboard Live-Stream Playback Viewport        │
├───────────────────┼────────────────────────────────────────────────────┤
│ Step 4.5          │ Secure File-Transfer Protocol (WebRTC DataChannel) │
├───────────────────┼────────────────────────────────────────────────────┤
│ Step 4.6          │ Android SAF & Web File-Transfer UI Integration     │
├───────────────────┼────────────────────────────────────────────────────┤
│ Step 4.7          │ End-to-End Hardening, Verification & Edge Cases    │
└───────────────────┴────────────────────────────────────────────────────┘
```

---

## 2. Step-by-Step Implementation Specifications

### Step 4.1 — Architecture, Feasibility & Security Audit (CURRENT STEP - COMPLETED)
- **Objective:** Perform technical feasibility, NAT traversal, Android 14/15 restrictions, signaling quota modeling, and security threat modeling for screen mirroring and file transfer.
- **Files Created/Updated:**
  - `docs/PHASE_4_STEP_4_1_ARCHITECTURE_AUDIT.md`
  - `docs/PHASE_4_STEP_4_1_SECURITY_ANALYSIS.md`
  - `docs/PHASE_4_STEP_4_1_IMPLEMENTATION_ROADMAP.md`
  - `docs/PHASE_4_STEP_4_1_CORRECTION_REPORT.md`
- **Dependencies:** None.
- **Security Considerations:** Establish strict trust boundaries: Firestore authorization vs client-side Web Crypto and WebRTC transport encryption.
- **Acceptance Criteria:** Comprehensive audit deliverables completed; zero application code modified; zero rules deployed.
- **Test Strategy:** Review of architectural contracts against Firebase Spark constraints.
- **Known Limitations:** Planning phase only; no physical streaming.

---

### Step 4.2 — WebRTC Signaling Foundation & Session Management
- **Objective:** Implement real-time SDP Offer/Answer and ICE candidate exchange via Cloud Firestore subcollections (`/users/{uid}/devices/{deviceId}/signaling/{sessionId}`) on both Web Dashboard and Android, with strict candidate batching to protect Firestore write quotas.
- **Files Expected to Change:**
  - `firebase/firestore.rules` (Add signaling subcollection rules — strictly in test/emulator environment)
  - `web-dashboard/src/services/webrtcSignalingService.ts` (New signaling manager with candidate batching)
  - `android-app/app/src/main/kotlin/com/virux/app/data/webrtc/SignalingClient.kt` (New signaling client)
  - `firebase/test/run-rules-tests.mjs` (Add signaling emulator unit tests)
- **Dependencies:** Step 4.1 approved; Firestore Emulator.
- **Security Considerations:**
  - Owner-only access (`request.auth.uid == userId`).
  - Active device check (`revokedAt == null`).
  - 120-second session expiry bounding.
  - Candidate batching (accumulating ICE candidates into bounded arrays) to avoid write quota saturation.
- **Acceptance Criteria:**
  - Web and Android clients successfully write, listen to, and exchange SDP and batched ICE candidates through Firestore.
  - Emulator security rules tests verify rejection of expired, cross-user, or revoked device signaling.
- **Test Strategy:**
  - Firestore Emulator unit tests for signaling CRUD, required fields, and permissions.
  - Integration handshake tests verifying SDP offer/answer round-trip.
- **Known Limitations:** Signaling exchange only; media tracks are attached in Step 4.3.

---

### Step 4.3 — Android MediaProjection Engine & Video Track
- **Objective:** Implement screen capture on Android via `MediaProjection` and hardware video encoding via WebRTC Android SDK.
- **Files Expected to Change:**
  - `android-app/app/build.gradle.kts` (Add WebRTC Android dependency)
  - `android-app/gradle/libs.versions.toml` (Add WebRTC version definition)
  - `android-app/app/src/main/AndroidManifest.xml` (Declare `FOREGROUND_SERVICE_MEDIA_PROJECTION`)
  - `android-app/app/src/main/kotlin/com/virux/app/service/ViruxScreenMirrorService.kt` (New foreground service)
  - `android-app/app/src/main/kotlin/com/virux/app/data/webrtc/WebRtcVideoCapturer.kt` (VirtualDisplay capturer)
- **Dependencies:** Step 4.2 approved; Google WebRTC library.
- **Security Considerations:**
  - Android 14/15 compliance: user must grant permission via `createScreenCaptureIntent()` before calling `startForeground()`.
  - Ongoing persistent notification indicating active screen casting.
  - Immediate `MediaProjection.stop()` and surface release when service stops.
- **Acceptance Criteria:**
  - Android app prompts user with OS consent dialog.
  - Successful creation of `VirtualDisplay` and encoding into WebRTC H.264/VP8 video track.
- **Test Strategy:**
  - Android instrumentation / unit tests verifying permission launch, intent token handling, and lifecycle termination.
- **Known Limitations:** Video track generated on device; requires Step 4.4 on web for rendering.

---

### Step 4.4 — Web Dashboard Live-Stream Playback Viewport
- **Objective:** Connect the Web Dashboard's `ScreenMirroringPage.tsx` to the active WebRTC stream and render real-time video with dynamic resolution and orientation adaptation.
- **Files Expected to Change:**
  - `web-dashboard/src/pages/ScreenMirroringPage.tsx` (Replace simulated bezel with live `<video>` element)
  - `web-dashboard/src/hooks/useScreenMirror.ts` (New hook managing PeerConnection lifecycle)
- **Dependencies:** Step 4.3 approved.
- **Security Considerations:**
  - Browser autoplay policy compliance (muted initial playback).
  - Runtime verification of DTLS/SRTP cipher suites via `peerConnection.getStats()`.
  - Immediate connection teardown if device is unpaired or stream interrupted.
  - Graceful failure state and clear UI diagnostic if ICE connection state transitions to `failed`.
- **Acceptance Criteria:**
  - Web dashboard renders real-time video feed from Android device with sub-second latency over local Wi-Fi.
  - Viewport correctly handles portrait/landscape rotation.
- **Test Strategy:**
  - End-to-end browser playback tests on Chrome and Edge.
  - Programmatic inspection of `peerConnection.getStats()` for active cipher suite.
- **Known Limitations:** Direct P2P requires same network or non-symmetric NAT without an optional TURN server.

---

### Step 4.5 — Secure File-Transfer Protocol (WebRTC DataChannel)
- **Objective:** Implement binary file chunking, flow control, and SHA-256 integrity verification over SCTP-based `RTCDataChannel`.
- **Files Expected to Change:**
  - `shared/contracts/fileTransfer.schema.json` (New transfer contract)
  - `web-dashboard/src/services/fileTransferEngine.ts` (Web chunker, reassembler, SHA-256 verifier)
  - `android-app/app/src/main/kotlin/com/virux/app/data/webrtc/FileTransferEngine.kt` (Android chunker, reassembler)
- **Dependencies:** Step 4.2 approved (DataChannels use same WebRTC PeerConnection).
- **Security Considerations:**
  - 64 KB chunk size to prevent SCTP buffer overflow.
  - Receiver validates incremental SHA-256 digest against header hash.
  - Immediate file purge from temporary cache if hash verification fails.
  - Full Unicode filename sanitization preserving international scripts while stripping path traversal and control characters.
- **Acceptance Criteria:**
  - Synthetic byte buffers (1 MB, 10 MB, 50 MB) transferred bidirectionally with 100% SHA-256 hash match.
  - Backpressure flow control prevents browser and Android memory exhaustion.
- **Test Strategy:**
  - Automated unit tests transferring sample files and verifying checksums.
  - Corrupted chunk injection tests confirming immediate abort and temporary file deletion.
- **Known Limitations:** In-memory / temporary buffer testing; UI file pickers wired in Step 4.6.

---

### Step 4.6 — Android SAF & Web File-Transfer UI Integration
- **Objective:** Wire the file transfer protocol to the Android Storage Access Framework (SAF) and the Web Dashboard `FileTransferPage.tsx` UI.
- **Files Expected to Change:**
  - `web-dashboard/src/pages/FileTransferPage.tsx` (Connect real file picker, active transfer progress, and history)
  - `android-app/app/src/main/kotlin/com/virux/app/ui/screens/files/FileTransferScreen.kt` (New Android screen)
  - `android-app/app/src/main/kotlin/com/virux/app/ui/navigation/ViruxNavHost.kt` (Register file transfer route)
- **Dependencies:** Step 4.5 approved.
- **Security Considerations:**
  - Use Android SAF (`OpenDocument` / `CreateDocument`) without requesting broad filesystem storage permissions.
  - Handle sequential non-seekable streams on `Dispatchers.IO`.
- **Acceptance Criteria:**
  - User can select a file on Android and download it on Web, and vice-versa.
  - Real-time percentage progress bar and transfer speed indicators.
- **Test Strategy:**
  - End-to-end transfers of various MIME types (images, videos, PDFs, ZIP archives).
  - Cancellation tests verifying stream teardown and temporary file cleanup.
- **Known Limitations:** Simultaneous multi-file queueing limited to sequential transfers to prevent buffer saturation.

---

### Step 4.7 — End-to-End Hardening, Verification & Edge Cases
- **Objective:** Comprehensive testing of edge cases, error recovery, battery optimization, unpair teardown, and documentation updates.
- **Files Expected to Change:**
  - `docs/PHASE_4_STEP_4_COMPLETION_REPORT.md` (Final completion documentation)
- **Dependencies:** Steps 4.2 through 4.6 completed.
- **Security Considerations:**
  - Verify immediate disconnection of active mirror and transfer sessions when device is revoked.
  - Confirm graceful degradation and user error messaging when peer-to-peer connection fails due to symmetric NAT.
- **Acceptance Criteria:**
  - Unpairing while streaming instantly terminates the WebRTC connection.
  - Disconnecting Wi-Fi produces clean "Connection Lost" state without app crashes.
  - All test suites (Android unit tests, Web production build, Firestore emulator) pass with zero errors.
- **Test Strategy:**
  - Network disconnect / reconnect simulation.
  - Revocation mid-stream test.
- **Known Limitations:** Direct P2P connectivity across strict symmetric NATs requires an optional TURN relay.

---

## 3. Strict Boundary Compliance & Stop Conditions

1. **Step 4.1 Scope:** This roadmap is an audit and planning document only.
2. **No Code Modified:** No implementation code in `android-app` or `web-dashboard` has been modified during Step 4.1.
3. **No Deployment:** Firestore security rules remain undeployed.
4. **No Plan Upgrades:** Firebase remains on the free Spark plan; no Firebase Storage activation or paid TURN servers have been provisioned.
5. **Awaiting User Review:** Step 4.2 will **not** begin until this roadmap and the accompanying audit reports are explicitly reviewed and authorized.
