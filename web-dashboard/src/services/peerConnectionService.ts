// ============================================================
// VIRUX Web Dashboard — WebRTC Peer Connection Service
// Manages the browser-side RTCPeerConnection lifecycle,
// remote media tracks, ICE gathering, and SDP offer/answer flows.
// ============================================================

import { RTC_CONFIGURATION, type IceCandidateBatch } from '../types/signaling'
import { CandidateBatcher } from './signalingService'

export type PeerConnectionStatus =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'

export interface PeerConnectionCallbacks {
  onStatusChange?: (status: PeerConnectionStatus) => void
  onTrack?: (stream: MediaStream, track: MediaStreamTrack) => void
  onDataChannel?: (channel: RTCDataChannel) => void
  onError?: (error: Error) => void
}

/**
 * Encapsulates a browser RTCPeerConnection instance paired with
 * candidate batching and event dispatching.
 */
export class WebRtcPeerConnectionService {
  private pc: RTCPeerConnection | null = null
  private batcher: CandidateBatcher | null = null
  private remoteStream: MediaStream = new MediaStream()
  private callbacks: PeerConnectionCallbacks = {}
  private appliedCandidateSignatures = new Set<string>()
  private isDisposed = false

  constructor(callbacks: PeerConnectionCallbacks = {}) {
    this.callbacks = callbacks
  }

  /**
   * Initializes the RTCPeerConnection instance with Google STUN.
   */
  public initialize(batcher: CandidateBatcher, options: { media?: boolean } = { media: true }): RTCPeerConnection {
    if (this.pc) {
      this.dispose()
    }

    this.isDisposed = false
    this.batcher = batcher
    this.appliedCandidateSignatures.clear()
    this.remoteStream = new MediaStream()

    const pc = new RTCPeerConnection(RTC_CONFIGURATION)
    this.pc = pc

    // Listen to local ICE candidates and buffer via CandidateBatcher
    pc.onicecandidate = (event) => {
      if (this.isDisposed) return

      if (event.candidate) {
        this.batcher?.queueCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        })
      }
    }

    // Monitor candidate gathering completion
    pc.onicegatheringstatechange = () => {
      if (this.isDisposed) return

      if (pc.iceGatheringState === 'complete') {
        void this.batcher?.completeGathering()
      }
    }

    // Monitor peer connection state transitions
    pc.onconnectionstatechange = () => {
      if (this.isDisposed) return

      const status = pc.connectionState as PeerConnectionStatus
      this.callbacks.onStatusChange?.(status)

      if (status === 'failed') {
        this.callbacks.onError?.(
          new Error('WebRTC direct P2P connection failed. Network may require a TURN relay.')
        )
      }
    }

    // Handle incoming data channels
    pc.ondatachannel = (event) => {
      if (this.isDisposed) return
      this.callbacks.onDataChannel?.(event.channel)
    }

    // Receive incoming remote tracks (e.g. Android screen mirror video)
    pc.ontrack = (event) => {
      if (this.isDisposed) return

      event.streams[0]?.getTracks().forEach((track) => {
        if (!this.remoteStream.getTracks().some((t) => t.id === track.id)) {
          this.remoteStream.addTrack(track)
        }
      })

      if (event.track) {
        if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track)
        }
        this.callbacks.onTrack?.(this.remoteStream, event.track)
      }
    }

    // Configure transceivers to receive video and audio if media enabled
    if (options.media !== false) {
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })
    }

    return pc
  }

  /**
   * Creates an RTCDataChannel on the active PeerConnection.
   */
  public createDataChannel(label: string = 'virux-file-transfer', options?: RTCDataChannelInit): RTCDataChannel {
    if (!this.pc) {
      throw new Error('[PeerConnectionService] Cannot create DataChannel: PeerConnection not initialized.')
    }
    return this.pc.createDataChannel(label, options)
  }

  /**
   * Generates a local SDP offer and sets local description.
   */
  public async createOffer(options: { media?: boolean } = { media: true }): Promise<string> {
    if (!this.pc) {
      throw new Error('[PeerConnectionService] Cannot create offer: PeerConnection not initialized.')
    }

    const offer = await this.pc.createOffer(
      options.media !== false
        ? {
            offerToReceiveVideo: true,
            offerToReceiveAudio: true,
          }
        : undefined
    )

    await this.pc.setLocalDescription(offer)
    return offer.sdp || ''
  }

  /**
   * Applies remote SDP answer received from the remote peer.
   */
  public async applyAnswer(sdp: string): Promise<void> {
    if (!this.pc) {
      throw new Error('[PeerConnectionService] Cannot apply answer: PeerConnection not initialized.')
    }

    if (this.pc.signalingState === 'stable') {
      // Answer already applied
      return
    }

    const answerDesc = new RTCSessionDescription({
      type: 'answer',
      sdp,
    })

    await this.pc.setRemoteDescription(answerDesc)
  }

  /**
   * Processes a batch of ICE candidates received from the remote peer.
   * Deduplicates candidates and safely ignores out-of-order/stale items.
   */
  public async applyCandidateBatch(batch: IceCandidateBatch): Promise<void> {
    if (!this.pc || this.isDisposed) return

    for (const item of batch.candidates) {
      const sig = `${item.candidate}|${item.sdpMid}|${item.sdpMLineIndex}`
      if (this.appliedCandidateSignatures.has(sig)) {
        continue
      }
      this.appliedCandidateSignatures.add(sig)

      try {
        const candidate = new RTCIceCandidate({
          candidate: item.candidate,
          sdpMid: item.sdpMid ?? undefined,
          sdpMLineIndex: item.sdpMLineIndex ?? undefined,
        })
        await this.pc.addIceCandidate(candidate)
      } catch (err) {
        // Tolerates candidates arriving before remote description or on closed connection
        console.warn('[PeerConnectionService] Skipping un-applicable candidate:', err)
      }
    }
  }

  /**
   * Gets the active remote MediaStream containing remote video/audio tracks.
   */
  public getRemoteStream(): MediaStream {
    return this.remoteStream
  }

  /**
   * Disposes the peer connection, closes transceivers, and clears listeners idempotently.
   */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true

    if (this.batcher) {
      this.batcher.dispose()
      this.batcher = null
    }

    if (this.pc) {
      // Remove all event listeners
      this.pc.onicecandidate = null
      this.pc.onicegatheringstatechange = null
      this.pc.onconnectionstatechange = null
      this.pc.ontrack = null

      // Stop remote tracks
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // ignore
        }
      })

      try {
        this.pc.close()
      } catch {
        // ignore
      }
      this.pc = null
    }

    this.appliedCandidateSignatures.clear()
  }
}

