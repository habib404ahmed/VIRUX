// ============================================================
// VIRUX Web Dashboard — File Transfer Types & Protocol Constants
// Defines versioned protocol messages, transfer states, and limits
// matching com.virux.app.filetransfer Android implementation.
// ============================================================

export const FILE_TRANSFER_CONSTANTS = {
  PROTOCOL_VERSION: 'VIRUX_FILE_TRANSFER_V1',
  DATA_CHANNEL_LABEL: 'virux-file-transfer',
  CHUNK_SIZE: 65536, // 64 KiB SCTP boundary
  SEQUENCE_HEADER_SIZE: 4, // 4-byte UInt32 big-endian
  MAX_CHUNK_PAYLOAD: 65532, // 64 KiB - 4 bytes header
  MAX_FILE_SIZE: 524288000, // 500 MB
  BUFFERED_AMOUNT_HIGH_THRESHOLD: 524288, // 512 KiB high-water mark
  BUFFERED_AMOUNT_LOW_THRESHOLD: 65536, // 64 KiB low-water mark
  SESSION_TIMEOUT_MS: 60000, // 60s timeout for handshakes
} as const

export type FileTransferState =
  | 'IDLE'
  | 'REQUESTING'
  | 'AWAITING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'SENDING'
  | 'RECEIVING'
  | 'PAUSED'
  | 'VERIFYING'
  | 'SAVING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'FAILED'
  | 'EXPIRED'

export interface FileMetadata {
  transferId: string
  fileName: string
  fileSize: number
  totalChunks: number
  sha256: string
  mimeType?: string
  direction: string
  timestamp: string
}

export type ViruxControlMessageType =
  | 'TRANSFER_REQUEST'
  | 'TRANSFER_ACCEPT'
  | 'TRANSFER_REJECT'
  | 'TRANSFER_COMPLETE'
  | 'TRANSFER_CANCEL'
  | 'TRANSFER_ERROR'

export interface TransferRequestMessage {
  protocolVersion: typeof FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION
  type: 'TRANSFER_REQUEST'
  metadata: FileMetadata
}

export interface TransferAcceptMessage {
  protocolVersion: typeof FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION
  type: 'TRANSFER_ACCEPT'
  transferId: string
}

export interface TransferRejectMessage {
  protocolVersion: typeof FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION
  type: 'TRANSFER_REJECT'
  transferId: string
  reason: string
}

export interface TransferCompleteMessage {
  protocolVersion: typeof FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION
  type: 'TRANSFER_COMPLETE'
  transferId: string
  sha256: string
  totalBytes: number
}

export interface TransferCancelMessage {
  protocolVersion: typeof FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION
  type: 'TRANSFER_CANCEL'
  transferId: string
  reason: string
}

export interface TransferErrorMessage {
  protocolVersion: typeof FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION
  type: 'TRANSFER_ERROR'
  transferId: string
  error: string
}

export type ViruxControlMessage =
  | TransferRequestMessage
  | TransferAcceptMessage
  | TransferRejectMessage
  | TransferCompleteMessage
  | TransferCancelMessage
  | TransferErrorMessage

export interface ActiveTransferProgress {
  transferId: string
  fileName: string
  fileSize: number
  bytesTransferred: number
  progress: number // 0 to 100
  direction: 'send' | 'receive'
  status: FileTransferState
  speedBps?: number
  sha256?: string
  errorMessage?: string
  startedAt: number
  completedAt?: number
}

