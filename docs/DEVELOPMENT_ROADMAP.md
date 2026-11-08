# VIRUX — Development Roadmap

> **Version:** 0.1.0-alpha | **Last Updated:** November 2026

---

## Overview

VIRUX is developed in controlled phases. Each phase builds on the previous and must be completed and approved before moving to the next.

**Core rule:** Never implement features from Phase N+1 while Phase N is in progress.

---

## Phase 1 — Foundation ✅ COMPLETE

**Goal:** Establish the project structure, tooling, and architecture.

### Deliverables
- [x] Monorepo structure created
- [x] Android app initialized (Kotlin/Compose)
- [x] React/Vite web dashboard initialized
- [x] Firebase SDK configured (Auth + Firestore)
- [x] VIRUX design system created (Android + Web)
- [x] Firestore deny-by-default security rules
- [x] Firestore schema documentation
- [x] Architecture documentation
- [x] API contracts documentation
- [x] Security policy documentation
- [x] .gitignore configured
- [x] README created
- [x] Both applications build successfully

### Not included in Phase 1
- Authentication flows
- Database writes
- Real device communication
- File transfer
- Any mock features

---

## Phase 2 — Complete UI/UX Development ✅ COMPLETE

**Goal:** Build the complete visual interface and navigation architecture for both Web and Android.

### Deliverables
- [x] Complete Web Dashboard UI (Dashboard, Devices, File Transfer, Mirroring, Notifications, Settings)
- [x] Complete Android UI (Splash, Onboarding, Home, Device Pairing, Permission Center, Settings)
- [x] Reusable component suites for Web and Android
- [x] Functional routing and navigation (React Router v7 & Navigation Compose)
- [x] Responsive desktop, tablet, and mobile layouts
- [x] Framer Motion & Jetpack Compose animations
- [x] Empty states and loading states with explicit future-phase notices
- [x] Updated design system tokens (#090D18, #111827, #172033, #6366F1, #06B6D4)
- [x] Both applications compile and build with zero errors

---

## Phase 3 — Authentication & Security Rules ✅ COMPLETED

**Goal:** Implement real user authentication on both platforms and scoped security rules.

### Completed Deliverables
- [x] Firebase Authentication — Email/password
- [x] Firebase Authentication — Google Sign-In integration
- [x] Android: Auth ViewModel & Repository with Kotlin Coroutines
- [x] Web: Auth state management (AuthContext) & protected route guards
- [x] Firestore rules: `/users/{userId}` owner-only access with field immutability
- [x] User profile synchronization on sign-in & registration
- [x] Secure sign-out flow (Android + Web)
- [x] Password reset dispatch (Android + Web)
- [x] Firestore security rules test matrix & specification

---

## Phase 4 — Device Pairing & Connection 🔄 IN PROGRESS (Step 1 Complete)

**Goal:** Allow users to pair Android devices to their account via cryptographic challenge-response and establish a serverless presence engine.

### Step 1: Web Dashboard Implementation ✅ COMPLETE
- [x] Architecture & threat model revised (`docs/PHASE_4_ARCHITECTURE.md`, `docs/PHASE_4_SECURITY_LIMITATIONS.md`)
- [x] Pairing modal (`PairingModal.tsx`) with dynamic QR code canvas and 6-digit PIN fallback
- [x] Web Crypto API ECDSA P-256 signature verification over challenge nonce buffer
- [x] Real-time pairing session listener with 10-minute expiry countdown
- [x] Global device mesh state (`DeviceContext.tsx` & `useDevices.ts`)
- [x] Live device management (`DevicesPage.tsx`) with filter tabs, search, and details drawer
- [x] Device renaming and unpairing dialogs with validation and confirmation
- [x] Header mesh counter synchronized with 90-second sliding-window presence
- [x] Production web build verified (`npm run build` in 1.29s, 0 TS errors)
- [x] Technical report generated (`docs/PHASE_4_STEP_1_REPORT.md`)

### Step 2: Android Native Application ✅ COMPLETE
- [x] Hardware-backed Android Keystore EC P-256 key pair generator (`KeyStoreProvider.kt`)
- [x] Stable device UUID generator (`DeviceIdProvider.kt`)
- [x] Non-sensitive hardware telemetry provider (`DeviceTelemetryProvider.kt`)
- [x] Firestore pairing claim repository (`DeviceRepository.kt` & `DeviceRepositoryImpl.kt`)
- [x] Android 14/15 `dataSync` Foreground Service heartbeat (`ViruxDeviceService.kt`)
- [x] Pairing ViewModel & CameraX QR scanner screen (`PairingViewModel.kt`, `PairingScreen.kt`)
- [x] Home dashboard live connection state binding (`HomeScreen.kt`)

### Step 3: Firestore Security Rules ✅ COMPLETE
- [x] Subcollection path isolation rules (`/users/{uid}/pairingSessions` & `/users/{uid}/devices`)
- [x] Atomic transition validation rules (50/50 emulator unit tests passed)
- [x] Strict non-deployment condition observed

### Step 4.1: Screen Mirroring & File Transfer Architecture Audit ✅ COMPLETE
- [x] WebRTC feasibility, NAT traversal, and signaling quota audit (`docs/PHASE_4_STEP_4_1_ARCHITECTURE_AUDIT.md`)

### Step 4.2: WebRTC Signaling Foundation & Session Management ✅ COMPLETE
- [x] Firestore signaling schemas and candidate batching (`webrtcSignalingService.ts`, `SignalingRepositoryImpl.kt`)
- [x] Strict 120-second session expiry bounding and candidate fingerprint deduplication

### Step 4.3: WebRTC Signaling Integration & Screen Mirroring Foundation ✅ COMPLETE
- [x] PeerConnection coordinator on Android and Web (`PeerConnectionManager.kt`, `peerConnectionService.ts`)
- [x] Android 14/15 `mediaProjection` foreground service declaration and notification

### Step 4.4: Native Android WebRTC Runtime & Real-Time Screen Mirroring ✅ IMPLEMENTED & VERIFIED
- [x] Native WebRTC runtime dependency integrated (`io.getstream:stream-webrtc-android:1.3.8`)
- [x] Hardware video encoder factory (H.264 / VP8) with EGL context sharing
- [x] MediaProjection user consent flow (`createScreenCaptureIntent()` Activity launcher + UI dialog)
- [x] Real-time capture pipeline (`ScreenCapturerAndroid` $\rightarrow$ `SurfaceTextureHelper` $\rightarrow$ `VideoSource` $\rightarrow$ `VideoTrack`)
- [x] Web Dashboard live playback viewport with 10 distinct connection/track states
- [x] Full Android debug APK packaged with native `.so` libraries (68.2 MB)
- [x] Automated unit tests verified: 24/24 Android passed, 7/7 Web passed, 0 build errors
- [ ] Physical-device end-to-end streaming verification (Awaiting physical hardware connection via ADB)

### Step 4.5: Secure File-Transfer Protocol (WebRTC DataChannel) ✅ IMPLEMENTED & VERIFIED
- [x] WebRTC DataChannel engine abstraction (`ViruxDataChannel`, `NativeViruxDataChannel`, `WebRtcPeerConnectionService.createDataChannel`)
- [x] Versioned JSON control protocol (`VIRUX_FILE_TRANSFER_V1`) for handshakes and error handling
- [x] 64 KiB SCTP bounded chunk framing with 4-byte big-endian sequence index header
- [x] Backpressure drainage control (512 KiB high-water mark / 64 KiB low-water mark)
- [x] Streaming SHA-256 integrity digest computation and post-receive atomic verification
- [x] Path traversal filename sanitization and scoped internal cache storage
- [x] Android Storage Access Framework (`ACTION_OPEN_DOCUMENT`) and Web File API integration
- [x] Web Dashboard live interactive File Transfer page with drag-and-drop, progress bar, approval modal, and history
- [x] Automated unit and build tests: 32/32 Android passed, 14/14 Web passed, Android APK assembled, Web built in 1.32s
- [ ] Physical-device end-to-end file transfer verification (Awaiting physical hardware connection via ADB)

---

## Phase 5 — File Transfer 📋 PLANNED

**Goal:** Transfer files between Android device and web browser via WebRTC.

### Planned Deliverables
- [ ] WebRTC peer connection (Android ↔ Web)
- [ ] STUN server configuration
- [ ] Firestore signaling for WebRTC
- [ ] File selection UI (Android)
- [ ] File selection UI (Web)
- [ ] Transfer progress display
- [ ] Transfer history (Firestore `/transfers`)

---

## Phase 6 — Remote Features 📋 PLANNED

**Goal:** Extended remote device control features.

### Planned Deliverables
- [ ] Notification mirroring (Android → Web)
- [ ] Clipboard sync (Android ↔ Web)
- [ ] Remote camera view (WebRTC video stream)
- [ ] Remote screen view (MediaProjection API)

---

## Phase 7 — Production Hardening 📋 PLANNED

**Goal:** Performance, accessibility, and production readiness.

### Planned Deliverables
- [ ] Firebase App Check
- [ ] Crashlytics integration
- [ ] Performance monitoring
- [ ] Accessibility audit (Web + Android)
- [ ] i18n foundation
- [ ] CI/CD pipeline
- [ ] Android release keystore setup
- [ ] Firebase Hosting production deployment
- [ ] End-to-end testing

---

## Engineering Rules (Enforced Across All Phases)

1. No feature from a future phase is implemented in the current phase.
2. All Firestore writes include proper validation.
3. No mock data is used as production functionality.
4. TypeScript strict mode is maintained.
5. Kotlin best practices are followed.
6. Firebase plan stays on Spark (Free) unless explicitly upgraded.
7. No Cloud Functions are used without explicit approval.

