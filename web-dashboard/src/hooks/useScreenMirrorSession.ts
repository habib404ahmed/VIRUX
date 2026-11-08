// ============================================================
// VIRUX Web Dashboard — Screen Mirroring Session Hook
// Orchestrates the end-to-end screen mirroring lifecycle:
// Device Selection -> Signaling Negotiation -> WebRTC Peer Connection
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './useAuth'
import {
  createSignalingSession,
  publishOffer,
  updateSessionStatus,
  closeSession,
  subscribeToSession,
  subscribeToRemoteCandidateBatches,
  CandidateBatcher,
} from '../services/signalingService'
import {
  WebRtcPeerConnectionService,
  type PeerConnectionStatus,
} from '../services/peerConnectionService'
import type { SignalingSession } from '../types/signaling'

export type MirrorSessionState =
  | 'idle'
  | 'requesting'
  | 'waiting_for_android'
  | 'capturing'
  | 'connecting'
  | 'connected_awaiting_video'
  | 'live_video'
  | 'disconnected'
  | 'permission_denied'
  | 'session_expired'
  | 'connection_failed'

export interface UseScreenMirrorSessionReturn {
  sessionState: MirrorSessionState
  peerStatus: PeerConnectionStatus | null
  activeSession: SignalingSession | null
  remoteStream: MediaStream | null
  errorMessage: string | null
  startMirroring: (deviceId: string) => Promise<void>
  stopMirroring: () => Promise<void>
}

export function useScreenMirrorSession(): UseScreenMirrorSessionReturn {
  const { user } = useAuth()
  const [sessionState, setSessionState] = useState<MirrorSessionState>('idle')
  const [peerStatus, setPeerStatus] = useState<PeerConnectionStatus | null>(null)
  const [activeSession, setActiveSession] = useState<SignalingSession | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeSessionRef = useRef<SignalingSession | null>(null)
  activeSessionRef.current = activeSession

  const peerServiceRef = useRef<WebRtcPeerConnectionService | null>(null)
  const sessionUnsubRef = useRef<(() => void) | null>(null)
  const candidateUnsubRef = useRef<(() => void) | null>(null)

  // Clean up all resources idempotently
  const cleanup = useCallback(() => {
    if (sessionUnsubRef.current) {
      sessionUnsubRef.current()
      sessionUnsubRef.current = null
    }
    if (candidateUnsubRef.current) {
      candidateUnsubRef.current()
      candidateUnsubRef.current = null
    }
    if (peerServiceRef.current) {
      peerServiceRef.current.dispose()
      peerServiceRef.current = null
    }
    setRemoteStream(null)
  }, [])

  // Terminate and clean up when component unmounts
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const stopMirroring = useCallback(async () => {
    const session = activeSessionRef.current
    if (session && user) {
      try {
        await closeSession(user.uid, session.deviceId, session.sessionId)
      } catch (err) {
        console.warn('[useScreenMirrorSession] Error closing session in Firestore:', err)
      }
    }
    cleanup()
    setActiveSession(null)
    setSessionState('disconnected')
    setPeerStatus('closed')
  }, [user, cleanup])

  const startMirroring = useCallback(
    async (deviceId: string) => {
      if (!user) {
        setErrorMessage('You must be signed in to request screen mirroring.')
        setSessionState('connection_failed')
        return
      }

      cleanup()
      setErrorMessage(null)
      setSessionState('requesting')

      try {
        // 1. Create Firestore Signaling Session
        const session = await createSignalingSession(user.uid, deviceId, 'screen_mirror', 'web')
        setActiveSession(session)
        setSessionState('waiting_for_android')

        // 2. Instantiate Candidate Batcher and WebRTC Peer Connection
        const batcher = new CandidateBatcher(user.uid, deviceId, session.sessionId, 'web', 250, 25)
        const peerService = new WebRtcPeerConnectionService({
          onStatusChange: (status) => {
            setPeerStatus(status)
            if (status === 'connected') {
              setSessionState((prev) => (prev === 'live_video' ? 'live_video' : 'connected_awaiting_video'))
              void updateSessionStatus(user.uid, deviceId, session.sessionId, 'connected')
            } else if (status === 'disconnected') {
              setSessionState('disconnected')
            } else if (status === 'failed') {
              setSessionState('connection_failed')
              setErrorMessage('Direct P2P connection failed. Network topology may block direct UDP.')
            }
          },
          onTrack: (stream, track) => {
            console.log('[useScreenMirrorSession] Received remote track:', track.kind, track.id)
            setRemoteStream(stream)
            if (track.kind === 'video' && track.enabled) {
              setSessionState('live_video')
            }
          },
          onError: (err) => {
            console.error('[useScreenMirrorSession] PeerConnection error:', err)
            setErrorMessage(err.message)
            setSessionState('connection_failed')
          },
        })
        peerServiceRef.current = peerService
        peerService.initialize(batcher)

        // 3. Create & publish local SDP offer
        const offerSdp = await peerService.createOffer()
        await publishOffer(user.uid, deviceId, session.sessionId, offerSdp)

        // 4. Subscribe to session document changes
        sessionUnsubRef.current = subscribeToSession(
          user.uid,
          deviceId,
          session.sessionId,
          async (updatedSession) => {
            setActiveSession(updatedSession)

            // Handle session expiration
            if (updatedSession.status === 'expired') {
              setSessionState('session_expired')
              setErrorMessage('Signaling session expired (120s limit exceeded).')
              cleanup()
              return
            }

            // Handle remote cancellation or closure
            if (updatedSession.status === 'closed' || updatedSession.status === 'revoked') {
              setSessionState((prev) => {
                if (prev === 'waiting_for_android' || prev === 'requesting') {
                  setErrorMessage('Screen capture consent was denied or canceled on the Android device.')
                  return 'permission_denied'
                }
                return 'disconnected'
              })
              cleanup()
              return
            }

            // Handle Android answer response
            if (updatedSession.status === 'answer_created' && updatedSession.answer) {
              setSessionState('connecting')
              try {
                await peerService.applyAnswer(updatedSession.answer.sdp)
                await updateSessionStatus(user.uid, deviceId, session.sessionId, 'connecting')
              } catch (err) {
                console.error('[useScreenMirrorSession] Error applying answer:', err)
                setErrorMessage('Failed to apply SDP answer from Android device.')
                setSessionState('connection_failed')
              }
            }
          },
          (err) => {
            console.error('[useScreenMirrorSession] Firestore session subscription error:', err)
            setErrorMessage(err.message)
            setSessionState('connection_failed')
          }
        )

        // 5. Subscribe to remote candidate batches produced by Android
        candidateUnsubRef.current = subscribeToRemoteCandidateBatches(
          user.uid,
          deviceId,
          session.sessionId,
          'android',
          (batch) => {
            void peerService.applyCandidateBatch(batch)
          },
          (err) => {
            console.warn('[useScreenMirrorSession] Error in candidate batch stream:', err)
          }
        )
      } catch (err: unknown) {
        const error = err as Error
        console.error('[useScreenMirrorSession] Failed to initialize mirroring session:', error)
        setErrorMessage(error.message || 'Failed to start screen mirroring session.')
        setSessionState('connection_failed')
        cleanup()
      }
    },
    [user, cleanup]
  )

  return {
    sessionState,
    peerStatus,
    activeSession,
    remoteStream,
    errorMessage,
    startMirroring,
    stopMirroring,
  }
}
