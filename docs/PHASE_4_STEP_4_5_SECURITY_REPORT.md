# VIRUX — Phase 4, Step 4.5 Security Report
## Peer-to-Peer File Transfer Security & Invariant Analysis

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  
**Firebase Plan:** Spark (Free Tier)  
**Status:** Audited & Approved  

---

## 1. Zero Cloud Storage & Zero Intermediate Leakage

1. **Direct WebRTC SCTP Transport:**
   - File data chunks travel strictly across the direct WebRTC peer-to-peer SCTP connection (`virux-file-transfer`).
   - At no point are file contents transmitted to Cloud Firestore, Firebase Storage, Google Cloud, or third-party servers.
   - Signaling documents in Cloud Firestore contain only short-lived SDP metadata and candidate batches.
2. **Spark Tier Preservation:**
   - Firebase Storage remains completely unconfigured and unused.
   - Cloud Functions remain unconfigured and unused.
   - Firestore usage for file transfer signaling is strictly identical to screen mirroring ($\le 8\text{ total operations per session}$).

---

## 2. Protocol Validation & Injection Protections

1. **Strict Version Enforcement:**
   - Senders and receivers require `protocolVersion === "VIRUX_FILE_TRANSFER_V1"`.
   - Any message with an unsupported or missing protocol version is immediately dropped.
2. **Path Traversal & Filename Sanitization:**
   - Android (`FileTransferProtocol.sanitizeFileName`) and Web (`sanitizeFileName`):
     - Strip directory separators (`/` and `\`).
     - Remove traversal markers (`..`).
     - Strip control characters (`\r`, `\n`, `\t`, null bytes).
     - Trim leading/trailing dots and whitespace.
     - Fallback to safe defaults (`download.bin` or `unnamed_file`) if input is empty or maliciously constructed.
   - Prevents arbitrary file overwrite outside the application's scoped storage directory.
3. **Payload Bounds & Limits:**
   - `MAX_FILE_SIZE` is strictly enforced at $500\text{ MB}$ ($524,288,000\text{ bytes}$). Files exceeding this limit are rejected before transmission.
   - Chunks are bounded to $64\text{ KiB}$ ($65,536\text{ bytes}$), preventing SCTP packet fragmentation and buffer overflow.

---

## 3. Cryptographic Integrity & Tamper Resistance

1. **Pre-Transmission Incremental SHA-256 Digest:**
   - The sender computes a full cryptographic SHA-256 hash before transmitting `TRANSFER_REQUEST`.
   - On Android: streaming calculation via `java.security.MessageDigest` over SAF `InputStream`.
   - On Web: `crypto.subtle.digest('SHA-256', buffer)`.
2. **Receiver-Side Independent Verification:**
   - The receiver streams incoming chunks into a temporary file (`.part` on Android) or buffered chunks in memory (Web).
   - Upon receiving `TRANSFER_COMPLETE`, the receiver independently computes the SHA-256 digest of the entire received byte sequence.
   - **Atomic Commit / Rollback:**
     - If `actualHash == expectedHash`: the file is committed (`renameTo` to the destination directory or saved as a Blob).
     - If `actualHash != expectedHash`: the transfer fails with `TRANSFER_ERROR`, the `.part` cache file is immediately deleted from disk, and no corrupt data is committed.

---

## 4. Backpressure & Denial-of-Service Defense

1. **High-Water / Low-Water Flow Control:**
   - High-water mark: $512\text{ KiB}$ ($524,288\text{ bytes}$).
   - Low-water mark: $64\text{ KiB}$ ($65,536\text{ bytes}$).
   - If the sending socket buffer exceeds $512\text{ KiB}$, producer chunk emission is suspended until the underlying SCTP stack drains below $64\text{ KiB}$.
   - Prevents Out-Of-Memory (OOM) crashes on constrained mobile devices.
2. **Explicit User Consent & Approval:**
   - Incoming files require explicit user confirmation (`TRANSFER_ACCEPT` or `TRANSFER_REJECT`).
   - Devices cannot be flooded with unapproved file transfers.
   - Only one file transfer is permitted per session at a time; concurrent attempts are rejected with "Receiver busy".

---

## 5. Security Invariant Matrix

| Security Property | Mechanism | Enforcement Level |
| :--- | :--- | :--- |
| **Confidentiality** | WebRTC DTLS-SRTP encryption | Kernel / WebRTC native stack |
| **Integrity** | Incremental SHA-256 digest verification | Application layer verification |
| **Path Traversal Protection** | Regex filename sanitization | Senders & receivers |
| **DoS / OOM Defense** | 512 KiB / 64 KiB backpressure drainage | Producer flow control |
| **Storage Privacy** | Scoped app storage / SAF | Android 14/15 OS sandbox |
| **Zero Cloud Payload** | SCTP RTCDataChannel | Architecture invariant |
| **Zero Firestore Cost Risk** | Spark Free Tier compliant | Architecture invariant |

