# VIRUX — Phase 4, Step 4.2 Test Report
# WebRTC Signaling & Security Rules Verification Suite

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Firebase Project ID:** `virux-504a5`  
**Test Scope:** Local Cloud Firestore Emulator, Android Unit Tests, and Web Dashboard Build  

---

## 1. Test Summary Overview

| Test Suite / Target | Total Tests | Passed | Failed | Skipped | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Firestore Security Rules Emulator** (`firebase/test/run-rules-tests.mjs`) | **50** | **50** | **0** | **0** | **PASSED** |
| **Android Unit Tests** (`android-app/app/src/test/`) | **12** | **12** | **0** | **0** | **PASSED** |
| **Android Build** (`gradlew.bat assembleDebug`) | 44 tasks | 44 | 0 | 0 | **PASSED** |
| **Web Production Build** (`npm --prefix web-dashboard run build`) | 2,565 modules | 2,565 | 0 | 0 | **PASSED** |

---

## 2. Cloud Firestore Rules Emulator Test Suite

**Target:** `firebase/firestore.rules`  
**Emulator:** `127.0.0.1:8080`  
**Test Runner:** `firebase/test/run-rules-tests.mjs`  
**Execution Command:** `node firebase/test/run-rules-tests.mjs`  

### 2.1 Complete Test Case Execution Matrix

#### Vector 1: Auth Boundary & Cross-User Isolation
- `TC-01`: Rejects unauthenticated read to pairing sessions — **PASS**
- `TC-02`: Rejects unauthenticated read to devices — **PASS**
- `TC-03`: Rejects User Bob attempting to read User Alex pairing sessions — **PASS**
- `TC-04`: Rejects User Bob attempting to read User Alex devices — **PASS**

#### Vector 2: Phase 3 Profile Hardening Preservation
- `TC-05a`: Allows owner to create valid profile with optional fields present — **PASS**
- `TC-05b`: Allows owner to create valid profile with optional fields set to null — **PASS**
- `TC-05c`: Allows owner to create valid profile with optional fields omitted — **PASS**
- `TC-06`: Rejects profile mutation of immutable uid or email — **PASS**
- `TC-07`: Rejects profile deletion — **PASS**

#### Vector 3: Pairing Session Creation Validation
- `TC-08`: Allows creating valid pending pairing session (6-digit PIN, 64-hex nonce, < 10m expiry) — **PASS**
- `TC-09`: Rejects session creation with invalid PIN format (non-numeric or wrong length) — **PASS**
- `TC-10`: Rejects session creation with invalid challenge nonce format — **PASS**
- `TC-11`: Rejects session creation with excessive expiry (> 10m30s) — **PASS**

#### Vector 4: Atomic Device Pairing & getAfter() Enforcement
- `TC-12`: Rejects claiming pairing session without creating device in same transaction — **PASS**
- `TC-13`: Rejects creating device document without claiming pairing session in same transaction — **PASS**
- `TC-14`: Allows atomic transaction claiming session AND registering device together — **PASS**
- `TC-14b`: Rejects atomic claim if public key contains invalid non-base64 characters — **PASS**
- `TC-14c`: Rejects atomic claim if signature contains invalid non-base64 characters or is too short — **PASS**
- `TC-14d`: Rejects device registration if revokedAt is omitted (violates hasAll schema) — **PASS**
- `TC-15`: Rejects replay / duplicate claim on already claimed session — **PASS**
- `TC-16`: Rejects claiming an expired session — **PASS**

#### Vector 5: Device Management, Renaming & Heartbeat Updates
- `TC-17`: Allows owner to rename active device — **PASS**
- `TC-18`: Rejects mutating immutable hardware identity fields (deviceId, devicePublicKey) — **PASS**
- `TC-19`: Allows valid heartbeat presence update on active device — **PASS**
- `TC-20`: Rejects invalid telemetry values (battery > 100 or negative) — **PASS**
- `TC-21`: Allows owner to unpair/delete device — **PASS**

#### Vector 6: Revocation Hardening Invariants
- `TC-22`: Rejects heartbeat update from a revoked device — **PASS**
- `TC-23`: Rejects rename attempt on a revoked device — **PASS**
- `TC-24`: Rejects attempting to reverse revocation (setting revokedAt back to null) — **PASS**
- `TC-25`: Rejects recreating device using an existing already-claimed session after unpair — **PASS**

#### Vector 7: Default-Deny Catch-All
- `TC-26`: Rejects write to unauthorized top-level collection — **PASS**

#### Vector 8: WebRTC Signaling Foundation & Lifecycle Invariants (New in Step 4.2)
- `TC-27`: Allows device owner to create a valid signaling session (TTL <= 120s) — **PASS**
- `TC-28`: Rejects unauthenticated read to signaling sessions — **PASS**
- `TC-29`: Rejects another authenticated user (User Bob) reading User Alex signaling sessions — **PASS**
- `TC-30`: Rejects another authenticated user (User Bob) creating a session on User Alex device — **PASS**
- `TC-31`: Rejects session creation for a revoked device — **PASS**
- `TC-32`: Rejects session creation if expiresAt exceeds 120s limit (>120s) — **PASS**
- `TC-33`: Rejects session creation with mismatched ownerUid or deviceId — **PASS**
- `TC-34`: Allows transition from created to offer_created with valid SDP offer — **PASS**
- `TC-35`: Rejects offer with oversized SDP payload (> 64KB) — **PASS**
- `TC-36`: Allows transition from offer_created to answer_created with valid SDP answer — **PASS**
- `TC-37`: Allows progress through connecting and connected states — **PASS**
- `TC-38`: Rejects mutating an expired signaling session — **PASS**
- `TC-39`: Rejects mutating a terminal session (status == closed) — **PASS**
- `TC-40`: Allows creating a valid ICE candidate batch in candidateBatches subcollection — **PASS**
- `TC-41`: Rejects candidate batch with > 25 candidates — **PASS**
- `TC-42`: Rejects candidate batch write to an expired session — **PASS**
- `TC-43`: Rejects candidate batch write to a closed session — **PASS**
- `TC-44`: Rejects updating or deleting an existing candidate batch (append-only enforcement) — **PASS**
- `TC-45`: Rejects unauthorized user (Bob) creating candidate batch on Alex session — **PASS**

```
============================================================
TEST SUMMARY: Total: 50 | Passed: 50 | Failed: 0 | Skipped: 0
============================================================
```

---

## 3. Android Native App Test & Build Verification

**Module:** `android-app`  
**Package:** `com.virux.app`  
**Command:** `cmd /c "set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot&& cd android-app && gradlew.bat clean testDebugUnitTest assembleDebug"`  

### 3.1 Unit Test Execution Matrix

#### `com.virux.app.SignalingBatchingTest` (6 tests)
- `testSessionExpiryDetection` — **PASS** (0.036s)
- `testCandidateBatchSizing` — **PASS** (0.015s)
- `testSdpPayloadBoundaries` — **PASS** (0.002s)
- `testSignalingStateEnumMapping` — **PASS** (0.001s)
- `testCandidateDeduplicationFingerprint` — **PASS** (0.004s)
- `testTerminalStatesImmutability` — **PASS** (0.001s)

#### `com.virux.app.ChallengeSerializationTest` (3 tests)
- `testChallengeMessageSerializationMatchesWebDashboard` — **PASS** (0.021s)
- `testEcdsaP256SignatureGenerationAndVerification` — **PASS** (0.153s)
- `testPublicKeyDerEncodingFormat` — **PASS** (0.017s)

#### `com.virux.app.QRPayloadParsingTest` (3 tests)
- `testMalformedJsonRejection` — **PASS** (0.012s)
- `testValidQrPayloadParsing` — **PASS** (0.001s)
- `testMissingRequiredAttributesRejection` — **PASS** (0.001s)

**Android Unit Test Total:** **12 passed, 0 failed, 0 skipped**

### 3.2 Compilation & Packaging Result
```
BUILD SUCCESSFUL in 42s
44 actionable tasks: 44 executed
```
Debug APK generated successfully at:
`android-app/app/build/outputs/apk/debug/app-debug.apk`

---

## 4. Web Dashboard Production Build Verification

**Directory:** `web-dashboard`  
**Command:** `npm --prefix web-dashboard run build`  
**Output:**
```
> web-dashboard@0.0.0 build
> tsc -b && vite build

vite v8.3.6 building client environment for production...
transforming...
✓ 2565 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                             0.78 kB │ gzip:   0.38 kB
dist/assets/index-SX0kxdCh.css             49.79 kB │ gzip:   9.05 kB
dist/assets/rolldown-runtime-WkwZ5CU-.js    0.59 kB │ gzip:   0.36 kB
dist/assets/motion-1ut0Xo1s.js            143.24 kB │ gzip:  48.02 kB
dist/assets/index-DQLqzf-a.js             194.89 kB │ gzip:  53.70 kB
dist/assets/vendor-BP2kmYMN.js            210.53 kB │ gzip:  65.69 kB
dist/assets/firebase-DCrw8FDJ.js          564.78 kB │ gzip: 169.68 kB
✓ built in 1.69s
```
**Web Build Total:** **0 TypeScript errors, 0 build failures**.

---

## 5. Verification Conclusion

All functional, security, and schema invariants established in Phase 4 Step 4.2 have been independently verified across the local Firestore Emulator, Android unit test runner, and TypeScript compiler.
Zero regressions were observed across all 31 previously approved tests, and all 19 new security rules test cases passed cleanly.

