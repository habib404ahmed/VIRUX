# VIRUX — Phase 4, Step 4.3 Limitations & Edge Cases
# WebRTC Peer Connection & Screen Mirroring Architecture

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  

---

## 1. Physical Device & Runtime Limitations

### 1.1 Physical MediaProjection Hardware Constraints
- **Tested in Step 4.3:** Android unit test suite (`PeerConnectionLifecycleTest`, `SignalingBatchingTest`) and Kotlin compilation/packaging verification.
- **Untested Physical-Device Scenarios:**
  1. *Hardware Display Surface Binding:* Actual `VirtualDisplay` binding to physical Qualcomm/MediaTek/Google Tensor hardware `MediaCodec` encoders requires a live physical Android handset or booted emulator with GPU passthrough.
  2. *Display Orientation Switches:* When a physical device rotates between portrait (e.g. 1080x2400) and landscape (e.g. 2400x1080), Android triggers runtime configuration changes. In a physical implementation, the `VirtualDisplay` must be resized dynamically to prevent aspect ratio distortion.
  3. *Secure Window / DRM Flag Restrictions:* Android OS blocks `MediaProjection` from capturing windows flagged with `FLAG_SECURE` (e.g. banking apps, password managers, DRM-protected video). When such applications open, the virtual display renders black frames. This is an intended operating-system security feature.

---

## 2. Network & NAT Traversal Limitations

### 2.1 STUN-Only Peer-to-Peer Baseline
- **Configuration:** Google Public STUN (`stun:stun.l.google.com:19302`).
- **Limitation:** In restrictive network environments (e.g. cellular carrier-grade NAT [CGNAT] or strict symmetric enterprise firewalls on both endpoints), direct UDP hole punching will fail without a TURN relay.
- **System Behavior:** When candidate pairs are exhausted without establishing a direct route, the connection state transitions to `failed` and the UI exposes a transparent diagnostic message. VIRUX does not falsely report a connection.
- **Cost Mitigation:** To preserve the Firebase Spark Plan (zero cost), no TURN relay is provisioned in this phase.

---

## 3. ICE Candidate Sequencing Limitations

- **Firestore Security Rules:** Validate that `sequenceNumber is int && >= 0`. Rules do not enforce strict gapless monotonicity across sibling candidate batches.
- **Client Handling:** Monotonic sequencing is maintained in memory by each client runtime. If a network write fails and the client retries, sequence numbers increment before the error is caught, which can introduce gaps in sequence numbers upon retry. Because clients sort by `sequenceNumber ascending`, batches are still consumed in FIFO order, but gaps may be present.

---

## 4. Work Remaining for Subsequent Steps

1. **Step 4.4 (Web Dashboard Live-Stream Playback Viewport):**
   - Refinement of live video rendering, dynamic aspect-ratio scaling, full-screen canvas controls, and latency telemetry on the browser.
2. **Step 4.5 & 4.6 (Secure File-Transfer Protocol & SAF Integration):**
   - WebRTC SCTP `RTCDataChannel` file streaming, chunking, backpressure control, and Storage Access Framework (SAF) integration (strictly deferred per roadmap).

