// ============================================================
// VIRUX Web Dashboard — Device & Pairing Contracts
// Phase 4: Hardware-Backed Device Identity & Pairing Sessions
// ============================================================

export interface DeviceCapabilities {
  fileTransfer: boolean
  screenMirror: boolean
  notifications: boolean
  clipboard: boolean
}

export type NetworkTransportType = 'wifi' | 'cellular' | 'ethernet' | 'none'

export interface ViruxDeviceDocument {
  deviceId: string
  ownerUid: string
  deviceName: string
  deviceType: 'phone' | 'tablet' | 'foldable' | 'wearable'
  manufacturer: string
  model: string
  androidVersion: string
  sdkVersion: number
  appVersion: string
  devicePublicKey: string // Base64 SubjectPublicKeyInfo (SPKI) DER
  batteryLevel: number
  isCharging: boolean
  networkType: NetworkTransportType
  capabilities: DeviceCapabilities
  createdAt: any
  lastSeen: any
  revokedAt?: any | null
  pairingSessionId?: string
}

export interface PairingSessionDocument {
  sessionId: string
  ownerUid: string
  pin: string // 6-digit numeric string
  challengeNonce: string // 256-bit cryptographically secure hex string
  status: 'pending' | 'claimed' | 'revoked'
  createdAt: any
  expiresAt: any
  claimedByDeviceId?: string
  devicePublicKey?: string // Base64 SPKI public key from Android Keystore
  signature?: string // Base64 ECDSA signature over challenge
  claimedAt?: any
  revokedAt?: any
}

export interface QRPairingPayload {
  v: number // Schema version (1)
  sid: string // Pairing Session UUID
  uid: string // Owner Firebase UID
  cn: string // Challenge Nonce (256-bit hex)
  pin: string // 6-digit PIN code
  exp: number // Expiration epoch millis
}
