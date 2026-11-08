# VIRUX — Phase 4, Step 4.2 Final Security and Execution Verification

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  
**Firebase Project ID:** `virux-504a5`  
**Firebase Plan:** Spark (Free Tier)  
**Verification Scope:** Strict code inspection and execution verification (verification-only, no code modifications).  

---

## 1. Expiry Enforcement Findings (Section A)

Inspection of `firebase/firestore.rules` verifies the following rules under `match /signaling/{sessionId}` and child subcollections:

### 1.1 Session Creation Expiry Checks
```firestore
// Lines 326-328 of firebase/firestore.rules
&& request.resource.data.expiresAt is timestamp
&& request.resource.data.expiresAt > request.time
&& request.resource.data.expiresAt <= request.time + duration.value(120, 's')
```
- **How it works:** When a client creates a signaling session document, `expiresAt` must be a valid Firestore `timestamp`, must be strictly in the future (`> request.time`), and cannot exceed 120 seconds from the trusted evaluation time (`request.time + duration.value(120, 's')`). Any session attempting a longer lifespan is rejected immediately.

### 1.2 Immutability of Expiry on Update
```firestore
// Line 363 of firebase/firestore.rules
&& request.resource.data.expiresAt == resource.data.expiresAt
```
- **How it works:** On any update to the signaling session (e.g. publishing an offer or answer, or changing status), the rules require `request.resource.data.expiresAt` to exactly equal the existing document's `resource.data.expiresAt`. A client cannot extend, modify, or reset the original expiry timestamp.

### 1.3 Rejection of Operations After Expiry
```firestore
// Line 366 of firebase/firestore.rules (Session update)
&& request.time < resource.data.expiresAt

// Line 423 of firebase/firestore.rules (Candidate batch creation)
&& request.time < get(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId)/signaling/$(sessionId)).data.expiresAt
```
- **How it works:** Whenever an update to the signaling document or creation of an ICE candidate batch is requested, Firestore verifies that `request.time` has not passed the session's `expiresAt`. If 120 seconds have elapsed, all write operations fail with `PERMISSION_DENIED`.
- **Read behavior:** `allow read: if isOwner(userId);` permits the authenticated owner to read the session document. If a session has expired, the client applications locally transition the status to `'expired'` (`signalingState` in Android or `subscribeToSession` in Web) and proceed with teardown. Reads are intentionally permitted so clients can observe closure/expiration rather than experiencing unexpected read exceptions.

### 1.4 Parent Session Expiry Checked for Candidate Batches
```firestore
// Line 423 of firebase/firestore.rules
&& request.time < get(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId)/signaling/$(sessionId)).data.expiresAt
```
- **How it works:** Before any candidate batch document is created in `candidateBatches/{batchId}`, the rule executes a `get()` call on the parent signaling session document and verifies that the current `request.time` is less than `expiresAt`.

### 1.5 Independence from Asynchronous TTL Deletion
All authorization and mutation decisions occur synchronously during security rules evaluation against `request.time`. Neither session access rejection nor candidate batch rejection depends on asynchronous background Cloud Firestore TTL cleanup.

---

## 2. ICE Candidate Sequence Enforcement Findings (Section B)

Detailed inspection of `firebase/firestore.rules`, `web-dashboard/src/services/signalingService.ts`, and `android-app/app/src/main/kotlin/com/virux/app/data/repository/SignalingRepositoryImpl.kt` establishes the precise enforcement boundary for sequence numbers:

### 2.1 Enforcement Mechanism
- **Firestore Security Rules:** Validate that `sequenceNumber` is an integer and non-negative:
  ```firestore
  && request.resource.data.sequenceNumber is int
  && request.resource.data.sequenceNumber >= 0
  ```
- **Server-Side Monotonicity:** Rules **do not** enforce strictly gapless, monotonic sequence ordering (`seq == previous + 1`). In Cloud Firestore, enforcing gapless sequence numbers across sibling documents in a subcollection without parent transaction counters is not natively possible in declarative security rules.
- **Client-Side Maintenance:** Monotonic sequence numbers are strictly maintained by the client runtimes:
  - Web: `sequenceNumber = 0`, incremented per flushed batch (`currentSeq = this.sequenceNumber++`).
  - Android: `sequenceNumber = 0`, incremented per flushed batch (`"sequenceNumber" to sequenceNumber++`).
  - Ordering on Consumption: Both Web and Android consume remote candidate batches ordered by `sequenceNumber` ascending:
    - Web: `query(batchesRef, where('sender', '==', remoteSender), orderBy('sequenceNumber', 'asc'))`
    - Android: `batchesRef.whereEqualTo("sender", remoteSender).orderBy("sequenceNumber", Query.Direction.ASCENDING)`

### 2.2 Concurrency, Deduplication & Edge-Case Verification
1. **Duplicate Batch Prevention:** Each candidate batch document is assigned a unique UUID `batchId` (`crypto.randomUUID()` in Web, `UUID.randomUUID().toString()` in Android). The rules enforce `allow update, delete: if false;`, ensuring that once written, a batch cannot be overwritten or altered.
2. **Concurrent Batch Creation:** Web and Android write with distinct sender identities (`sender: 'web'` vs `sender: 'android'`). Within each client, candidate flushing is serialized:
   - Android utilizes a `kotlinx.coroutines.sync.Mutex` (`mutex.withLock`) around buffering and flushing.
   - Web utilizes JavaScript single-threaded event loop atomicity when taking snapshots of the buffer (`const candidatesToWrite = [...this.buffer]; this.buffer = []`).
3. **Candidate Deduplication:** Both clients maintain an in-memory Set of composite candidate fingerprints:
   `${candidate.candidate}|${candidate.sdpMid}|${candidate.sdpMLineIndex}`.
   Duplicates are dropped before entering the dispatch buffer.
4. **Retry Behavior:** If a Firestore write fails:
   - Android catches the exception and restores candidates to the front of the queue (`buffer.addAll(0, candidatesToWrite)`).
   - Web catches the exception and restores candidates (`this.buffer = [...candidatesToWrite, ...this.buffer]`).
   - *Documented Limitation:* In both clients, `sequenceNumber` increments when preparing the batch; if a write fails and candidates are restored, the subsequent batch will use the next incremented sequence number. Because client queries use `orderBy('sequenceNumber', 'asc')`, batches are still consumed in FIFO order, but sequence numbers may have gaps upon write retry.
5. **End-of-Candidates Handling:** When candidate gathering completes, `completeGathering()` flushes remaining candidates with `isComplete: true`. Rules validate that `isComplete is bool`.

---

## 3. Candidate Batch Security Findings (Section C)

Inspection of `firebase/firestore.rules` lines 416–442 verifies that candidate batch creation in `/users/{userId}/devices/{deviceId}/signaling/{sessionId}/candidateBatches/{batchId}` is restricted by:

| Security Check | Rule Condition in `firestore.rules` | Status |
| :--- | :--- | :---: |
| **Authenticated Owner Identity** | `isOwner(userId)` (`request.auth.uid == userId`) | Verified |
| **Correct Parent Device** | Scoped under path `/users/{userId}/devices/{deviceId}/...` | Verified |
| **Device Existence** | `exists(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId))` | Verified |
| **Device Revocation Status** | `get(/.../devices/$(deviceId)).data.revokedAt == null` | Verified |
| **Parent Session Existence** | `exists(/.../signaling/$(sessionId))` | Verified |
| **Parent Session Expiry** | `request.time < get(/.../signaling/$(sessionId)).data.expiresAt` | Verified |
| **Parent Session Terminal Status** | `!(get(/.../signaling/$(sessionId)).data.status in ['closed', 'revoked', 'expired'])` | Verified |
| **Session & Batch ID Match** | `data.sessionId == sessionId && data.batchId == batchId` | Verified |
| **Valid Sender & Payload** | `data.sender in ['web', 'android']`, `candidates is list && size() <= 25` | Verified |
| **Append-Only Immutability** | `allow update, delete: if false;` | Verified |

### Overlapping Match Blocks Audit
A line-by-line review of `firebase/firestore.rules` confirms:
- No wildcard collection rule grants broader permissions.
- The only root wildcard rule is lines 448–450:
  ```firestore
  match /{document=**} {
    allow read, write: if false;
  }
  ```
  All collections not explicitly matched default to complete denial.

---

## 4. State Machine Verification (Section D)

### 4.1 Permitted vs Rejected State Transitions
Inspection of lines 369–411 of `firebase/firestore.rules` confirms the forward-only lifecycle:

| Current State (`resource.data.status`) | Allowed Target State (`request.resource.data.status`) | Explicitly Rejected Transitions | Rule Constraints |
| :--- | :--- | :--- | :--- |
| **`created`** | `offer_created`, `closed`, `revoked`, `expired` | `created`, `answer_created`, `connecting`, `connected` | Requires valid SDP offer map ($\le 64$ KB) |
| **`offer_created`** | `answer_created`, `closed`, `revoked`, `expired` | `created`, `offer_created`, `connecting`, `connected` | Requires valid SDP answer map ($\le 64$ KB) |
| **`answer_created`** | `connecting`, `closed`, `revoked`, `expired` | `created`, `offer_created`, `answer_created`, `connected` | Progresses to connection check |
| **`connecting`** | `connected`, `closed`, `revoked`, `expired` | `created`, `offer_created`, `answer_created`, `connecting` | Progresses to connected channel |
| **`connected`** | `closed`, `revoked`, `expired` | `created`, `offer_created`, `answer_created`, `connecting`, `connected` | Graceful close or revocation |
| **`closed`** *(Terminal)* | *None* | All states | Blocked by line 368 (`!(status in ['closed', ...])`) |
| **`revoked`** *(Terminal)* | *None* | All states | Blocked by line 368 |
| **`expired`** *(Terminal)* | *None* | All states | Blocked by line 368 & `request.time < expiresAt` |

### 4.2 Immutable Fields on Session Update
Rules line 356–364 explicitly enforce that the following fields cannot be mutated on update:
- `sessionId`: `request.resource.data.sessionId == resource.data.sessionId`
- `ownerUid`: `request.resource.data.ownerUid == resource.data.ownerUid`
- `deviceId`: `request.resource.data.deviceId == resource.data.deviceId`
- `initiator`: `request.resource.data.initiator == resource.data.initiator`
- `sessionType`: `request.resource.data.sessionType == resource.data.sessionType`
- `protocolVersion`: `request.resource.data.protocolVersion == resource.data.protocolVersion`
- `createdAt`: `request.resource.data.createdAt == resource.data.createdAt`
- `expiresAt`: `request.resource.data.expiresAt == resource.data.expiresAt`

---

## 5. Android Gradle Command Verification (Section E)

Inspection of the Antigravity execution transcript and task log for background task `task-2286` reveals:

### 5.1 Exact Execution Parameters
- **Literal Command String Executed:**
  ```powershell
  cmd /c "set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot&& cd android-app && gradlew.bat clean testDebugUnitTest assembleDebug"
  ```
  *(Confirmed from transcript step 2285 `CommandLine` parameter)*.
- **Working Directory:**
  Workspace root: `C:\Users\HABIB\Videos\Hacking\VIRUX`, with internal change to `C:\Users\HABIB\Videos\Hacking\VIRUX\android-app`.
- **JAVA_HOME:** `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` (JDK 21 LTS).
- **Gradle Version:** Gradle `8.11.1` (from `android-app/gradle/wrapper/gradle-wrapper.properties`: `https://services.gradle.org/distributions/gradle-8.11.1-bin.zip`).
- **Target Execution Verification:**
  - `clean`: **Executed** (Log line 1: `> Task :app:clean`)
  - `assembleDebug`: **Executed** (Log line 52: `> Task :app:assembleDebug`)
  - `testDebugUnitTest`: **Executed** (Log line 56: `> Task :app:testDebugUnitTest`)
- **Exit Status:** Exit code `0` (`BUILD SUCCESSFUL in 42s`, `44 actionable tasks: 44 executed`).

### 5.2 Command Representation Note
The string `gradlew\.bat` noted in earlier discussions was an escaping artifact in Markdown prose. The actual tool call executed literally `gradlew.bat` inside the `cmd /c` shell string without backslash escaping.

---

## 6. Raw Terminal Output File Location (Section E & F)

The complete, unedited raw output of the Android execution is preserved on disk:
- **Task Log File:** `C:\Users\HABIB\.gemini\antigravity\brain\ca736b47-3f91-413f-9768-957c112b36c7\.system_generated\tasks\task-2286.log`
- **Transcript Record:** Step 2286 in `C:\Users\HABIB\.gemini\antigravity\brain\ca736b47-3f91-413f-9768-957c112b36c7\.system_generated\logs\transcript.jsonl`

---

## 7. Test Evidence (Section F)

### 7.1 Firestore Emulator Rules Tests
- **Test Runner:** `firebase/test/run-rules-tests.mjs`
- **Target Rules File:** `firebase/firestore.rules`
- **Emulator Endpoint:** `http://127.0.0.1:8080`
- **Test Results:** Total 50, Passed: 50, Failed: 0, Skipped: 0.
- **Phase 3 Baseline Preservation:** All 31 previous test cases (TC-01 through TC-26, including sub-cases TC-05a-c and TC-14b-d) executed and passed without modification. All 19 Vector 8 tests (TC-27 through TC-45) passed.

### 7.2 Android Unit Test XML Reports
Verified from JUnit XML files generated in `android-app/app/build/test-results/testDebugUnitTest/`:
1. `TEST-com.virux.app.SignalingBatchingTest.xml`: 6 tests, 0 failures, 0 errors, 0 skipped.
2. `TEST-com.virux.app.ChallengeSerializationTest.xml`: 3 tests, 0 failures, 0 errors, 0 skipped.
3. `TEST-com.virux.app.QRPayloadParsingTest.xml`: 3 tests, 0 failures, 0 errors, 0 skipped.
**Total Android Tests:** **12 passed, 0 failed, 0 skipped**.

### 7.3 Web Dashboard Production Build
Verified from build execution:
- **Command:** `npm --prefix web-dashboard run build` (`tsc -b && vite build`)
- **Modules Transformed:** 2,565 modules.
- **Exit Status:** Exit code `0` (`✓ built in 1.69s`).

---

## 8. Remaining Limitations (Section B & H)

1. **Non-Transactional Sequence Numbers:** Firestore Security Rules enforce `sequenceNumber is int && >= 0`, but do not enforce strict monotonic incrementation on the server. Monotonic sequencing is maintained by client memory. In the event of a network write failure and subsequent retry, sequence number gaps can occur.
2. **STUN-Only Direct P2P Limitation:** Without a TURN relay, devices behind restrictive symmetric NATs or corporate symmetric firewalls will fail direct UDP hole punching. Such sessions gracefully transition to terminal state `closed` with an explicit error.
3. **OS Socket Closure Boundary:** Security rules prevent database mutations after session closure, but cannot terminate active operating-system network sockets. Sockets are closed by client code in response to Firestore document status listeners.

---

## 9. Final File Change List (Section G)

### Modified Files (3)
1. `firebase/firestore.rules`
2. `firebase/test/run-rules-tests.mjs`
3. `shared/contracts/webrtc.schema.json`

### Created Files (8)
1. `docs/PHASE_4_STEP_4_2_IMPLEMENTATION_ASSESSMENT.md`
2. `docs/PHASE_4_STEP_4_2_IMPLEMENTATION_REPORT.md`
3. `docs/PHASE_4_STEP_4_2_SECURITY_REPORT.md`
4. `docs/PHASE_4_STEP_4_2_TEST_REPORT.md`
5. `docs/PHASE_4_STEP_4_2_FINAL_VERIFICATION.md`
6. `web-dashboard/src/types/signaling.ts`
7. `web-dashboard/src/services/signalingService.ts`
8. `android-app/app/src/main/kotlin/com/virux/app/data/model/SignalingModels.kt`
9. `android-app/app/src/main/kotlin/com/virux/app/data/repository/SignalingRepository.kt`
10. `android-app/app/src/main/kotlin/com/virux/app/data/repository/SignalingRepositoryImpl.kt`
11. `android-app/app/src/test/kotlin/com/virux/app/SignalingBatchingTest.kt`

---

## 10. Deployment and Infrastructure Boundary Confirmation

- [x] **No Production Deployment:** `firebase deploy` was not executed. Production Firestore rules remain undeployed.
- [x] **No Paid Services:** Firebase project `virux-504a5` remains strictly on the Spark Free Tier.
- [x] **No TURN Server:** Only Google public STUN (`stun:stun.l.google.com:19302`) is configured.
- [x] **No Firebase Storage:** Firebase Storage is not activated.
- [x] **Scope Integrity:** Screen capture, MediaProjection, video encoding, live video playback, and DataChannel file streaming are **not** implemented.
- [x] **Stop Condition:** Phase 4, Step 4.2 is complete. Step 4.3 has **not** started.

