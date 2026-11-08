// ============================================================
// VIRUX Web Dashboard — WebRTC Signaling Service
// Manages Firestore-based signaling session lifecycle,
// SDP offer/answer exchanges, and debounced ICE candidate batching.
// ============================================================

import {
  doc,
  collection,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { requireDb } from '../firebase/firebaseConfig'
import { withTimeout } from './deviceService'
import type {
  SignalingSession,
  SignalingState,
  SessionType,
  ParticipantRole,
  IceCandidatePayload,
  IceCandidateBatch,
} from '../types/signaling'

/**
 * Creates a unique cryptographically secure random UUID for session and batch identifiers.
 * Never uses Math.random().
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Creates a new signaling session document under:
 * /users/{userId}/devices/{deviceId}/signaling/{sessionId}
 *
 * Session lifetime is strictly bounded to 120 seconds.
 * Bounded by timeout to avoid indefinite hanging.
 */
export async function createSignalingSession(
  userId: string,
  deviceId: string,
  sessionType: SessionType,
  initiator: ParticipantRole = 'web'
): Promise<SignalingSession> {
  const db = requireDb()
  const sessionId = generateUuid()
  const sessionRef = doc(db, 'users', userId, 'devices', deviceId, 'signaling', sessionId)

  const now = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(Date.now() + 120 * 1000)

  const sessionData: SignalingSession = {
    sessionId,
    ownerUid: userId,
    deviceId,
    initiator,
    sessionType,
    status: 'created',
    protocolVersion: '1.0',
    createdAt: now,
    updatedAt: now,
    expiresAt,
  }

  await withTimeout(
    setDoc(sessionRef, {
      ...sessionData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    10_000,
    'Timed out creating WebRTC signaling session in Firestore.'
  )

  return sessionData
}

/**
 * Publishes an SDP Offer and transitions session status to 'offer_created'.
 */
export async function publishOffer(
  userId: string,
  deviceId: string,
  sessionId: string,
  sdp: string
): Promise<void> {
  if (sdp.length > 65536) {
    throw new Error('[SignalingService] SDP offer exceeds 64KB security limit.')
  }

  const db = requireDb()
  const sessionRef = doc(db, 'users', userId, 'devices', deviceId, 'signaling', sessionId)

  await updateDoc(sessionRef, {
    status: 'offer_created',
    offer: {
      type: 'offer',
      sdp,
    },
    updatedAt: serverTimestamp(),
  })
}

/**
 * Publishes an SDP Answer and transitions session status to 'answer_created'.
 */
export async function publishAnswer(
  userId: string,
  deviceId: string,
  sessionId: string,
  sdp: string
): Promise<void> {
  if (sdp.length > 65536) {
    throw new Error('[SignalingService] SDP answer exceeds 64KB security limit.')
  }

  const db = requireDb()
  const sessionRef = doc(db, 'users', userId, 'devices', deviceId, 'signaling', sessionId)

  await updateDoc(sessionRef, {
    status: 'answer_created',
    answer: {
      type: 'answer',
      sdp,
    },
    updatedAt: serverTimestamp(),
  })
}

/**
 * Updates session status (e.g. 'connecting', 'connected').
 */
export async function updateSessionStatus(
  userId: string,
  deviceId: string,
  sessionId: string,
  status: SignalingState
): Promise<void> {
  const db = requireDb()
  const sessionRef = doc(db, 'users', userId, 'devices', deviceId, 'signaling', sessionId)

  await updateDoc(sessionRef, {
    status,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Closes the signaling session cleanly.
 */
export async function closeSession(
  userId: string,
  deviceId: string,
  sessionId: string
): Promise<void> {
  try {
    const db = requireDb()
    const sessionRef = doc(db, 'users', userId, 'devices', deviceId, 'signaling', sessionId)

    await updateDoc(sessionRef, {
      status: 'closed',
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.warn('[SignalingService] Failed to mark session closed on Firestore:', err)
  }
}

/**
 * Subscribes to real-time changes on the signaling session document.
 * Automatically detects and flags expired or revoked sessions.
 */
export function subscribeToSession(
  userId: string,
  deviceId: string,
  sessionId: string,
  onUpdate: (session: SignalingSession) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = requireDb()
  const sessionRef = doc(db, 'users', userId, 'devices', deviceId, 'signaling', sessionId)

  return onSnapshot(
    sessionRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onError?.(new Error('Signaling session not found or deleted.'))
        return
      }

      const session = snapshot.data() as SignalingSession

      // Check local TTL expiration
      if (session.expiresAt && Date.now() > session.expiresAt.toMillis()) {
        session.status = 'expired'
      }

      onUpdate(session)
    },
    (error) => {
      console.error('[SignalingService] Session subscription error:', error)
      onError?.(error)
    }
  )
}

/**
 * Subscribes to candidate batches produced by the remote participant.
 */
export function subscribeToRemoteCandidateBatches(
  userId: string,
  deviceId: string,
  sessionId: string,
  remoteSender: ParticipantRole,
  onBatchReceived: (batch: IceCandidateBatch) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = requireDb()
  const batchesRef = collection(
    db,
    'users',
    userId,
    'devices',
    deviceId,
    'signaling',
    sessionId,
    'candidateBatches'
  )

  const q = query(batchesRef, where('sender', '==', remoteSender), orderBy('sequenceNumber', 'asc'))

  return onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const batch = change.doc.data() as IceCandidateBatch
          onBatchReceived(batch)
        }
      })
    },
    (error) => {
      console.error('[SignalingService] Candidate batch subscription error:', error)
      onError?.(error)
    }
  )
}

/**
 * Manages debounced, bounded candidate batching to minimize Firestore write operations.
 * Batches up to 25 candidates with a 250ms debounce window.
 */
export class CandidateBatcher {
  private userId: string
  private deviceId: string
  private sessionId: string
  private sender: ParticipantRole
  private debounceMs: number
  private maxBatchSize: number

  private buffer: IceCandidatePayload[] = []
  private seenCandidates = new Set<string>()
  private sequenceNumber = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private isDisposed = false

  constructor(
    userId: string,
    deviceId: string,
    sessionId: string,
    sender: ParticipantRole = 'web',
    debounceMs = 250,
    maxBatchSize = 25
  ) {
    this.userId = userId
    this.deviceId = deviceId
    this.sessionId = sessionId
    this.sender = sender
    this.debounceMs = debounceMs
    this.maxBatchSize = maxBatchSize
  }

  /**
   * Adds an ICE candidate to the buffer.
   * Deduplicates candidates and triggers debounced flush.
   */
  public queueCandidate(candidate: IceCandidatePayload): void {
    if (this.isDisposed) return

    const fingerprint = `${candidate.candidate}|${candidate.sdpMid}|${candidate.sdpMLineIndex}`
    if (this.seenCandidates.has(fingerprint)) return

    this.seenCandidates.add(fingerprint)
    this.buffer.push(candidate)

    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush(false)
      return
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null
        void this.flush(false)
      }, this.debounceMs)
    }
  }

  /**
   * Marks candidate gathering as complete and flushes remaining candidates.
   */
  public async completeGathering(): Promise<void> {
    if (this.isDisposed) return
    await this.flush(true)
  }

  /**
   * Immediately flushes queued candidates to Firestore.
   */
  public async flush(isComplete = false): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.buffer.length === 0 && !isComplete) {
      return
    }

    const candidatesToWrite = [...this.buffer]
    this.buffer = []

    const batchId = generateUuid()
    const db = requireDb()
    const batchRef = doc(
      db,
      'users',
      this.userId,
      'devices',
      this.deviceId,
      'signaling',
      this.sessionId,
      'candidateBatches',
      batchId
    )

    const currentSeq = this.sequenceNumber++

    try {
      await setDoc(batchRef, {
        batchId,
        sessionId: this.sessionId,
        sender: this.sender,
        sequenceNumber: currentSeq,
        candidates: candidatesToWrite,
        isComplete,
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('[CandidateBatcher] Failed to write candidate batch:', err)
      // Put candidates back at the front if write failed and not disposed
      if (!this.isDisposed) {
        this.buffer = [...candidatesToWrite, ...this.buffer]
      }
      throw err
    }
  }

  /**
   * Cleans up timer and discards pending operations.
   */
  public dispose(): void {
    this.isDisposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.buffer = []
    this.seenCandidates.clear()
  }
}

