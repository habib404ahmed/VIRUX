# VIRUX — API Contracts

> **Version:** 0.1.0-alpha | **Phase:** 1 — Contract Definitions

This document defines the data contracts shared between the Android app and the web dashboard. These are implemented as Firestore document schemas and must be kept in sync across both platforms.

---

## Contract Versioning

All contracts include a `schemaVersion` field (added in Phase 2) to support future migrations without breaking existing clients.

---

## Device Heartbeat Contract

Sent from Android to Firestore every 30 seconds while the app is in foreground.

```json
{
  "deviceId": "uuid-string",
  "isOnline": true,
  "lastSeenAt": "Firestore.Timestamp",
  "batteryLevel": 85,
  "isCharging": false,
  "networkType": "wifi"
}
```

**Fields:**
| Field | Type | Description |
|---|---|---|
| `deviceId` | string | Matches the device document ID |
| `isOnline` | boolean | Always `true` when heartbeat is sent |
| `lastSeenAt` | Timestamp | Server timestamp at time of write |
| `batteryLevel` | number | Battery percentage (0–100) |
| `isCharging` | boolean | Whether device is charging |
| `networkType` | string | `'wifi'`, `'cellular'`, `'none'` |

---

## Device Registration Contract

Sent from Android when a device first pairs with VIRUX.

```json
{
  "deviceId": "uuid-string",
  "ownerId": "firebase-auth-uid",
  "name": "My Pixel 9",
  "model": "Pixel 9 Pro",
  "manufacturer": "Google",
  "androidVersion": "15",
  "sdkVersion": 35,
  "appVersion": "0.1.0-alpha",
  "fcmToken": null,
  "isOnline": true,
  "lastSeenAt": "Firestore.Timestamp",
  "registeredAt": "Firestore.Timestamp",
  "capabilities": {
    "fileTransfer": false,
    "notifications": false,
    "clipboard": false,
    "screenMirror": false
  }
}
```

---

## WebRTC Signaling Contract

### Offer (sent from web → Firestore → Android)

```json
{
  "sessionId": "uuid-string",
  "ownerId": "firebase-auth-uid",
  "deviceId": "device-uuid",
  "offer": {
    "type": "offer",
    "sdp": "v=0\r\no=..."
  },
  "status": "waiting",
  "createdAt": "Firestore.Timestamp",
  "expiresAt": "Firestore.Timestamp"
}
```

### Answer (sent from Android → Firestore → web)

```json
{
  "answer": {
    "type": "answer",
    "sdp": "v=0\r\no=..."
  },
  "status": "connecting"
}
```

### ICE Candidate

```json
{
  "candidate": "candidate:...",
  "sdpMid": "0",
  "sdpMLineIndex": 0
}
```

---

## Notification Mirror Contract

Sent from Android when a notification is posted (Phase 6).

```json
{
  "notificationId": "uuid-string",
  "ownerId": "firebase-auth-uid",
  "sourceDeviceId": "device-uuid",
  "packageName": "com.whatsapp",
  "appName": "WhatsApp",
  "title": "John Doe",
  "body": "Hey, are you free?",
  "isRead": false,
  "receivedAt": "Firestore.Timestamp"
}
```

---

## Error Envelope Contract

Standard error format used for all error states in Firestore documents.

```json
{
  "errorCode": "DEVICE_OFFLINE",
  "errorMessage": "The target device is not currently connected.",
  "timestamp": "Firestore.Timestamp"
}
```

**Standard error codes:**
| Code | Description |
|---|---|
| `DEVICE_OFFLINE` | Target device is not connected |
| `SESSION_EXPIRED` | WebRTC session TTL exceeded |
| `TRANSFER_FAILED` | File transfer failed |
| `PERMISSION_DENIED` | Insufficient Firestore permissions |
| `AUTH_REQUIRED` | User is not authenticated |

