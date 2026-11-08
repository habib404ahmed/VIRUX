# VIRUX — Firestore Database Schema

> **Version:** 0.1.0-alpha | **Phase:** 1 — Schema Definition
> This document defines collection structures. No data is written until Phase 2.

---

## Security Model

All collections use **deny-by-default** rules in Phase 1. Access rules are added incrementally per phase, with authentication required for all production access.

---

## Collection: `users`

**Purpose:** Stores user profile data created when a user registers or first signs in.

**Path:** `/users/{userId}`

**Access:** Authenticated user can read/write their own document only (`request.auth.uid == userId`).

```
users/
└── {userId}             # document ID == Firebase Auth UID
    ├── uid              : string      # Firebase Auth UID (redundant but useful for queries)
    ├── email            : string      # User email address
    ├── displayName      : string      # Display name (from Auth or user-set)
    ├── photoURL         : string?     # Profile picture URL (nullable)
    ├── createdAt        : timestamp   # Account creation time
    ├── updatedAt        : timestamp   # Last profile update
    ├── plan             : string      # 'free' | 'pro' (always 'free' on Spark)
    └── settings         : map
        ├── notificationsEnabled : boolean
        ├── theme                : string    # 'dark' (only theme in Phase 1)
        └── language             : string    # e.g. 'en'
```

**Validation:**
- `uid` must equal the authenticated user's UID.
- `email` must be a valid email format.
- `createdAt` is set once on creation, never updated.

---

## Collection: `devices`

**Purpose:** Registry of all Android devices registered by a user.

**Path:** `/devices/{deviceId}`

**Access:** Owner (`ownerId == request.auth.uid`) can read/write their device documents.

```
devices/
└── {deviceId}           # Unique device ID (UUID generated on first app launch)
    ├── deviceId         : string      # Same as document ID
    ├── ownerId          : string      # Firebase Auth UID of the owner
    ├── name             : string      # User-defined device name (e.g. "My Pixel 9")
    ├── model            : string      # Device model (e.g. "Pixel 9 Pro")
    ├── manufacturer     : string      # e.g. "Google"
    ├── androidVersion   : string      # e.g. "15"
    ├── sdkVersion       : number      # Android SDK level (e.g. 35)
    ├── appVersion       : string      # VIRUX app version installed on device
    ├── fcmToken         : string?     # FCM registration token (nullable until FCM Phase)
    ├── isOnline         : boolean     # Last known online status
    ├── lastSeenAt       : timestamp   # Last heartbeat timestamp
    ├── registeredAt     : timestamp   # Device first paired timestamp
    └── capabilities     : map
        ├── fileTransfer   : boolean
        ├── notifications  : boolean
        ├── clipboard      : boolean
        └── screenMirror   : boolean
```

**Validation:**
- `ownerId` must equal the authenticated user's UID.
- `deviceId` must equal the document ID.
- `sdkVersion` must be >= 26 (minSdk).

**Relationships:**
- `ownerId` → `/users/{ownerId}`

---

## Collection: `deviceConnections`

**Purpose:** Tracks active pairing sessions between a device and a web client.

**Path:** `/deviceConnections/{connectionId}`

**Access:** Only the device owner can create/read/delete.

```
deviceConnections/
└── {connectionId}       # UUID
    ├── connectionId     : string      # Same as document ID
    ├── ownerId          : string      # Firebase Auth UID
    ├── deviceId         : string      # Reference to /devices/{deviceId}
    ├── clientType       : string      # 'web' | 'android'
    ├── clientId         : string      # Identifier for the connected client (browser session ID or device ID)
    ├── status           : string      # 'pending' | 'connected' | 'disconnected'
    ├── createdAt        : timestamp
    ├── connectedAt      : timestamp?
    └── disconnectedAt   : timestamp?
```

**Relationships:**
- `deviceId` → `/devices/{deviceId}`
- `ownerId` → `/users/{ownerId}`

---

## Collection: `transfers`

**Purpose:** Tracks file transfer metadata for history and monitoring.

**Path:** `/transfers/{transferId}`

**Access:** Owner only.

```
transfers/
└── {transferId}         # UUID
    ├── transferId       : string      # Same as document ID
    ├── ownerId          : string      # Firebase Auth UID
    ├── sourceDeviceId   : string      # Sending device ID
    ├── destinationId    : string      # Receiving device or web client ID
    ├── fileName         : string      # Original file name
    ├── fileSize         : number      # Size in bytes
    ├── mimeType         : string      # MIME type (e.g. "image/jpeg")
    ├── status           : string      # 'pending' | 'transferring' | 'complete' | 'failed'
    ├── progress         : number      # 0–100 (percentage)
    ├── transferMethod   : string      # 'webrtc' | 'firebase_storage' (future)
    ├── createdAt        : timestamp
    ├── completedAt      : timestamp?
    └── errorMessage     : string?
```

**Note:** Actual file bytes are NOT stored in Firestore. Files travel via WebRTC data channels (Phase 5) or Firebase Storage (Blaze plan — not used in Phase 1).

---

## Collection: `webrtcSessions`

**Purpose:** Ephemeral signaling documents for WebRTC peer connection establishment (offer/answer/ICE).

**Path:** `/webrtcSessions/{sessionId}`

**Access:** Owner only. Documents are deleted after connection is established.

```
webrtcSessions/
└── {sessionId}          # UUID
    ├── sessionId        : string
    ├── ownerId          : string
    ├── deviceId         : string
    ├── offer            : map?
    │   ├── type         : string   # 'offer'
    │   └── sdp          : string   # SDP string
    ├── answer           : map?
    │   ├── type         : string   # 'answer'
    │   └── sdp          : string
    ├── status           : string   # 'waiting' | 'connecting' | 'connected' | 'closed'
    ├── createdAt        : timestamp
    └── expiresAt        : timestamp  # TTL — sessions expire after 10 minutes
```

**Subcollection: `webrtcSessions/{sessionId}/iceCandidates`**

```
iceCandidates/
└── {candidateId}
    ├── candidate        : string
    ├── sdpMid           : string?
    └── sdpMLineIndex    : number?
```

**Note:** This collection is ephemeral. Consider adding a cleanup mechanism (Phase 3).

---

## Collection: `notifications`

**Purpose:** Stores notification history mirrored from Android devices to the web dashboard.

**Path:** `/notifications/{notificationId}`

**Access:** Owner only.

```
notifications/
└── {notificationId}     # UUID
    ├── notificationId   : string
    ├── ownerId          : string
    ├── sourceDeviceId   : string
    ├── packageName      : string   # App package name (e.g. "com.whatsapp")
    ├── appName          : string   # Human-readable app name
    ├── title            : string   # Notification title
    ├── body             : string   # Notification body text
    ├── isRead           : boolean
    ├── receivedAt       : timestamp
    └── metadata         : map?
        ├── iconBase64   : string?  # App icon (Phase 6)
        └── actions      : array?   # Notification action buttons
```

---

## Indexing Strategy (Phase 1)

No composite indexes are configured in Phase 1. The following will be added in later phases:

| Collection | Fields | Phase |
|---|---|---|
| `devices` | `ownerId ASC`, `lastSeenAt DESC` | Phase 3 |
| `transfers` | `ownerId ASC`, `createdAt DESC` | Phase 5 |
| `notifications` | `ownerId ASC`, `receivedAt DESC`, `isRead ASC` | Phase 6 |

