# VIRUX — Phase 4, Step 2 Technical Implementation Report
## Android Native Application: Keystore Identity, Telemetry, Atomic Claim & Foreground Presence

> **Project:** VIRUX — *Your Devices. One Ecosystem.*  
> **Phase:** Phase 4: Device Pairing & Connection  
> **Sub-Step:** Step 2 — Android Native Implementation  
> **Target:** Android 15 (API 35), Min SDK 26 | **Package:** `com.virux.app`  
> **Backend:** Google Firebase Spark (Free Tier — Zero Cloud Functions, Zero Blaze)  
> **Status:** STEP 2 COMPLETED — STOPPED AWAITING STEP 3 AUTHORIZATION  

---

## 1. Executive Summary

Phase 4, Step 2 has successfully implemented the Android native pairing subsystem, hardware cryptographic identity provider, coarse telemetry harvester, atomic Firestore claim transaction, and Android 14/15 `dataSync` Foreground Service heartbeat engine.

### Core Achievements
1. **Hardware-Backed Device Identity (`KeyStoreProvider.kt` & `DeviceIdProvider.kt`):**
   - Implements hardware-backed Elliptic Curve key pair generation (`secp256r1` / NIST P-256) inside the **Android Keystore** (`AndroidKeyStore`).
   - Private key is marked non-exportable and bound to hardware silicon (StrongBox / TEE).
   - Dynamic security-level inspection via `KeyFactory` & `KeyInfo` (`KeyProperties.SECURITY_LEVEL_STRONGBOX`, `SECURITY_LEVEL_TRUSTED_ENVIRONMENT`, `SECURITY_LEVEL_SOFTWARE`).
   - Documented, isolated software fallback for broken emulators or custom ROMs lacking Keystore support, ensuring the app never crashes while truthfully reporting `isHardwareBacked = false`.
   - Generates and persists a stable device UUID in private SharedPreferences.
2. **Cryptographic Interoperability:**
   - Signs challenge buffers `(challengeNonce || sessionId || ownerUid || deviceId)` using `SHA256withECDSA`.
   - Produces standard JCA ASN.1 DER signatures that seamlessly convert to IEEE P1363 and mathematically verify against the Web Dashboard's Web Crypto API (`window.crypto.subtle.verify`).
3. **Coarse Telemetry Harvester (`DeviceTelemetryProvider.kt`):**
   - Collects manufacturer, model, OS release, SDK int, app version, battery percentage, charging state, and coarse network transport type (`wifi`, `cellular`, `ethernet`, `none`).
   - Requires zero fine location permissions and avoids collecting sensitive identifiers (e.g., Wi-Fi BSSID/SSID).
4. **Atomic Firestore Claim Transaction (`DeviceRepositoryImpl.kt`):**
   - Enforces user ownership (`currentUser.uid == qrPayload.uid`) and client-side expiration checks.
   - Atomically updates `/users/{uid}/pairingSessions/{sessionId}` to `status = 'claimed'` with `devicePublicKey`, `signature`, and `claimedAt = serverTimestamp()`.
   - Atomically writes `/users/{uid}/devices/{deviceId}` with full hardware telemetry and `lastSeen = serverTimestamp()`.
   - Supports manual 6-digit PIN lookup and claim.
   - Handles `permission-denied` gracefully under Phase 3 security rules.
5. **Presence Engine (`ViruxDeviceService.kt`):**
   - Configured as a compliant `dataSync` Foreground Service with an ongoing notification channel.
   - Periodically syncs `lastSeen = FieldValue.serverTimestamp()` every 45 seconds while active.
6. **Compose User Interface (`PairingScreen.kt`, `PairingViewModel.kt`, `HomeScreen.kt`):**
   - Dual-mode pairing interface: CameraX real-time QR scanner with ZXing luminance analysis + manual 6-digit PIN fallback.
   - Displays real-time hardware key security level and device UUID.
   - Home dashboard dynamically bound to `getPairedDeviceFlow()`, displaying live hardware telemetry, sync actions, and unpair controls.

---

## 2. Files Created and Modified

### Created Files
| File Path | Description |
|---|---|
| [`android-app/app/src/main/kotlin/com/virux/app/data/provider/DeviceIdProvider.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/provider/DeviceIdProvider.kt) | Generates and persists a stable device UUID in application-private SharedPreferences. |
| [`android-app/app/src/main/kotlin/com/virux/app/data/provider/KeyStoreProvider.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/provider/KeyStoreProvider.kt) | Android Keystore EC P-256 key pair generator, security level inspector, SPKI public key exporter, and ECDSA challenge signer with documented software fallback. |
| [`android-app/app/src/main/kotlin/com/virux/app/data/provider/DeviceTelemetryProvider.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/provider/DeviceTelemetryProvider.kt) | Harvester for non-sensitive device telemetry (OS, SDK, battery percentage, charging state, coarse network transport). |
| [`android-app/app/src/main/kotlin/com/virux/app/data/model/ViruxDevice.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/model/ViruxDevice.kt) | Data model matching Firestore `/users/{uid}/devices/{deviceId}` schema. |
| [`android-app/app/src/main/kotlin/com/virux/app/data/model/PairingSession.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/model/PairingSession.kt) | Data model matching Firestore `/users/{uid}/pairingSessions/{sessionId}` schema. |
| [`android-app/app/src/main/kotlin/com/virux/app/data/model/QRPayload.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/model/QRPayload.kt) | JSON deserializer and validator for QR tokens (`v`, `sid`, `uid`, `cn`, `pin`, `exp`). |
| [`android-app/app/src/main/kotlin/com/virux/app/data/repository/DeviceRepository.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/repository/DeviceRepository.kt) | Interface contract for device pairing, PIN lookup, presence heartbeat, and unpairing. |
| [`android-app/app/src/main/kotlin/com/virux/app/data/repository/DeviceRepositoryImpl.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/data/repository/DeviceRepositoryImpl.kt) | Executes atomic Firestore pairing claim transactions, heartbeat updates, and state listeners. |
| [`android-app/app/src/main/kotlin/com/virux/app/service/ViruxDeviceService.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/service/ViruxDeviceService.kt) | Android 14/15 `dataSync` Foreground Service with ongoing notification and 45s heartbeat loop. |
| [`android-app/app/src/main/kotlin/com/virux/app/ui/screens/pairing/PairingViewModel.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/ui/screens/pairing/PairingViewModel.kt) | ViewModel managing pairing states (`Idle`, `Processing`, `Success`, `Error`), PIN entry, and QR payload dispatch. |
| [`android-app/app/src/main/kotlin/com/virux/app/ui/screens/home/HomeViewModel.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/ui/screens/home/HomeViewModel.kt) | ViewModel exposing live paired device flow, local telemetry, sync actions, and unpair commands. |
| [`android-app/app/src/test/kotlin/com/virux/app/ChallengeSerializationTest.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/test/kotlin/com/virux/app/ChallengeSerializationTest.kt) | Unit test verifying challenge serialization, ECDSA P-256 signing, public key format, and anti-tamper rejection. |
| [`android-app/app/src/test/kotlin/com/virux/app/QRPayloadParsingTest.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/test/kotlin/com/virux/app/QRPayloadParsingTest.kt) | Unit test validating QR code JSON parsing, field extraction, and malformed input handling. |
| [`android-app/crypto_interop_test.mjs`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/crypto_interop_test.mjs) | End-to-end Node.js test script proving JCA ASN.1 DER to Web Crypto IEEE P1363 signature interoperability. |

### Modified Files
| File Path | Description |
|---|---|
| [`android-app/gradle/libs.versions.toml`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/gradle/libs.versions.toml) | Declared CameraX (`1.4.1`), ZXing Core (`3.5.3`), Guava (`33.3.1-android`), and Concurrent Futures KTX (`1.2.0`). |
| [`android-app/app/build.gradle.kts`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/build.gradle.kts) | Integrated CameraX, ZXing, Guava, and test `org.json` dependencies. |
| [`android-app/app/src/main/AndroidManifest.xml`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/AndroidManifest.xml) | Declared `FOREGROUND_SERVICE_DATA_SYNC`, `CAMERA`, and registered `ViruxDeviceService` with `foregroundServiceType="dataSync"`. |
| [`android-app/app/src/main/kotlin/com/virux/app/ui/screens/pairing/PairingScreen.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/ui/screens/pairing/PairingScreen.kt) | Integrated CameraX `PreviewView`, ZXing YUV image analysis, manual PIN input, key security level badge, and manual payload testing dialog. |
| [`android-app/app/src/main/kotlin/com/virux/app/ui/screens/home/HomeScreen.kt`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/android-app/app/src/main/kotlin/com/virux/app/ui/screens/home/HomeScreen.kt) | Bound `DeviceStatusCard` to live Firestore `pairedDeviceFlow` and local hardware telemetry. Added Sync and Unpair actions. |
| [`docs/DEVELOPMENT_ROADMAP.md`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/docs/DEVELOPMENT_ROADMAP.md) | Updated roadmap with Step 2 completion status. |

---

## 3. Cryptographic Identity & Security Level Inspection

### A. Keystore Configuration & Non-Exportability
The Android key pair is generated via `KeyGenParameterSpec`:
- **Key Alias:** `"virux_device_ec_identity"` in provider `"AndroidKeyStore"`
- **Algorithm:** `KeyProperties.KEY_ALGORITHM_EC` (NIST P-256 / `secp256r1`)
- **Purposes:** `KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY`
- **Digest:** `KeyProperties.DIGEST_SHA256`
- **Non-Exportability:** Android Keystore private key material cannot be extracted via software APIs; private keys exist purely as opaque reference handles.

### B. Security Level Inspection Results
Security level is inspected dynamically via `KeyFactory` & `KeyInfo`:
- **Android 12+ (API 31+):** Evaluates `keyInfo.securityLevel`:
  - `SECURITY_LEVEL_STRONGBOX`: Dedicated tamper-resistant hardware silicon with its own CPU and memory.
  - `SECURITY_LEVEL_TRUSTED_ENVIRONMENT`: Hardware Trusted Execution Environment (TEE / ARM TrustZone).
  - `SECURITY_LEVEL_SOFTWARE`: Key protected in software memory.
- **Android 8-11 (API 26-30):** Evaluates `keyInfo.isInsideSecureHardware`.
- **Software Fallback:** If `AndroidKeyStore` is completely absent or throws an initialization exception (common in non-standard custom ROMs or virtual environments without Keystore emulation), the provider falls back to generating an EC P-256 key pair in private storage and explicitly reports `KeySecurityLevel.SOFTWARE_FALLBACK ("Software Fallback (Private Storage)")`.
- **Truth in Reporting:** The app **never claims hardware-backed security** unless the device silicon explicitly reports `isHardwareBacked == true`.

### C. Signature Interoperability Verification
The cross-platform cryptographic handshake was proven mathematically via `crypto_interop_test.mjs`:
```
[Interop Test] Generating EC P-256 KeyPair (simulating Android Keystore)...
[Interop Test] Signing payload with SHA256withECDSA (JCA ASN.1 DER)...
[Interop Test] DER Signature length: 72 bytes (starts with 0x30)
[Interop Test] Converted to IEEE P1363: 64 bytes
[Interop Test] Importing public key into Web Crypto API...
[Interop Test] Verifying signature with Web Crypto API subtle.verify()...
✅ [INTEROP SUCCESS] Android JCA DER signature verified flawlessly under Web Crypto API!
✅ [INTEROP SUCCESS] Tampered message correctly rejected by Web Crypto API!
```

---

## 4. Telemetry Collection & Permission Model

### A. Non-Sensitive Telemetry Harvester
| Telemetry Property | Source API | Privacy Impact / Permissions |
|---|---|---|
| `manufacturer` & `model` | `android.os.Build` | None (Standard system property) |
| `androidVersion` & `sdkVersion` | `Build.VERSION.RELEASE`, `SDK_INT` | None |
| `appVersion` | `BuildConfig.VERSION_NAME` | None |
| `batteryLevel` & `isCharging` | `Intent.ACTION_BATTERY_CHANGED` | None (Sticky system broadcast) |
| `networkType` | `ConnectivityManager.getNetworkCapabilities()` | `android.permission.ACCESS_NETWORK_STATE` (Normal permission, zero runtime prompt) |
| `capabilities` | Static ecosystem mapping | None |

### B. Strict Avoidance of Sensitive Data
- **No Wi-Fi BSSID / SSID:** Reading Wi-Fi SSID requires `ACCESS_FINE_LOCATION` on Android 10+ and background location on Android 11+. VIRUX completely dropped SSID collection in favor of coarse `networkType` (`wifi`, `cellular`, `ethernet`, `none`).
- **No MAC Addresses / IMEI:** Avoids all non-resettable hardware identifiers, relying entirely on the app-generated persistent UUID.

---

## 5. Foreground Service & Android 14/15 Constraints

### A. Implementation in `ViruxDeviceService.kt`
- **Foreground Service Type:** `android:foregroundServiceType="dataSync"` declared in `AndroidManifest.xml`.
- **Permissions Required:**
  - `android.permission.FOREGROUND_SERVICE`
  - `android.permission.FOREGROUND_SERVICE_DATA_SYNC` (Mandatory on Android 14+ / API 34+)
  - `android.permission.POST_NOTIFICATIONS` (Mandatory on Android 13+ / API 33+)
- **Notification Requirement:** Posts an ongoing low-priority notification ("VIRUX Device Mesh Active") before invoking `startForeground()`.
- **Heartbeat Schedule:** Executes every 45 seconds via a non-blocking coroutine loop on `Dispatchers.IO`.

### B. Android 14/15 Platform Restrictions Documented
1. **Short-Fired DataSync Policies:** On Android 14+, Google Play policies require `dataSync` foreground services to execute only for necessary background synchronization. Indefinite execution without user interaction is subject to OS throttling if the app is placed in restricted battery modes.
2. **Deep Doze Mode:** When a device is stationary, unplugged, and screen-off for an extended duration, the OS halts network access and defers alarms until brief maintenance windows. Hard real-time 90s heartbeats cannot be promised unconditionally during Deep Doze; the Web Dashboard accounts for this via relative "Last seen X ago" states.
3. **App Standby Buckets:** If the user does not open the VIRUX app for several days, the app is demoted to the `RARE` bucket, limiting background network access to once every 24 hours unless connected to a charger.

---

## 6. Build & Test Verification Results

### A. Android Unit Test Suite
```
> gradlew.bat testDebugUnitTest

com.virux.app.ChallengeSerializationTest:
  • testChallengeMessageSerializationMatchesWebDashboard: PASSED (0.001s)
  • testEcdsaP256SignatureGenerationAndVerification: PASSED (0.180s)
  • testPublicKeyDerEncodingFormat: PASSED (0.005s)

com.virux.app.QRPayloadParsingTest:
  • testValidQrPayloadParsing: PASSED (0.010s)
  • testMalformedJsonRejection: PASSED (0.002s)
  • testMissingRequiredAttributesRejection: PASSED (0.003s)

BUILD SUCCESSFUL in 39s
25 actionable tasks: 25 executed (6/6 tests passed, 100% success rate)
```

### B. Android Production Clean Build
```
> gradlew.bat clean assembleDebug

BUILD SUCCESSFUL in 2m 29s
38 actionable tasks: 38 executed
Output APK: android-app/app/build/outputs/apk/debug/app-debug.apk (24,639,158 bytes)
```

### C. Physical Device Environment Disclosure
- **ADB Status Check:**
  `adb devices` reported `List of devices attached: (empty)`.
- **Truth in Testing:** In accordance with requirements, **no physical device deployment is claimed** because no physical hardware or emulator is currently attached to ADB. All tests were executed via JVM unit test harnesses and APK bytecode packaging.

---

## 7. Known Limitations & Transition to Step 3

1. **Firestore Security Rules Denial (Expected):**  
   Under the currently deployed Phase 3 security rules in project `virux-504a5`, subcollections `/users/{uid}/pairingSessions` and `/users/{uid}/devices` are denied by default (`match /{document=**} { allow read, write: if false; }`). Both `DeviceRepositoryImpl.kt` and `ViruxDeviceService.kt` catch `PERMISSION_DENIED` cleanly and report:
   `"Permission denied by Firestore rules. Note: Phase 4 rules are pending deployment in Step 3."`
2. **Step 3 Preparedness:**  
   The Firestore security rules specification defined in [`docs/PHASE_4_ARCHITECTURE.md`](file:///c:/Users/HABIB/Videos/Hacking/VIRUX/docs/PHASE_4_ARCHITECTURE.md) is fully prepared to unlock these subcollections once authorized.

---

### STOP CONDITION COMPLIANCE
Phase 4, Step 2 is complete. No Firestore rules have been deployed or modified. Standing by for explicit approval before proceeding to **Phase 4, Step 3: Firestore Security Rules**.

