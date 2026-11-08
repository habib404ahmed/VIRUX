# VIRUX — Phase 4, Step 4.1: Security Analysis & Threat Audit (Corrected)

> **Project:** VIRUX — Your Devices. One Ecosystem.  
> **Android Package:** `com.virux.app`  
> **Target Subsystems:** Screen Mirroring (WebRTC Media) & File Transfer (WebRTC DataChannel)  
> **Document Status:** AUDIT & PLANNING DELIVERABLE ONLY (Rules remain undeployed)  
> **Revision:** 2.0 (Technical Audit Corrections Applied)  
> **Date:** November 8, 2026  

---

## 1. Security Review of Existing VIRUX Foundation

### 1.1 Existing Device Ownership Model
In Phase 4 Steps 1–3, VIRUX established a hardened device ownership model:
1. **User Scoping:** Every device document is rooted under `/users/{userId}/devices/{deviceId}`.
2. **Owner Isolation:** Access is strictly guarded by `request.auth.uid == userId`. No cross-user reads or writes are permitted.
3. **Hardware Identity Immutability:** Fields such as `deviceId`, `ownerUid`, `devicePublicKey`, `manufacturer`, `model`, and `createdAt` cannot be modified post-registration.
4. **Hardware Key Binding:** The Android device generates an EC P-256 key pair in the Android Keystore with `PURPOSE_SIGN` and signs a challenge containing `sessionId:challengeNonce:deviceId:ownerUid`.
5. **Revocation Immutability:** An active device document contains `revokedAt: null`. Unpairing transitions `revokedAt` to `request.time`. This transition is strictly one-way and irreversible.

---

## 2. Threat Modeling & Vulnerability Vectors

```
                           POTENTIAL ATTACK SURFACE
┌───────────────────────────────────┬───────────────────────────────────┐
│     Cloud Firestore Signaling     │       Peer-to-Peer Data Path      │
├───────────────────────────────────┼───────────────────────────────────┤
│ • Cross-user SDP inspection       │ • Man-in-the-middle on media      │
│ • ICE candidate flooding / quota  │ • Revoked device persistent stream│
│ • Replay of expired sessions      │ • Malicious binary chunk payloads │
│ • Unauthorized session creation   │ • Path traversal via file names   │
└───────────────────────────────────┴───────────────────────────────────┘
```

### 2.1 Threat 1: Unauthorized Stream Interception
- **Attack Scenario:** A third-party authenticated user (or malicious client on the internet) attempts to read the SDP offer or ICE candidates from Firestore to tap into the real-time screen stream.
- **Risk Level:** **CRITICAL** (User privacy violation).
- **Enforced Mitigation:**
  - Signaling documents must be placed strictly within the authenticated owner's hierarchy:  
    `/users/{userId}/devices/{deviceId}/signaling/{sessionId}`
  - Firestore security rules verify `request.auth.uid == userId`.
  - Firestore rules verify that `/users/{userId}/devices/{deviceId}` exists and is not revoked (`revokedAt == null`).
  - Outside of this hierarchy, the default-deny rule (`match /{document=**} { allow read, write: if false; }`) blocks all access.

### 2.2 Threat 2: Revoked Device Stream Persistence
- **Attack Scenario:** A user clicks "Unpair" on the Web Dashboard while screen mirroring or file transfer is in progress. If the WebRTC connection is not explicitly severed, the Android device could continue transmitting video to the browser over the established UDP peer-to-peer connection.
- **Risk Level:** **HIGH**.
- **Enforced Mitigation & Teardown State Machine:**
  - **Immediate Socket Termination:** Both the Android application and the Web Dashboard attach real-time listeners to `/users/{userId}/devices/{deviceId}`.
  - Upon receiving an event where `revokedAt != null` or document deletion occurs, both clients execute full local teardown:
    ```
    1. RTCPeerConnection: peerConnection.close(), unregister event listeners.
    2. MediaProjection: mediaProjection.stop(), unregister callbacks, stopForeground.
    3. Video Tracks: videoTrack.setEnabled(false), videoTrack.dispose(), surface.release().
    4. RTCDataChannels: dataChannel.close(), purge pending buffers.
    5. Active File Transfers: Cancel coroutine jobs / web workers, purge partial files.
    6. Signaling Document: Delete or transition signaling doc to 'closed'.
    ```
  - **Trust Boundary Realism:** Firestore rules cannot directly terminate an active OS UDP socket on a tampered client. However, because the Web Dashboard immediately calls `peerConnection.close()`, the bidirectional WebRTC stream terminates instantly at the network layer regardless of the Android client's behavior. Future signaling is completely blocked by Firestore rules.

### 2.3 Threat 3: SDP Injection and Replay Attacks
- **Attack Scenario:** An attacker intercepts an old, valid SDP offer and writes it into Firestore to trigger an unsolicited streaming session.
- **Risk Level:** **HIGH**.
- **Enforced Mitigation:**
  - **Single-Use Session Documents:** Each signaling session has a unique `sessionId` (UUIDv4) and short time-to-live:
    ```javascript
    && request.resource.data.createdAt == request.time
    && request.resource.data.expiresAt > request.time
    && request.resource.data.expiresAt <= request.time + duration.value(120, 's')
    ```
  - Sessions older than 120 seconds are rejected by rules and discarded by clients.
  - State transitions strictly progress from `offered -> answered -> connected -> closed`. Replay of previous states is rejected.

### 2.4 Threat 4: Malicious File Payloads & Path Traversal
- **Attack Scenario:** A compromised sender transmits an executable payload disguised as an image or a filename designed to traverse directories (e.g. `../../../../etc/shadow`).
- **Risk Level:** **HIGH**.
- **Enforced Mitigation:**
  - **Unicode-Preserving Filename Sanitization:**
    - Strips all directory components (`/`, `\`, `..`, `:`, drive letters).
    - Strips control characters (`\x00-\x1F`, `\x7F`) and directional overrides.
    - Strips leading/trailing dots and whitespace (prevents hidden files).
    - Replaces Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
    - Preserves valid international Unicode scripts (e.g., German umlauts, Japanese Kanji, Arabic, Cyrillic).
    - If sanitization yields an empty string, defaults to `virux_transfer_<timestamp>.<ext>`.
  - **Storage Isolation & Incomplete-Transfer Cleanup:**
    - Incoming binary chunks are written to an isolated application cache directory (`context.cacheDir/virux_transfers/`).
    - If a transfer is cancelled, disconnected, or times out, the partial temporary file is **immediately deleted**. Partial files are never exposed to the user or moved to permanent storage.
  - **SHA-256 Checksum Verification:**
    - Receiver calculates an incremental SHA-256 digest across all received chunks.
    - If the final digest does not match the sender's announced hash, the transfer is **instantly aborted**, the corrupted temporary file is purged from disk, and a security warning is logged.
  - **Android SAF Scoped Storage:**
    - Once verified, the file is handed to the Storage Access Framework (`CreateDocument`) or MediaStore, preventing arbitrary filesystem writes.

---

## 3. WebRTC Encryption Reality & Verification Strategy

- **Dynamic Cipher Negotiation:** WebRTC mandates DTLS-SRTP encryption. However, the exact cipher suite (e.g., `AES_128_GCM` vs `AES_CM_128_HMAC_SHA1_80`) and DTLS version (DTLS 1.2 vs DTLS 1.3) are negotiated at runtime during the DTLS handshake based on client platform capabilities.
- **Verification Requirement:**
  - The implementation must not assume or hardcode a specific cipher.
  - In Steps 4.4 and 4.7, verification tests must inspect `peerConnection.getStats()` to assert that a valid, secure DTLS-SRTP transport was negotiated:
    ```typescript
    const stats = await peerConnection.getStats()
    for (const report of stats.values()) {
      if (report.type === 'transport') {
        expect(report.dtlsCipher).toBeDefined()
        expect(report.srtpCipher).toBeDefined()
        expect(['1.2', '1.3']).toContain(report.tlsVersion)
      }
    }
    ```

---

## 4. Firestore Signaling Path Comparison & Recommendation

### Comparison of Proposed Paths:

| Path Option | Alignment with Device Ownership | Schema Cleanliness | Firestore Rules Complexity | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **`/webrtcSessions/{sessionId}`** | Poor (breaks owner hierarchy) | Requires duplicating `ownerUid` and `deviceId` | High (requires manual multi-tenant guards) | NOT RECOMMENDED |
| **`/users/{uid}/pairingSessions/...`**| Poor (pairing is one-time onboarding) | Conflates pairing with real-time operations | High (pairing rules assume 6-digit PIN & claim) | NOT RECOMMENDED |
| **`/users/{uid}/devices/{devId}/signaling/{sessionId}`** | **EXCELLENT** (inherits device scoping) | Clean subcollection under target device | **LOW & CONSISTENT** (reuses existing `isOwner(uid)`) | **RECOMMENDED** |

### Recommended Path Architecture:
`/users/{userId}/devices/{deviceId}/signaling/{sessionId}`

**Justification:**
1. **Consistent Ownership:** Automatically inherits `isOwner(userId)`.
2. **Device State Guarding:** Rules can directly verify that `deviceId` is an existing, active device (`revokedAt == null`).
3. **Natural Cleanup:** When a device is unpaired and deleted, its signaling subcollections are scoped and easily purged.
4. **Controlled Traffic:** ICE candidates are batched in a single bounded `candidates` array inside the session document or in a consolidated subcollection document to prevent candidate flooding.

---

## 5. Draft Firestore Signaling Rules (Planning Only — Undeployed)

The proposed rules extension for the signaling subcollection (to be implemented and tested strictly within the local emulator during Step 4.2) is structured as follows:

```javascript
// ─── Proposed Subcollection: WebRTC Signaling Sessions (PLANNING ONLY) ───
match /devices/{deviceId}/signaling/{sessionId} {
  allow read: if isOwner(userId);

  allow create: if isOwner(userId)
    && request.resource.data.keys().hasAll([
      'sessionId', 'deviceId', 'initiator', 'type', 'status', 'sdp', 'createdAt', 'expiresAt'
    ])
    && request.resource.data.keys().hasOnly([
      'sessionId', 'deviceId', 'initiator', 'type', 'status', 'sdp', 'candidates', 'createdAt', 'expiresAt'
    ])
    && request.resource.data.sessionId == sessionId
    && request.resource.data.deviceId == deviceId
    && request.resource.data.initiator in ['web', 'android']
    && request.resource.data.type in ['mirroring', 'fileTransfer']
    && request.resource.data.status == 'offered'
    && request.resource.data.sdp is string
    && request.resource.data.sdp.size() >= 50
    && request.resource.data.sdp.size() <= 65536
    && request.resource.data.createdAt == request.time
    && request.resource.data.expiresAt > request.time
    && request.resource.data.expiresAt <= request.time + duration.value(120, 's')
    // Target device must be registered and not revoked
    && exists(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId))
    && get(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId)).data.revokedAt == null;

  allow update: if isOwner(userId)
    && request.time < resource.data.expiresAt
    && get(/databases/$(database)/documents/users/$(userId)/devices/$(deviceId)).data.revokedAt == null
    && request.resource.data.sessionId == resource.data.sessionId
    && request.resource.data.deviceId == resource.data.deviceId
    && request.resource.data.createdAt == resource.data.createdAt
    && request.resource.data.expiresAt == resource.data.expiresAt
    && (
      // Transition 1: Answering peer provides SDP Answer
      (
        resource.data.status == 'offered'
        && request.resource.data.status == 'answered'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'answerSdp', 'answeredAt'])
        && request.resource.data.answerSdp is string
        && request.resource.data.answerSdp.size() >= 50
        && request.resource.data.answerSdp.size() <= 65536
        && request.resource.data.answeredAt == request.time
      )
      ||
      // Transition 2: Batch appending ICE candidates
      (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['candidates'])
        && request.resource.data.candidates is list
        && request.resource.data.candidates.size() <= 50
      )
      ||
      // Transition 3: Session closed by either peer
      (
        request.resource.data.status == 'closed'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'closedAt'])
        && request.resource.data.closedAt == request.time
      )
    );

  allow delete: if isOwner(userId);
}
```

---

## 6. Security Audit Verdict

1. **Architecture Feasibility:** Confirmed secure and viable within the existing owner-scoped hierarchy.
2. **Quota Protection:** Controlled candidate batching prevents Firestore quota exhaustion.
3. **Revocation Hardening:** Confirmed that client-side socket closure terminates active streams immediately upon unpair.
4. **Rules Status:** **UNDEPLOYED.** The rules above remain strictly planning specifications and are not active in production Firestore.
