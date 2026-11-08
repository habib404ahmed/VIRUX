# VIRUX — Phase 4, Step 4.2 Security Report
# WebRTC Signaling Security & Threat Analysis

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Firebase Project ID:** `virux-504a5`  
**Security Scope:** Local Firestore Security Rules & WebRTC Signaling Architecture  

---

## 1. Threat Model & Security Objectives

In the VIRUX architecture, WebRTC signaling is the critical control plane through which session parameters, cryptographic keys (DTLS-SRTP fingerprints embedded within SDP), and network addressing information (ICE candidates) are exchanged. Compromise of this plane could permit:
1. **Unauthorized Session Interception:** Eavesdropping on SDP offers or answers to capture DTLS fingerprints or target network topologies.
2. **Session Hijacking / Man-In-The-Middle (MITM):** Replacing legitimate SDP payloads with an attacker's SDP to steer media/data streams.
3. **Denial-of-Service / Quota Exhaustion:** Flooding Firestore with millions of candidate writes to exhaust the daily 20,000 write limit on Firebase Spark.
4. **Resurrection of Revoked Devices:** Establishing connections with a stolen or unpaired device.
5. **Replay / Zombie Sessions:** Attempting to reuse expired signaling sessions to bypass pairing controls.

---

## 2. Security Controls & Firestore Rules Implementation

### 2.1 Multi-Tenant Isolation & Authentication Boundary
- **Rule:** `allow read, write: if isOwner(userId) ...`
- **Enforcement:** Every signaling session is addressed under `/users/{userId}/devices/{deviceId}/signaling/{sessionId}`.
- **Verification:** An authenticated user Bob (`uid: user_bob_202`) attempting to read or write to Alex's signaling documents (`uid: user_alex_101`) is immediately rejected with `PERMISSION_DENIED` (tested by TC-28, TC-29, TC-30, TC-45).

### 2.2 Parent Device Validity & Revocation Invariant
- **Rule:**
  ```firestore
  && exists(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId))
  && get(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId)).data.revokedAt == null
  ```
- **Enforcement:** Even if an authenticated user attempts to initiate a signaling session for a device, the rule looks up the parent device document. If the device was marked revoked (`revokedAt != null`) or deleted, the signaling session creation, update, and candidate batch writes are completely blocked.
- **Verification:** TC-31 confirms that revoked devices cannot create signaling sessions.

### 2.3 Strict Session TTL & Expiration Enforcement
- **Rule:**
  ```firestore
  && request.resource.data.expiresAt is timestamp
  && request.resource.data.expiresAt > request.time
  && request.resource.data.expiresAt <= request.time + duration.value(120, 's')
  ```
  On all updates and candidate batch creations:
  ```firestore
  && request.time < resource.data.expiresAt
  ```
- **Enforcement:** Sessions have a maximum validity window of 120 seconds. Security rules enforce this using `request.time`. Once 120 seconds have elapsed, Firestore rejects all mutations directly at the security rules evaluation layer, providing zero-trust expiration without requiring background cron deletions.
- **Verification:** TC-32 confirms that sessions with `expiresAt > 120s` are rejected. TC-38 and TC-42 confirm that expired sessions cannot be updated or receive candidate batches.

### 2.4 Terminal State Locking
- **Rule:**
  ```firestore
  && !(resource.data.status in ['closed', 'revoked', 'expired'])
  ```
- **Enforcement:** Once a session reaches any terminal state, its lifecycle is irreversibly closed. No peer can transition the session back to `connected`, publish new SDP answers, or submit candidate batches.
- **Verification:** TC-39 and TC-43 confirm that mutations and candidate writes to `closed` sessions are rejected.

### 2.5 SDP Injection & Payload Size Bounding
- **Rule:**
  ```firestore
  && request.resource.data.offer.sdp is string
  && request.resource.data.offer.sdp.size() > 0
  && request.resource.data.offer.sdp.size() <= 65536
  ```
- **Enforcement:** Firestore documents have a 1MB limit. Oversized or abusive SDP strings are capped at 64 KB (65,536 characters), preventing document inflation attacks.
- **Verification:** TC-35 verifies that SDP offers exceeding 64 KB fail rules evaluation.

### 2.6 ICE Batching & Append-Only Subcollections
- **Rule:**
  ```firestore
  match /candidateBatches/{batchId} {
    allow create: if isOwner(userId)
      && request.resource.data.candidates is list
      && request.resource.data.candidates.size() <= 25
      && ...;
    allow update, delete: if false;
  }
  ```
- **Enforcement:** Candidates can only be submitted in discrete batches of up to 25 items. Updates and deletions to candidate batches are forbidden (`if false`), maintaining an append-only immutable audit trail and preventing race-condition overwrites.
- **Verification:** TC-41 confirms rejection of batches > 25 candidates. TC-44 confirms that updating or deleting an existing candidate batch is rejected.

---

## 3. Threat Assessment Matrix

| Threat Vector | Severity | Mitigating Control | Rule / Code Verification |
| :--- | :--- | :--- | :--- |
| **Cross-Tenant Session Access** | High | Path-based `isOwner(userId)` checks | TC-28, TC-29, TC-30 |
| **Signaling on Revoked Device** | Critical | Parent device lookup (`revokedAt == null`) | TC-31 |
| **Zombie / Expired Sessions** | Medium | Server-enforced TTL (`request.time < expiresAt`) | TC-32, TC-38, TC-42 |
| **Reopening Closed Sessions** | Medium | Terminal state immutability lock | TC-39, TC-43 |
| **SDP Buffer Overflow / Bloat** | Medium | Strict 64 KB length limit on SDP string | TC-35 |
| **Candidate Write Flooding** | High | ~250ms debounce batching & max 25 per batch | TC-40, TC-41, `SignalingBatchingTest` |
| **Candidate Batch Tampering** | Medium | Append-only rules (`allow update, delete: if false`) | TC-44 |

---

## 4. Architectural Boundaries & Known Limitations

1. **Client-Side Socket Enforcement:**
   - Firestore security rules govern document access in the Cloud Firestore database.
   - When a device is revoked or an unpair occurs, Firestore rules prevent *new* signaling sessions from being initiated and reject any subsequent writes.
   - However, once a peer-to-peer WebRTC connection has already established UDP sockets directly between devices, Firestore cannot physically terminate existing operating system network sockets.
   - *Mitigation:* The VIRUX Android client and Web Dashboard continuously observe the parent device and session document status. When a revocation or closure event is observed, the client applications immediately call `peerConnection.close()` and dispose of all media/data channels locally.
2. **Rule Evaluation Quotas:**
   - `get()` lookups in Firestore Security Rules count toward Firestore read operations.
   - The lookup of the parent device document (`get(/.../devices/{deviceId})`) consumes 1 read per signaling session creation/update. Because signaling sessions are infrequent and short-lived, this falls well within the 50,000 reads/day Spark quota.

---

## 5. Security Status & Compliance Declaration

- **Production Security Rules:** **NOT DEPLOYED**. Rules reside exclusively in `firebase/firestore.rules` for local emulator validation.
- **Spark Free Tier:** Maintained. No Cloud Functions, paid TURN relays, or Firebase Storage activated.
- **Security Posture:** Approved for local development and Step 4.2 completion.

