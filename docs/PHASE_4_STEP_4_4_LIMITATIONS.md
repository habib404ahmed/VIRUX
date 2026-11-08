# VIRUX — Phase 4, Step 4.4 Limitations & Operational Boundaries
## Known Limitations, Network Constraints & Future Considerations

**Date:** 2026-11-08  
**Project:** VIRUX — Your Devices. One Ecosystem.  
**Package:** `com.virux.app`  
**Firebase Project ID:** `virux-504a5`  
**Status:** Documented  

---

## 1. Network & NAT Traversal Constraints (STUN-Only)

VIRUX operates strictly on the **Firebase Spark Free Tier** without paid infrastructure. Direct peer-to-peer WebRTC connections rely exclusively on the public Google STUN server (`stun:stun.l.google.com:19302`).

### Known Failure Scenarios:
1. **Symmetric NATs & CGNAT:** When both the Android phone and PC browser are behind symmetric NATs or carrier-grade cellular NATs, STUN candidate reflection cannot discover direct UDP port mappings.
2. **Restrictive Corporate / Enterprise Firewalls:** Corporate networks that block non-HTTP/HTTPS outbound UDP traffic (ports outside 80/443) will prevent WebRTC direct peer connectivity.
3. **TURN Server Requirement:** A reliable TURN relay (such as Coturn or managed Twilio/Xirsys WebRTC relays) is required to guarantee 100% connectivity across all network topologies. Because VIRUX strictly respects the zero-cost Spark tier, **no TURN relay is active**. Any future TURN server deployment must be evaluated as an independent infrastructure decision requiring explicit authorization.

---

## 2. Android MediaProjection & OS Boundaries

1. **No Background Capture Initiation:** Under Android 14 (API 34) and Android 15 (API 35), `createScreenCaptureIntent()` **must** be launched from a visible, focused Android Activity. An app cannot start screen capture silently or purely from a background push notification.
2. **Single-Use Token Enforcement:** A `MediaProjection` consent token cannot be saved, restored, or used across multiple sessions. Every new screen mirroring session requires fresh approval on the handset.
3. **`FLAG_SECURE` Display Shielding:** By Android OS security design, surfaces protected by `WindowManager.LayoutParams.FLAG_SECURE` (such as banking applications, password managers, and DRM-protected media streams like Netflix) will render as black rectangles in the mirrored stream. This is an intended operating system security boundary that VIRUX will never bypass.
4. **Orientation Changes & Display Resizing:** When the Android device rotates between portrait and landscape, the `ScreenCapturerAndroid` pipeline adapts dynamically, but may introduce brief frame resizing artifacts on the Web Dashboard viewport.

---

## 3. Hardware Video Encoding & Device Performance

1. **Hardware Encoder Availability:** `DefaultVideoEncoderFactory` attempts to instantiate hardware `MediaCodec` encoders for H.264 or VP8. On low-end handsets or certain custom ROMs lacking hardware H.264 encoders, WebRTC falls back to software encoding (VP8), which increases CPU usage and battery drain.
2. **Default Stream Parameters:** To ensure stability across mid-range mobile hardware without thermal throttling, default resolution is capped at **720p at 30 fps** (~1.5–2.5 Mbps). Higher resolutions (1080p 60fps) require substantial wireless bandwidth and thermal overhead.
3. **Network Congestion:** On congested Wi-Fi networks, frame drops and packet latency may occur. VIRUX does not currently implement aggressive bandwidth probing beyond standard WebRTC GCC (Google Congestion Control).

---

## 4. Teardown & Residual Session Risks

1. **Firestore Signaling Latency:** In rare conditions of extreme network packet loss, Firestore session status updates may be delayed by 1–3 seconds before reaching the peer.
2. **Local Control Invariant:** The persistent Android notification with the "Stop Mirroring" button acts as an infallible kill switch that releases all hardware surfaces locally regardless of network or Firestore connectivity.

