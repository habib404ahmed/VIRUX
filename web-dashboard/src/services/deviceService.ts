// ============================================================
// VIRUX Web Dashboard — Device Management & Pairing Service
// Phase 4: Cryptographic Challenge-Response & Presence Engine
// ============================================================

import {
  doc,
  collection,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import QRCode from 'qrcode'
import { requireDb } from '../firebase/firebaseConfig'
import type {
  ViruxDeviceDocument,
  PairingSessionDocument,
  QRPairingPayload,
} from '../types/device'

/**
 * Computes liveness dynamically using a sliding window.
 * Devices that have not sent a heartbeat within 90 seconds are evaluated as offline.
 */
export function computeDeviceLiveness(device: ViruxDeviceDocument): 'online' | 'offline' {
  if (device.revokedAt || !device.lastSeen) return 'offline'

  const lastSeenMs =
    device.lastSeen instanceof Timestamp
      ? device.lastSeen.toMillis()
      : typeof device.lastSeen?.toMillis === 'function'
      ? device.lastSeen.toMillis()
      : typeof device.lastSeen?.seconds === 'number'
      ? device.lastSeen.seconds * 1000
      : new Date(device.lastSeen).getTime()

  if (isNaN(lastSeenMs)) return 'offline'

  const nowMs = Date.now()
  return nowMs - lastSeenMs < 90_000 ? 'online' : 'offline'
}

/**
 * Formats a lastSeen timestamp into human readable relative time.
 */
export function formatLastSeen(lastSeen: any): string {
  if (!lastSeen) return 'Never'

  const ms =
    lastSeen instanceof Timestamp
      ? lastSeen.toMillis()
      : typeof lastSeen?.toMillis === 'function'
      ? lastSeen.toMillis()
      : typeof lastSeen?.seconds === 'number'
      ? lastSeen.seconds * 1000
      : new Date(lastSeen).getTime()

  if (isNaN(ms)) return 'Unknown'

  const diffSec = Math.floor((Date.now() - ms) / 1000)
  if (diffSec < 15) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

/**
 * Converts standard Java ASN.1 DER-encoded ECDSA signature into IEEE P1363 (64 bytes raw)
 * required by the browser Web Crypto API.
 */
function derToP1363(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der

  let offset = 0
  if (der[offset++] !== 0x30) throw new Error('Invalid DER signature: missing SEQUENCE')

  let seqLen = der[offset++]
  if (seqLen & 0x80) {
    const lenBytes = seqLen & 0x7f
    offset += lenBytes
  }

  if (der[offset++] !== 0x02) throw new Error('Invalid DER signature: missing r INTEGER')
  const rLen = der[offset++]
  const rStart = offset
  offset += rLen

  if (der[offset++] !== 0x02) throw new Error('Invalid DER signature: missing s INTEGER')
  const sLen = der[offset++]
  const sStart = offset

  let r = der.subarray(rStart, rStart + rLen)
  while (r.length > 32 && r[0] === 0x00) r = r.subarray(1)

  let s = der.subarray(sStart, sStart + sLen)
  while (s.length > 32 && s[0] === 0x00) s = s.subarray(1)

  const p1363 = new Uint8Array(64)
  p1363.set(r, 32 - r.length)
  p1363.set(s, 64 - s.length)
  return p1363
}

// ─── Cryptographic & Timeout Utilities ──────────────────────────────

export const FIRESTORE_WRITE_TIMEOUT_MS = 10_000 // 10-second bounded timeout

/**
 * Executes a promise with a bounded timeout, rejecting with deadline-exceeded if ms expires.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = FIRESTORE_WRITE_TIMEOUT_MS,
  errorMsg = 'Operation timed out while waiting for server response.'
): Promise<T> {
  let timer: any
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(errorMsg) as any
      err.code = 'deadline-exceeded'
      reject(err)
    }, ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Returns the cryptographically secure Crypto interface, verifying secure context.
 * Throws explicit errors for insecure origin or missing APIs.
 */
export function getWebCrypto(): Crypto {
  if (typeof window !== 'undefined') {
    if (window.isSecureContext === false) {
      throw new Error(
        'Web Crypto requires a secure context (HTTPS or localhost). Insecure origin detected.'
      )
    }
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      return window.crypto
    }
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto as unknown as Crypto
  }
  throw new Error(
    'Web Crypto API is not available in this browser environment. Secure random generation failed.'
  )
}

/**
 * Returns SubtleCrypto from Web Crypto, verifying availability.
 */
export function getSubtleCrypto(): SubtleCrypto {
  const cryptoObj = getWebCrypto()
  if (!cryptoObj.subtle) {
    throw new Error(
      'Web Crypto SubtleCrypto is not available in this browser environment.'
    )
  }
  return cryptoObj.subtle
}

/**
 * Generates a 256-bit (32 bytes) cryptographically secure random challenge nonce (64 hex chars).
 * Never uses Math.random().
 */
export function generate256BitChallengeNonce(): string {
  const cryptoObj = getWebCrypto()
  const challengeArray = new Uint8Array(32)
  cryptoObj.getRandomValues(challengeArray)
  return Array.from(challengeArray, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generates a cryptographically secure 6-digit numeric PIN code [100000, 999999].
 * Never uses Math.random().
 */
export function generateSecurePin(): string {
  const cryptoObj = getWebCrypto()
  const array = new Uint32Array(1)
  cryptoObj.getRandomValues(array)
  const pinNum = 100000 + (array[0] % 900000)
  return pinNum.toString()
}

/**
 * Verifies the ECDSA P-256 signature produced by the Android Keystore
 * over the SHA-256 hash of (challengeNonce || sessionId || ownerUid || deviceId).
 */
export async function verifyDeviceSignature(
  challengeNonce: string,
  sessionId: string,
  ownerUid: string,
  deviceId: string,
  devicePublicKeyBase64: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    if (!challengeNonce || !sessionId || !ownerUid || !deviceId || !devicePublicKeyBase64 || !signatureBase64) {
      console.warn('[VIRUX Crypto] Missing parameters for signature verification')
      return false
    }

    const subtle = getSubtleCrypto()

    // 1. Decode Base64 public key (SPKI DER)
    const pubKeyBinary = Uint8Array.from(atob(devicePublicKeyBase64), (c) => c.charCodeAt(0))

    // 2. Import public key into Web Crypto API
    const cryptoKey = await subtle.importKey(
      'spki',
      pubKeyBinary.buffer as ArrayBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    )

    // 3. Decode Base64 signature and convert ASN.1 DER to IEEE P1363
    const sigBinary = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0))
    const p1363Signature = derToP1363(sigBinary)

    // 4. Construct canonical challenge payload: challengeNonce || sessionId || ownerUid || deviceId
    const messageString = `${challengeNonce}${sessionId}${ownerUid}${deviceId}`
    const messageBuffer = new TextEncoder().encode(messageString)

    // 5. Verify signature with ECDSA / SHA-256
    const isValid = await subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      cryptoKey,
      p1363Signature.buffer as ArrayBuffer,
      messageBuffer.buffer as ArrayBuffer
    )

    return isValid
  } catch (err) {
    console.error('[VIRUX Crypto] Signature verification exception:', err)
    return false
  }
}

/**
 * Initiates a new secure pairing session.
 * Stores document in users/{uid}/pairingSessions/{sessionId}
 * Generates an SVG/Canvas QR Code data URL.
 * Bounded by a 10-second timeout to prevent indefinite pending writes.
 */
export async function createPairingSession(
  ownerUid: string,
  customChallengeNonce?: string,
  customPin?: string
): Promise<{ session: PairingSessionDocument; qrDataUrl: string }> {
  if (!ownerUid || typeof ownerUid !== 'string' || ownerUid.trim().length === 0) {
    const err = new Error('User must be authenticated to create a pairing session.') as any
    err.code = 'unauthenticated'
    throw err
  }

  let db: any = null
  try {
    db = requireDb()
  } catch {
    console.warn('[VIRUX DeviceService] Firestore unavailable, generating session in offline sandbox mode.')
  }

  const cryptoObj = getWebCrypto()
  const sessionId = typeof cryptoObj.randomUUID === 'function' ? cryptoObj.randomUUID() : Array.from(new Uint8Array(16), (b) => b.toString(16).padStart(2, '0')).join('')
  const pin = customPin || generateSecurePin()
  const challengeNonce = customChallengeNonce || generate256BitChallengeNonce()

  // 10-minute session TTL (600s), fully compliant with Firestore rule: <= request.time + 630s
  const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000)

  const sessionDoc: PairingSessionDocument = {
    sessionId,
    ownerUid,
    pin,
    challengeNonce,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(tenMinutesFromNow),
  }

  if (db) {
    const sessionRef = doc(db, 'users', ownerUid, 'pairingSessions', sessionId)
    await withTimeout(
      setDoc(sessionRef, sessionDoc),
      FIRESTORE_WRITE_TIMEOUT_MS,
      'Timed out writing pairing session to Firestore. Server may be unreachable.'
    )
  }

  const payload: QRPairingPayload = {
    v: 1,
    sid: sessionId,
    uid: ownerUid,
    cn: challengeNonce,
    pin,
    exp: tenMinutesFromNow.getTime(),
  }

  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
    width: 280,
    margin: 2,
    color: {
      dark: '#06B6D4',
      light: '#090D18',
    },
    errorCorrectionLevel: 'M',
  })

  return {
    session: sessionDoc,
    qrDataUrl,
  }
}

/**
 * Checks if a pairing session already exists in Firestore.
 * Useful before retrying after a timeout to prevent duplicate sessions.
 */
export async function checkExistingPairingSession(
  ownerUid: string,
  sessionId: string
): Promise<PairingSessionDocument | null> {
  let db: any = null
  try {
    db = requireDb()
  } catch {
    return null
  }

  try {
    const sessionRef = doc(db, 'users', ownerUid, 'pairingSessions', sessionId)
    const snap = await withTimeout(getDoc(sessionRef), 5000, 'Timed out checking existing session.')
    if (snap.exists()) {
      return snap.data() as PairingSessionDocument
    }
  } catch (err) {
    console.warn('[VIRUX DeviceService] Check existing session error:', err)
  }
  return null
}

/**
 * Real-time listener for pairing session status changes.
 */
export function listenToPairingSession(
  ownerUid: string,
  sessionId: string,
  callback: (session: PairingSessionDocument | null) => void
): Unsubscribe {
  let db: any = null
  try {
    db = requireDb()
  } catch {
    return () => {}
  }

  const sessionRef = doc(db, 'users', ownerUid, 'pairingSessions', sessionId)

  return onSnapshot(
    sessionRef,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as PairingSessionDocument)
      } else {
        callback(null)
      }
    },
    (err) => {
      console.warn('[VIRUX DeviceService] Pairing session snapshot error:', err)
      callback(null)
    }
  )
}

/**
 * Revokes / cancels an active pairing session.
 * Bounded by timeout to avoid hanging during modal teardown.
 */
export async function cancelPairingSession(ownerUid: string, sessionId: string): Promise<void> {
  let db: any = null
  try {
    db = requireDb()
  } catch {
    return
  }

  try {
    const sessionRef = doc(db, 'users', ownerUid, 'pairingSessions', sessionId)
    await withTimeout(
      updateDoc(sessionRef, {
        status: 'revoked',
        revokedAt: serverTimestamp(),
      }),
      5000,
      'Timed out revoking pairing session.'
    )
  } catch (err) {
    console.warn('[VIRUX DeviceService] Failed to revoke session:', err)
  }
}

/**
 * Real-time subscription to user's registered devices.
 */
export function subscribeToUserDevices(
  ownerUid: string,
  callback: (devices: ViruxDeviceDocument[]) => void
): Unsubscribe {
  let db: any = null
  try {
    db = requireDb()
  } catch {
    callback([])
    return () => {}
  }

  const devicesCol = collection(db, 'users', ownerUid, 'devices')

  return onSnapshot(
    devicesCol,
    (snapshot) => {
      const devices = snapshot.docs.map((docSnap) => docSnap.data() as ViruxDeviceDocument)
      callback(devices)
    },
    (err) => {
      console.warn('[VIRUX DeviceService] Devices subscription error:', err)
      callback([])
    }
  )
}

/**
 * Renames an existing paired device.
 */
export async function renameDevice(
  ownerUid: string,
  deviceId: string,
  newName: string
): Promise<void> {
  const db = requireDb()
  const deviceRef = doc(db, 'users', ownerUid, 'devices', deviceId)
  await updateDoc(deviceRef, {
    deviceName: newName.trim(),
  })
}

/**
 * Unpairs and deletes a device from the user registry.
 */
export async function unpairDevice(ownerUid: string, deviceId: string): Promise<void> {
  const db = requireDb()
  const deviceRef = doc(db, 'users', ownerUid, 'devices', deviceId)
  await deleteDoc(deviceRef)
}
