# VIRUX — Architecture Document

> **Version:** 0.1.0-alpha | **Phase:** 1 — Foundation

---

## 1. Overview

VIRUX is a cross-platform Android device management ecosystem. Users can manage, monitor, and communicate with their Android devices through a secure web dashboard and a native Android application, powered by a Firebase backend and WebRTC for peer-to-peer communication.

**Tagline:** *Your Devices. One Ecosystem.*

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACES                         │
│                                                             │
│  ┌─────────────────────┐    ┌────────────────────────────┐  │
│  │   Android App       │    │   React Web Dashboard      │  │
│  │   (Kotlin / Compose)│    │   (Vite / TypeScript)      │  │
│  └──────────┬──────────┘    └────────────┬───────────────┘  │
│             │                            │                   │
└─────────────┼────────────────────────────┼───────────────────┘
              │                            │
              ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FIREBASE BACKEND                         │
│                                                             │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Authentication │  │   Firestore  │  │      FCM       │  │
│  │  (Email/Google)│  │  (Database)  │  │  (Messaging)   │  │
│  └────────────────┘  └──────┬───────┘  └────────────────┘  │
│                             │                               │
│                    ┌────────┴────────┐                      │
│                    │  WebRTC Signal  │                      │
│                    │  (via Firestore)│                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
              │                            │
              ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                PEER-TO-PEER LAYER (Phase 3)                 │
│                                                             │
│         WebRTC + STUN (Google public STUN servers)         │
│         Direct encrypted data channel between devices       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Android Application
| Layer | Technology |
|---|---|
| Language | Kotlin |
| UI | Jetpack Compose + Material 3 |
| Navigation | Navigation Compose |
| Async | Kotlin Coroutines + Flow |
| Dependency Injection | (Phase 2: Hilt) |
| Firebase | Firebase Android SDK (BOM 33.7.0) |

### Web Dashboard
| Layer | Technology |
|---|---|
| Framework | React 18 |
| Build Tool | Vite 6 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| Icons | Lucide React |
| Routing | React Router DOM v7 |
| Firebase | Firebase JS SDK (modular, v11) |

### Backend (Firebase Spark — Free)
| Service | Purpose |
|---|---|
| Firebase Authentication | User identity |
| Cloud Firestore | Real-time database + WebRTC signaling |
| Firebase Cloud Messaging | Push notifications |
| Firebase Hosting | Web dashboard deployment |

### Communication
| Technology | Role |
|---|---|
| WebRTC | Peer-to-peer data channels |
| STUN (Google) | NAT traversal |
| Firestore | WebRTC offer/answer signaling |

---

## 4. Monorepo Structure

```
VIRUX/
├── android-app/          # Kotlin/Compose Android application
│   ├── app/
│   │   └── src/main/kotlin/com/virux/app/
│   │       ├── core/     # App-wide utilities (Phase 2+)
│   │       ├── data/     # Repositories, data sources (Phase 2+)
│   │       ├── domain/   # Use cases, models (Phase 2+)
│   │       └── ui/
│   │           ├── theme/        # Design system tokens
│   │           ├── navigation/   # NavHost + routes
│   │           └── screens/      # Feature screens
│   └── gradle/
├── web-dashboard/        # React/Vite web dashboard
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── pages/        # Page-level components
│       ├── layouts/      # Layout wrappers
│       ├── hooks/        # Custom React hooks
│       ├── services/     # Firebase service abstractions
│       ├── firebase/     # Firebase initialization
│       ├── types/        # TypeScript interfaces
│       └── utils/        # Design tokens, helpers
├── firebase/             # Firebase configuration files
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── firebase.json
├── shared/
│   ├── contracts/        # Shared API contracts (JSON schemas)
│   └── documentation/    # Shared design specs
└── docs/                 # Project documentation
```

---

## 5. Architecture Principles

1. **Separation of concerns** — Android and Web are independent applications sharing only the Firebase backend.
2. **Modular design** — Features are added per phase without touching existing stable code.
3. **Security-first** — Firestore rules default to deny. Access is granted incrementally per authenticated use case.
4. **No server-side logic** — All logic runs on client or through Firebase rules/triggers. No Cloud Functions (Spark plan).
5. **Offline capability** — Firestore's built-in offline persistence will be enabled for Android in Phase 2.
6. **Real-time by default** — Firestore real-time listeners are used instead of polling.

---

## 6. Phase Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation — Project setup, design system, Firebase config | ✅ Complete |
| 2 | Authentication — Email/Google sign-in, user profiles | 🔜 Pending |
| 3 | Device Pairing — QR code pairing, Firestore device registry | ⏳ Planned |
| 4 | Real-Time Sync — Notifications, battery, device info | ⏳ Planned |
| 5 | File Transfer — P2P WebRTC data channels | ⏳ Planned |
| 6 | Remote Features — Clipboard, notifications mirror | ⏳ Planned |
| 7 | Polish — Performance, accessibility, production hardening | ⏳ Planned |

