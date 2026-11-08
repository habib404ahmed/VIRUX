# VIRUX — Phase 4, Step 4.1: Technical Audit Corrections Report

> **Project:** VIRUX — Your Devices. One Ecosystem.  
> **Android Package:** `com.virux.app`  
> **Target Subsystems:** Screen Mirroring (WebRTC Media) & File Transfer (WebRTC DataChannel)  
> **Deliverable Type:** Technical Audit Corrections & Clarifications (Documentation Only)  
> **Date:** November 8, 2026  

---

## 1. Overview of Corrections Made

In response to the technical review of the initial Phase 4, Step 4.1 architecture audit, seven specific technical areas were corrected and clarified across the documentation deliverables:
1. [`docs/PHASE_4_STEP_4_1_ARCHITECTURE_AUDIT.md`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/docs/PHASE_4_STEP_4_1_ARCHITECTURE_AUDIT.md)
2. [`docs/PHASE_4_STEP_4_1_SECURITY_ANALYSIS.md`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/docs/PHASE_4_STEP_4_1_SECURITY_ANALYSIS.md)
3. [`docs/PHASE_4_STEP_4_1_IMPLEMENTATION_ROADMAP.md`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/docs/PHASE_4_STEP_4_1_IMPLEMENTATION_ROADMAP.md)

No application code, build scripts, or Firestore security rules were modified.

---

## 2. Detailed Findings & Corrections Matrix

### Issue 1: Firebase Usage & Signaling Quotas
- **Original Claim:** The initial audit implied that Firebase was completely free and claimed "fewer than 10 writes per session" without addressing ICE candidate traffic.
- **Correction Applied:**
  - Clarified that **all video streams, audio tracks, and binary file payloads travel directly peer-to-peer and bypass Firebase entirely** during a successful connection.
  - Explicitly documented that Cloud Firestore signaling **does consume standard read, write, and listener quotas**.
  - Documented that unbatched "trickle ICE" can generate dozens of candidate documents (IPv4, IPv6, Wi-Fi, cellular interfaces) per session.
  - Introduced the **Candidate Batching Architecture**: candidates are accumulated locally and written as a bounded array in the session document or flushed with a 250ms debounce window to strictly protect Spark's 20,000 writes/day quota.
- **Remaining Uncertainty:** The exact number of candidates generated per session depends on device network interfaces (e.g. multi-SIM, VPN, IPv6 presence); this will be benchmarked under Step 4.2.

---

### Issue 2: TURN & NAT Traversal Realities
- **Original Claim:** An unsupported estimate of "15–20% connection failure" was presented without citation.
- **Correction Applied:**
  - Removed the unsupported percentage estimate.
  - Fully documented the technical ICE lifecycle:
    1. STUN discovery via Google public STUN (`stun:stun.l.google.com:19302`).
    2. ICE candidate gathering (`host`, `srflx`, `prflx`).
    3. Direct P2P connectivity checks (STUN binding requests/responses).
    4. ICE failure detection (`iceConnectionState === 'failed'`).
    5. Graceful retry (`peerConnection.restartIce()`) and user-facing error UI.
    6. Optional TURN relay requirements, operational realities, and bandwidth costs.
  - Explicitly reaffirmed that the baseline VIRUX architecture is **strictly direct P2P-only**.
- **Remaining Uncertainty:** The actual connection success rate across specific mobile carriers and enterprise networks will vary based on user network topology.

---

### Issue 3: WebRTC Encryption Negotiation
- **Original Claim:** The audit guaranteed a static cipher suite ("AES-128-GCM") and DTLS version.
- **Correction Applied:**
  - Removed static cipher suite guarantees.
  - Documented that DTLS versions (1.2 vs 1.3) and SRTP cipher suites (e.g., `AES_CM_128_HMAC_SHA1_80` vs `AES_128_GCM`) are **dynamically negotiated** during the peer handshake based on client capabilities.
  - Specified the verification protocol: during Step 4.4 and Step 4.7 testing, negotiated parameters must be inspected programmatically via `peerConnection.getStats()` inspecting the `transport` report (`dtlsCipher`, `srtpCipher`, `tlsVersion`).
- **Remaining Uncertainty:** Specific browser engine versions (e.g., Firefox vs Chromium vs WebKit) have differing priority lists for cipher selection; runtime inspection will confirm what is chosen.

---

### Issue 4: Firestore Signaling Document Path
- **Original Claim:** Proposed `/users/{userId}/devices/{deviceId}/signaling/{sessionId}` without detailed comparison against existing schemas.
- **Correction Applied:**
  - Formally evaluated three paths:
    1. Flat root path (`/webrtcSessions/{sessionId}`) — rejected due to multi-tenant isolation risks.
    2. Pairing session subcollection — rejected because pairing is a one-time onboarding protocol.
    3. Device subcollection (`/users/{userId}/devices/{deviceId}/signaling/{sessionId}`) — **RECOMMENDED**.
  - Documented how this path reuses `isOwner(userId)` rules, allows validating that the target device exists and has `revokedAt == null`, and integrates cleanly with device deletion/unpair cascading.
  - Explained that the current catch-all rule (`match /{document=**} { allow read, write: if false; }`) will be extended in a future approved step (Step 4.2). Actual rules remain undeployed.
- **Remaining Uncertainty:** None. The path is structurally and logically consistent with the existing Phase 4 Step 3 schema.

---

### Issue 5: Revocation & Teardown State Machine
- **Original Claim:** Assumed client listeners were sufficient to guarantee revocation without explaining trust boundary limitations.
- **Correction Applied:**
  - Detailed the full teardown sequence across all active components:
    1. `RTCPeerConnection`: `close()` and listener disposal.
    2. `MediaProjection`: `stop()`, unregister callbacks, `stopForeground`.
    3. Video Tracks: `setEnabled(false)`, `dispose()`, surface release.
    4. `RTCDataChannels`: `close()`, buffer purge.
    5. File Transfers: Cancel coroutines/workers, delete partial files.
    6. Signaling Document: Transition to `closed` or delete.
  - Documented the trust boundary limitation: Firestore rules cannot terminate an active OS UDP socket on a tampered client. However, because the Web Dashboard immediately calls `peerConnection.close()`, the bidirectional stream terminates instantly at the network layer regardless of the Android client's behavior.
- **Remaining Uncertainty:** Network timeout duration on ungraceful drop (e.g. phone battery sudden death) before the browser peer marks the connection `disconnected` (typically 5–10 seconds).

---

### Issue 6: File Transfer Security & Unicode Handling
- **Original Claim:** Proposed a crude ASCII regex whitelist (`^[a-zA-Z0-9._-]+$`), which corrupted non-Latin filenames.
- **Correction Applied:**
  - Formulated a refined sanitization policy that **preserves valid international Unicode filenames** (umlauts, Kanji, Cyrillic, Arabic, accented characters, spaces) while stripping directory traversal (`../`, `..\`), slashes (`/`, `\`), control characters (`\x00-\x1F`), and Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
  - Documented temporary file isolation in `context.cacheDir/virux_transfers/`.
  - Documented that incomplete or cancelled transfers trigger **immediate file deletion**.
  - Documented that SHA-256 checksum mismatches trigger **immediate abort and purge**.
  - Documented Android Storage Access Framework (SAF) limitations (sequential non-seekable streams, `Dispatchers.IO` requirement).
- **Remaining Uncertainty:** Handling very large files (> 2 GB) in browser memory will require streaming chunks to disk via the File System Access API where supported, or streaming to a ServiceWorker download pipe.

---

### Issue 7: Firebase Storage Plan Eligibility
- **Original Claim:** Assumed Spark tier 5 GB storage was readily available.
- **Correction Applied:**
  - Clarified that in modern Firebase projects, provisioning a default Cloud Storage bucket often requires cloud billing verification or the Blaze plan.
  - Explicitly decoupled VIRUX from Firebase Storage: VIRUX maintains an **initial P2P-only architecture**.
  - Reaffirmed that Firebase Storage will **not** be activated, and the project will **not** be upgraded to Blaze.
- **Remaining Uncertainty:** None. The direct P2P DataChannel architecture eliminates all reliance on Cloud Storage.

---

## 3. Strict Project Boundaries Acknowledgment

1. **Documentation Only:** This task produced four documentation files. No application code, build scripts, or contracts were modified.
2. **Firestore Rules Undeployed:** Production rules at `virux-504a5` remain untouched and undeployed.
3. **No Implementation Started:** Steps 4.2 through 4.7 remain un-started.
4. **Zero Paid Cloud Resources:** No TURN servers, Cloud Storage buckets, or Blaze billing accounts were provisioned.
5. **Awaiting Authorization:** Implementation will not proceed until explicit approval is granted.

