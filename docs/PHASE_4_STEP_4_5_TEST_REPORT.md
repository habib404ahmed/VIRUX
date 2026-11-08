# VIRUX — Phase 4, Step 4.5 Test Report
## Automated Unit, Protocol & Build Verification

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  
**Firebase Plan:** Spark (Free Tier)  
**Status:** All Tests Passing  

---

## 1. Test Suite Summary

| Component | Target / Command | Tests Executed | Passed | Failed | Skipped | Duration |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Android Unit Tests** | `.\gradlew.bat testDebugUnitTest --rerun-tasks` | 32 | 32 | 0 | 0 | 19s |
| **Android APK Build** | `.\gradlew.bat assembleDebug` | 37 tasks | 37 | 0 | 0 | 8s |
| **Web Unit Tests** | `node --test web-dashboard/test/*.mjs` | 14 | 14 | 0 | 0 | 163ms |
| **Web Production Build** | `npm --prefix web-dashboard run build` | Bundle | Pass | 0 | 0 | 1.32s |
| **Total Automated Tests** | All Suites Combined | **46** | **46** | **0** | **0** | **~29s** |

---

## 2. Android Test Suite Details (`com.virux.app`)

### Suite: `com.virux.app.FileTransferProtocolTest` (8 tests)
- `testProtocolVersionIsStrict`: Asserts `PROTOCOL_VERSION == "VIRUX_FILE_TRANSFER_V1"`.
- `testControlMessageSerializationAndParsing`: Validates JSON serialization and deserialization for all 6 control messages (`TRANSFER_REQUEST`, `TRANSFER_ACCEPT`, `TRANSFER_REJECT`, `TRANSFER_COMPLETE`, `TRANSFER_CANCEL`, `TRANSFER_ERROR`).
- `testParseRejectsProtocolVersionMismatch`: Verifies that messages declaring invalid or future protocol versions are rejected with `IllegalArgumentException`.
- `testFileNameSanitizationRemovesPathTraversal`: Verifies sanitization of `../../../../etc/passwd` to `passwd`, `..\..\Windows\System32\calc.exe` to `calc.exe`, control character removal (`\r\n`), and empty name fallback to `download.bin`.
- `testMetadataValidationInParsing`: Verifies rejection of oversized files ($> 500\text{ MB}$), zero/negative file size, and truncated SHA-256 strings ($< 64\text{ chars}$).
- `testBinaryChunkFramingPackAndUnpack`: Verifies 4-byte big-endian sequence index packing and byte-for-byte payload unpacking.
- `testUnpackChunkRejectsTruncatedFrame`: Verifies that frames $< 4\text{ bytes}$ throw `IllegalArgumentException`.
- `testConstantsInvariants`: Asserts chunk size ($64\text{ KiB}$), max payload ($65,532\text{ bytes}$), backpressure bounds ($512\text{ KiB} / 64\text{ KiB}$), and file limits ($500\text{ MB}$).

### Suite: `com.virux.app.PeerConnectionLifecycleTest` (12 tests)
- `testPeerConnectionStatusEnumAndTerminalInvariants`
- `testCreateCandidateBatcherInitializesCorrectly`
- `testPeerConnectionManagerInitializesWithoutCrash`
- `testOfferSdpLengthBoundaryRejection`
- `testRemoteCandidateBatchDedupAndSequence`
- `testSessionExpirationTriggersTeardown`
- `testNativeWebRtcEngineLifecycleTransitions`
- `testNativeWebRtcEngineScreenCaptureFailureHandling`
- `testNativeWebRtcEngineEncoderFallbackHandling`
- `testPeerConnectionRemoteRevocationHandling`
- `testPeerConnectionConsentDenialHandling`
- `testPeerConnectionDisposeIdempotency`

### Suite: `com.virux.app.SignalingBatchingTest` (6 tests)
- `testBatcherFlushesWhenMaxBatchSizeReached`
- `testBatcherFlushesOnDebounceTimer`
- `testBatcherIgnoresEmptyFlush`
- `testBatcherMarksSessionExpired`
- `testBatcherSequenceNumberIncrementsMonotonically`
- `testBatcherDisposalCancelsPendingJobs`

### Suite: `com.virux.app.ChallengeSerializationTest` (3 tests)
- Challenge and pairing signature payload verification.

### Suite: `com.virux.app.QRPayloadParsingTest` (3 tests)
- QR code payload parsing and URL parsing verification.

---

## 3. Web Dashboard Test Suite Details

### Suite: `web-dashboard/test/fileTransferService.test.mjs` (7 tests)
- `Protocol version must strictly equal VIRUX_FILE_TRANSFER_V1`
- `Filename sanitization neutralizes directory traversal and control characters`
- `Chunk framing packs and unpacks 4-byte big-endian sequence index`
- `Sequence verification enforces strictly sequential chunks`
- `SHA-256 integrity calculation and mismatch detection`
- `File size limit validation enforces 500 MB maximum threshold`
- `Backpressure thresholds maintain high-water and low-water invariants`

### Suite: `web-dashboard/test/peerConnectionService.test.mjs` (7 tests)
- `WebRtcPeerConnection candidate deduplication and fingerprinting`
- `WebRTC batch chunking preserves bounds (<= 25 items)`
- `WebRTC connection state mapping and terminal checks`
- `Distinguishes ICE connected from live video arrival (no premature live status)`
- `MediaStream track attachment and playback binding`
- `Session expiration triggers clean teardown within 120s limit`
- `Android consent rejection transitions to permission_denied`

---

## 4. Hardware Environment Disclosure

- **ADB Diagnostics:** Scanned via `adb devices`. 0 physical or virtual Android devices were attached during test execution.
- **Coverage Model:** All unit and integration test assertions run against native JVM runtime and Node.js WebCrypto environments. Physical hardware validation is deferred to hardware-in-the-loop testing.

