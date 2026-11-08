# VIRUX — Phase 4, Step 4.5 Implementation Report
## Secure Peer-to-Peer File Transfer Foundation

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  
**Firebase Project ID:** `virux-504a5`  
**Firebase Plan:** Spark (Free Tier)  
**Status:** Completed & Verified  

---

## 1. Executive Summary

Phase 4 Step 4.5 implements the complete bidirectional, end-to-end encrypted peer-to-peer file transfer engine between paired Android devices and the VIRUX Web Dashboard.

Key capabilities delivered:
1. **WebRTC RTCDataChannel Architecture (`virux-file-transfer`):**
   - Direct SCTP-based reliable, ordered data transport operating entirely peer-to-peer.
   - Zero Firebase bandwidth or storage consumption: file payloads **never** touch Cloud Firestore, Firebase Storage, or cloud intermediate infrastructure.
2. **Versioned Control Protocol (`VIRUX_FILE_TRANSFER_V1`):**
   - Strictly enforced JSON control messages: `TRANSFER_REQUEST`, `TRANSFER_ACCEPT`, `TRANSFER_REJECT`, `TRANSFER_COMPLETE`, `TRANSFER_CANCEL`, and `TRANSFER_ERROR`.
   - Invariant bounds validation (file size $\le 500\text{ MB}$, chunk count, transfer IDs).
3. **Chunk Framing & Sequential Integrity:**
   - 64 KiB chunk size matching the SCTP network path boundary.
   - 4-byte big-endian monotonic sequence index header (`[4 bytes UInt32 Index][payload <= 65532 bytes]`).
   - Strict monotonic verification rejecting out-of-order, dropped, or duplicate chunks.
4. **Active Backpressure Control:**
   - High-water mark ($512\text{ KiB}$) and low-water mark ($64\text{ KiB}$).
   - Producer automatically pauses chunk delivery when buffered amount exceeds $512\text{ KiB}$ and resumes upon `onBufferedAmountChange` / `onbufferedamountlow` drop $\le 64\text{ KiB}$, preventing memory bloat.
5. **Incremental SHA-256 Digest Verification:**
   - Android utilizes `java.security.MessageDigest` computed incrementally during SAF streaming.
   - Web utilizes browser Web Crypto API `crypto.subtle.digest('SHA-256', ...)`.
   - Commit occurs only upon exact hash match; mismatches trigger automatic purge of `.part` temporary cache files.
6. **Path Traversal Protection & SAF / Web Integration:**
   - Filename sanitization strips directory traversal sequences (`../`, `..\`, null bytes, control characters).
   - Android integrates Storage Access Framework (`ACTION_OPEN_DOCUMENT`) and scoped internal cache storage.
   - Web Dashboard integrates HTML5 File API and auto-downloads verified files via browser Blobs.

---

## 2. File-by-File Changes

| File | Change Type | Summary of Changes |
| :--- | :--- | :--- |
| `android-app/app/src/main/kotlin/com/virux/app/filetransfer/ViruxDataChannel.kt` | **Created** | Interface abstracting WebRTC DataChannel operations (`ViruxDataChannel`, `ViruxDataChannelObserver`) and concrete `NativeViruxDataChannel` wrapping `org.webrtc.DataChannel`. |
| `android-app/app/src/main/kotlin/com/virux/app/filetransfer/FileTransferModels.kt` | **Created** | Data models defining `FileTransferState` (15 states), `FileTransferConstants` (`VIRUX_FILE_TRANSFER_V1`, $64\text{ KiB}$ chunks, $500\text{ MB}$ limit, $512\text{ KiB} / 64\text{ KiB}$ backpressure), `FileMetadata`, and `FileTransferItem`. |
| `android-app/app/src/main/kotlin/com/virux/app/filetransfer/FileTransferProtocol.kt` | **Created** | Control message JSON serialization and parsing, strict metadata validation, filename sanitization (path traversal protection), and binary chunk pack/unpack framing. |
| `android-app/app/src/main/kotlin/com/virux/app/filetransfer/ViruxFileTransferManager.kt` | **Created** | Android file transfer engine: handles SAF streaming, incremental SHA-256 calculation, backpressure pause/drain, `.part` cache streaming, commit on verification, and clean teardown. |
| `android-app/app/src/main/kotlin/com/virux/app/webrtc/WebRtcEngine.kt` | **Modified** | Added `createDataChannel(label: String): Result<ViruxDataChannel>` and `onDataChannelReceived` observer callback. |
| `android-app/app/src/main/kotlin/com/virux/app/webrtc/NativeWebRtcEngine.kt` | **Modified** | Implemented `createDataChannel` delegating to native `org.webrtc.PeerConnection.createDataChannel` and hooked `pcObserver.onDataChannel`. |
| `android-app/app/src/main/kotlin/com/virux/app/webrtc/PeerConnectionManager.kt` | **Modified** | Added `createDataChannel`, `setDataChannelListener`, and support for `file_transfer` sessions without requiring `MediaProjection` or screen capture. |
| `android-app/app/src/main/kotlin/com/virux/app/ui/screens/home/HomeViewModel.kt` | **Modified** | Added `incomingFileTransferSession` observation, `ViruxFileTransferManager` state flows, and actions for accept/reject/send/cancel. |
| `android-app/app/src/main/kotlin/com/virux/app/ui/screens/home/HomeScreen.kt` | **Modified** | Integrated incoming file transfer channel banner, incoming file request prompt, active transfer progress card, and wired Quick Action "Send Files" (`ACTION_OPEN_DOCUMENT`). |
| `android-app/app/src/test/kotlin/com/virux/app/FileTransferProtocolTest.kt` | **Created** | 8 unit tests covering protocol version strictness, control message serialization/parsing, path traversal sanitization, metadata bounds, chunk framing, and backpressure invariants. |
| `android-app/app/src/test/kotlin/com/virux/app/PeerConnectionLifecycleTest.kt` | **Modified** | Updated `FakeWebRtcEngine` mock to implement `createDataChannel`. |
| `web-dashboard/src/types/fileTransfer.ts` | **Created** | TypeScript interfaces, enums, message types, and constants matching Android implementation. |
| `web-dashboard/src/services/peerConnectionService.ts` | **Modified** | Added `createDataChannel`, `onDataChannel` callback, and optional media transceivers for data-only sessions. |
| `web-dashboard/src/services/fileTransferService.ts` | **Created** | `ViruxWebFileTransferManager`: chunking, backpressure drainage via `bufferedAmountLowThreshold`, Web Crypto SHA-256 calculation, and browser Blob download trigger. |
| `web-dashboard/src/hooks/useFileTransferSession.ts` | **Created** | React hook managing file transfer session lifecycle (`sessionType: 'file_transfer'`), P2P DataChannel, and transfer state. |
| `web-dashboard/src/pages/FileTransferPage.tsx` | **Modified** | Full interactive live UI: device selector, Connect/Disconnect button, drag-and-drop / file browser, active transfer card with progress bar, incoming file modal, and transfer history. |
| `web-dashboard/test/fileTransferService.test.mjs` | **Created** | 7 unit tests for protocol parsing, versioning, path traversal sanitization, chunk framing, sequential verification, SHA-256 calculation, and backpressure thresholds. |

---

## 3. WebRTC DataChannel Architecture

```
+-----------------------------------------------------------------------------+
|                         WebRTC RTCDataChannel Architecture                  |
+-----------------------------------------------------------------------------+

      Android Native App                                    PC Web Dashboard
  (com.virux.app / Native)                             (React 19 / TypeScript)
             |                                                    |
             | <--- Cloud Firestore Signaling (sessionType: 'file_transfer') ---> |
             |                                                    |
             | <=========== Direct P2P SCTP DataChannel ========== |
             |               ('virux-file-transfer')              |
             |                                                    |
  [Send Flow]                                         [Receive Flow]
  1. SAF Document Picker                              1. Receive TRANSFER_REQUEST
  2. Compute SHA-256 (streaming)                      2. User clicks "Accept"
  3. Send TRANSFER_REQUEST (JSON)                     3. Send TRANSFER_ACCEPT (JSON)
  4. Receive TRANSFER_ACCEPT                          4. Receive chunks (64 KiB framed)
  5. Stream 64 KiB chunks                             5. Verify sequential UInt32 headers
     (Backpressure: pause if buf > 512 KiB)           6. Receive TRANSFER_COMPLETE
  6. Send TRANSFER_COMPLETE (JSON)                    7. Verify SHA-256 digest
  7. Status: COMPLETED                                8. Auto-download via Blob
```

---

## 4. Verification and Test Results Summary

1. **Android Unit Tests:**
   - Command: `.\gradlew.bat testDebugUnitTest --rerun-tasks`
   - Result: **BUILD SUCCESSFUL** in 19s.
   - Total Tests: **32 passed, 0 failed, 0 skipped**.
   - Suites:
     - `com.virux.app.FileTransferProtocolTest` (8 tests)
     - `com.virux.app.PeerConnectionLifecycleTest` (12 tests)
     - `com.virux.app.SignalingBatchingTest` (6 tests)
     - `com.virux.app.ChallengeSerializationTest` (3 tests)
     - `com.virux.app.QRPayloadParsingTest` (3 tests)
2. **Android Debug APK Assembly:**
   - Command: `.\gradlew.bat assembleDebug`
   - Result: **BUILD SUCCESSFUL** in 8s.
3. **Web Dashboard Unit Tests:**
   - Command: `node --test web-dashboard/test/fileTransferService.test.mjs web-dashboard/test/peerConnectionService.test.mjs`
   - Result: **14 passed, 0 failed, 0 skipped** in 163ms.
4. **Web Dashboard Production Build:**
   - Command: `npm --prefix web-dashboard run build`
   - Result: **Built successfully in 1.32s** (`tsc -b && vite build`).
5. **Hardware Environment Status:**
   - `adb devices` scan executed: 0 physical devices currently attached. Verified in unit and mock environments.

