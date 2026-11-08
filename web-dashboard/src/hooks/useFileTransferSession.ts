// ============================================================
// VIRUX Web Dashboard — File Transfer Session Hook
// Orchestrates WebRTC DataChannel connection lifecycle and file
// streaming state over Firestore signaling.
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
import {
  ViruxWebFileTransferManager,
} from '../services/fileTransferService'
import {
  FILE_TRANSFER_CONSTANTS,
  type ActiveTransferProgress,
  type FileMetadata,
} from '../types/fileTransfer'
import type { SignalingSession } from '../types/signaling'

export type FileSessionState =
  | 'idle'
  | 'requesting'
  | 'waiting_for_peer'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'session_expired'
  | 'connection_failed'

export interface UseFileTransferSessionReturn {
  sessionState: FileSessionState
  peerStatus: PeerConnectionStatus | null
  activeSession: SignalingSession | null
  dataChannelOpen: boolean
  transferProgress: ActiveTransferProgress | null
  incomingRequest: FileMetadata | null
  history: ActiveTransferProgress[]
  errorMessage: string | null
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  sendFile: (file: File) => Promise<void>
  acceptIncoming: (transferId: string) => void
  rejectIncoming: (transferId: string, reason?: string) => void
  cancelTransfer: (reason?: string) => void
}

export function useFileTransferSession(): UseFileTransferSessionReturn {
  const { user } = useAuth()
  const [sessionState, setSessionState] = useState<FileSessionState>('idle')
  const [peerStatus, setPeerStatus] = useState<PeerConnectionStatus | null>(null)
  const [activeSession, setActiveSession] = useState<SignalingSession | null>(null)
  const [dataChannelOpen, setDataChannelOpen] = useState(false)
  const [transferProgress, setTransferProgress] = useState<ActiveTransferProgress | null>(null)
  const [incomingRequest, setIncomingRequest] = useState<FileMetadata | null>(null)
  const [history, setHistory] = useState<ActiveTransferProgress[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeSessionRef = useRef<SignalingSession | null>(null)
  activeSessionRef.current = activeSession

  const peerServiceRef = useRef<WebRtcPeerConnectionService | null>(null)
  const transferManagerRef = useRef<ViruxWebFileTransferManager | null>(null)
  const sessionUnsubRef = useRef<(() => void) | null>(null)
  const candidateUnsubRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (sessionUnsubRef.current) {
      sessionUnsubRef.current()
      sessionUnsubRef.current = null
    }
    if (candidateUnsubRef.current) {
      candidateUnsubRef.current()
      candidateUnsubRef.current = null
    }
    if (transferManagerRef.current) {
      transferManagerRef.current.detachDataChannel()
      transferManagerRef.current = null
    }
    if (peerServiceRef.current) {
      peerServiceRef.current.dispose()
      peerServiceRef.current = null
    }
    setDataChannelOpen(false)
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const disconnect = useCallback(async () => {
    const session = activeSessionRef.current
    if (session && user) {
      try {
        await closeSession(user.uid, session.deviceId, session.sessionId)
      } catch (err) {
        console.warn('[useFileTransferSession] Error closing session in Firestore:', err)
      }
    }
    cleanup()
    setActiveSession(null)
    setSessionState('disconnected')
    setPeerStatus('closed')
    setDataChannelOpen(false)
  }, [user, cleanup])

  const connect = useCallback(
    async (deviceId: string) => {
      if (!user) {
        setErrorMessage('You must be signed in to start a file transfer session.')
        setSessionState('connection_failed')
        return
      }

      cleanup()
      setErrorMessage(null)
      setSessionState('requesting')

      try {
        // 1. Create Firestore Signaling Session with sessionType = 'file_transfer'
        const session = await createSignalingSession(user.uid, deviceId, 'file_transfer', 'web')
        setActiveSession(session)
        setSessionState('waiting_for_peer')

        // 2. Instantiate Candidate Batcher and WebRtcPeerConnectionService
        const batcher = new CandidateBatcher(user.uid, deviceId, session.sessionId, 'web', 250, 25)
        const peerService = new WebRtcPeerConnectionService({
          onStatusChange: (status) => {
            setPeerStatus(status)
            if (status === 'connected') {
              setSessionState('connected')
              void updateSessionStatus(user.uid, deviceId, session.sessionId, 'connected')
            } else if (status === 'disconnected') {
              setSessionState('disconnected')
              setDataChannelOpen(false)
            } else if (status === 'failed') {
              setSessionState('connection_failed')
              setErrorMessage('WebRTC direct P2P connection failed.')
              setDataChannelOpen(false)
            }
          },
          onDataChannel: (channel) => {
            console.log('[useFileTransferSession] Remote peer initiated DataChannel:', channel.label)
            setupDataChannel(channel)
          },
          onError: (err) => {
            console.error('[useFileTransferSession] PeerConnection error:', err)
            setErrorMessage(err.message)
            setSessionState('connection_failed')
          },
        })
        peerServiceRef.current = peerService

        // Initialize PeerConnection without media transceivers
        peerService.initialize(batcher, { media: false })

        // 3. Create active RTCDataChannel ('virux-file-transfer')
        const dataChannel = peerService.createDataChannel(FILE_TRANSFER_CONSTANTS.DATA_CHANNEL_LABEL, {
          ordered: true,
        })
        setupDataChannel(dataChannel)

        // 4. Generate & publish SDP offer
        const offerSdp = await peerService.createOffer({ media: false })
        await publishOffer(user.uid, deviceId, session.sessionId, offerSdp)

        // 5. Subscribe to session document updates
        sessionUnsubRef.current = subscribeToSession(
          user.uid,
          deviceId,
          session.sessionId,
          async (updatedSession) => {
            setActiveSession(updatedSession)

            if (updatedSession.status === 'expired') {
              setSessionState('session_expired')
              setErrorMessage('Signaling session expired (120s limit exceeded).')
              cleanup()
              return
            }

            if (updatedSession.status === 'closed' || updatedSession.status === 'revoked') {
              setSessionState('disconnected')
              cleanup()
              return
            }

            // Apply Android SDP answer
            if (updatedSession.status === 'answer_created' && updatedSession.answer?.sdp) {
              try {
                await peerService.applyAnswer(updatedSession.answer.sdp)
                setSessionState('connecting')
              } catch (err) {
                console.error('[useFileTransferSession] Error applying SDP answer:', err)
                setErrorMessage('Failed to apply SDP answer from Android device.')
                setSessionState('connection_failed')
                cleanup()
              }
            }
          }
        )

        // 6. Subscribe to remote candidate batches published by Android
        candidateUnsubRef.current = subscribeToRemoteCandidateBatches(
          user.uid,
          deviceId,
          session.sessionId,
          'android',
          (batch) => {
            void peerService.applyCandidateBatch(batch)
          }
        )
      } catch (err) {
        console.error('[useFileTransferSession] Session initiation failed:', err)
        setErrorMessage((err as Error).message || 'Failed to initiate file transfer session.')
        setSessionState('connection_failed')
        cleanup()
      }
    },
    [user, cleanup]
  )

  const setupDataChannel = (channel: RTCDataChannel) => {
    const mgr = new ViruxWebFileTransferManager({
      onProgress: (prog) => {
        setTransferProgress({ ...prog })
      },
      onIncomingRequest: (meta) => {
        setIncomingRequest(meta)
      },
      onCompleted: (item) => {
        setTransferProgress({ ...item })
        setHistory((prev) => [item, ...prev])
      },
      onError: (err) => {
        setErrorMessage(err.message)
      },
    })
    transferManagerRef.current = mgr
    mgr.attachDataChannel(channel)

    channel.onopen = () => {
      console.log('[useFileTransferSession] DataChannel open:', channel.label)
      setDataChannelOpen(true)
    }

    channel.onclose = () => {
      console.log('[useFileTransferSession] DataChannel closed')
      setDataChannelOpen(false)
    }
  }

  const sendFile = useCallback(
    async (file: File) => {
      const mgr = transferManagerRef.current
      if (!mgr) {
        throw new Error('File transfer manager is not initialized.')
      }
      setErrorMessage(null)
      try {
        await mgr.sendFile(file)
      } catch (err) {
        setErrorMessage((err as Error).message || 'File transfer failed.')
        throw err
      }
    },
    []
  )

  const acceptIncoming = useCallback((transferId: string) => {
    transferManagerRef.current?.acceptIncomingTransfer(transferId)
    setIncomingRequest(null)
  }, [])

  const rejectIncoming = useCallback((transferId: string, reason?: string) => {
    transferManagerRef.current?.rejectIncomingTransfer(transferId, reason)
    setIncomingRequest(null)
  }, [])

  const cancelTransfer = useCallback((reason?: string) => {
    transferManagerRef.current?.cancelTransfer(reason)
  }, [])

  return {
    sessionState,
    peerStatus,
    activeSession,
    dataChannelOpen,
    transferProgress,
    incomingRequest,
    history,
    errorMessage,
    connect,
    disconnect,
    sendFile,
    acceptIncoming,
    rejectIncoming,
    cancelTransfer,
  }
}

