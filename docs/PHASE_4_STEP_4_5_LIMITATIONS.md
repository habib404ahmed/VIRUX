# VIRUX — Phase 4, Step 4.5 Limitations & Technical Boundaries

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  
**Firebase Plan:** Spark (Free Tier)  

---

## 1. Scope and Architectural Boundaries

1. **Maximum File Size Limit:**
   - Single file transfers are bounded to **500 MB** ($524,288,000\text{ bytes}$).
   - Attempting to send files larger than 500 MB is rejected at both the Android SAF layer and Web File API layer.
   - *Rationale:* In the browser and in unprivileged mobile memory, buffering larger multi-gigabyte blobs without streaming directly to disk can cause browser tab crashes or mobile OOM conditions.
2. **Sequential Single-File Transfer:**
   - The current DataChannel implementation supports one active file transfer at a time per session.
   - Concurrent file transmissions over the same DataChannel are rejected with "Receiver busy with another transfer". Folder-level batching is slated for subsequent milestones.
3. **P2P NAT Traversal & STUN Reliance:**
   - Transfers rely on direct peer-to-peer UDP connectivity established via Google public STUN (`stun:stun.l.google.com:19302`).
   - In symmetric NAT or restrictive enterprise firewall environments (where direct UDP hole punching fails), connections will transition to `failed`.
   - In accordance with strict Spark Free Tier constraints, paid TURN relays are deliberately not provisioned.
4. **No Resume on Abrupt Disconnection:**
   - If the underlying WebRTC PeerConnection drops or is closed mid-transfer, the partial `.part` file is deleted and the transfer fails.
   - Resume from offset is not supported in the V1 protocol and will be considered in future protocol revisions.
5. **Foreground App Execution on Android:**
   - File transfer runs in coroutine scope attached to the application/ViewModel. If the user swipes the app away from recent tasks, ongoing file transfers will be interrupted.
   - Background multi-hour transfers without user presence will require dedicated foreground service binding.
6. **Strict Deployment Ban Maintained:**
   - In accordance with explicit instructions, Firestore Security Rules remain undeployed locally in `firebase/firestore.rules`.
   - `firebase deploy` has **not** been executed.

