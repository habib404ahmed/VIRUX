# VIRUX

> **Your Devices. One Ecosystem.**

VIRUX is a cross-platform Android device management ecosystem. It allows users to manage, monitor, and communicate with their Android devices from a secure web dashboard in real time.

---

## Project Structure

```
VIRUX/
├── android-app/        # Kotlin/Jetpack Compose Android application
├── web-dashboard/      # React/Vite/TypeScript web dashboard
├── firebase/           # Firestore rules and Firebase configuration
├── shared/             # Shared contracts and documentation
└── docs/               # Architecture, schema, and roadmap docs
```

---

## Technology Stack

| Platform | Stack |
|---|---|
| Android | Kotlin · Jetpack Compose · Material 3 · Firebase Android SDK |
| Web | React · Vite · TypeScript · Tailwind CSS · Framer Motion |
| Backend | Firebase Auth · Cloud Firestore · FCM · Firebase Hosting |
| Communication | WebRTC · STUN · Firestore signaling |

---

## Getting Started

### Prerequisites

| Tool | Required Version |
|---|---|
| Java (JDK) | 11+ (tested with OpenJDK 25) |
| Android SDK | API 26+ (platform 34, 35 installed) |
| Node.js | 18+ (tested with v24) |
| npm | 9+ (tested with v11) |
| Git | Any recent version |

---

### Running the Web Dashboard

```bash
# 1. Navigate to the web dashboard
cd web-dashboard

# 2. Set up Firebase environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase project credentials

# 3. Start the development server
npm run dev
```

The dashboard will be available at `http://localhost:5173`.

**To build for production:**
```bash
npm run build
```
Output goes to `web-dashboard/dist/`.

---

### Running the Android App

**Option A — Android Studio (recommended)**
1. Open `android-app/` as a project in Android Studio Meerkat or later.
2. Place your `google-services.json` in `android-app/app/`.
3. Sync Gradle and run on a device or emulator (API 26+).

**Option B — Command line (Gradle Wrapper)**
```bash
cd android-app

# Debug build
./gradlew assembleDebug

# Install on connected device
./gradlew installDebug
```

> **Note:** `ANDROID_HOME` must be set to your Android SDK path.
> Example: `$env:ANDROID_HOME = "C:\Users\HABIB\AppData\Local\Android\Sdk"`

---

### Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/) → Project `virux-504a5`.
2. **Android app:** Download `google-services.json` → place in `android-app/app/`.
3. **Web app:** Copy Firebase config values → paste into `web-dashboard/.env.local`.
4. **Firestore rules:** Deploy rules from `firebase/firestore.rules` via Firebase Console or CLI.

---

## Documentation

| Document | Location |
|---|---|
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Database Schema | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) |
| API Contracts | [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) |
| Security | [`docs/SECURITY.md`](docs/SECURITY.md) |
| Roadmap | [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md) |

---

## Current Phase

**Phase 2 — Complete UI/UX Development** ✅

The visual interfaces, reusable component libraries, navigation structures, and responsive layouts for both Android and Web Dashboard are fully built and verified.

**Next:** Phase 3 — Authentication & Security Rules (pending approval)

---

## Firebase Project

- **Project ID:** `virux-504a5`
- **Plan:** Spark (Free)
- **Services in use:** Authentication, Cloud Firestore, FCM (prepared), Hosting

> **Important:** This project intentionally stays on the Firebase Spark (Free) plan. Do not enable Blaze or paid services.

---

## Contributing

This is a private project. Engineering rules are defined in [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md).

---

## License

Private — All rights reserved.

