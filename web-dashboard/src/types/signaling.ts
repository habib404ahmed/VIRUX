import { Timestamp } from 'firebase/firestore'

export type SignalingState =
  | 'created'
  | 'offer_created'
  | 'answer_created'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'revoked'
  | 'expired'

export type SessionType = 'screen_mirror' | 'file_transfer'

export type ParticipantRole = 'web' | 'android'

export interface SdpPayload {
  type: 'offer' | 'answer'
  sdp: string
}

export interface IceCandidatePayload {
  candidate: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
}

export interface IceCandidateBatch {
  batchId: string
  sessionId: string
  sender: ParticipantRole
  sequenceNumber: number
  candidates: IceCandidatePayload[]
  isComplete: boolean
  createdAt: Timestamp
}

export interface SignalingSession {
  sessionId: string
  ownerUid: string
  deviceId: string
  initiator: ParticipantRole
  sessionType: SessionType
  status: SignalingState
  protocolVersion: string
  createdAt: Timestamp
  updatedAt: Timestamp
  expiresAt: Timestamp
  offer?: SdpPayload
  answer?: SdpPayload
}

export const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 0,
}

