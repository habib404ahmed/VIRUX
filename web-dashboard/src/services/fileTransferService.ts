// ============================================================
// VIRUX Web Dashboard — File Transfer Service
// Manages WebRTC DataChannel chunking, backpressure control,
// incremental SHA-256 integrity verification, and browser Blob I/O.
// ============================================================

import {
  FILE_TRANSFER_CONSTANTS,
  type ActiveTransferProgress,
  type FileMetadata,
  type ViruxControlMessage,
} from '../types/fileTransfer'

export interface FileTransferCallbacks {
  onProgress?: (progress: ActiveTransferProgress) => void
  onIncomingRequest?: (metadata: FileMetadata) => void
  onCompleted?: (item: ActiveTransferProgress, blob?: Blob) => void
  onError?: (error: Error) => void
}

/**
 * Calculates SHA-256 hash of an ArrayBuffer using Web Crypto API.
 */
export async function calculateSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Sanitizes a filename to prevent path traversal or injection.
 */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/[\r\n\t]/g, '').trim()
  return base || 'unnamed_file'
}

export class ViruxWebFileTransferManager {
  private channel: RTCDataChannel | null = null
  private callbacks: FileTransferCallbacks = {}

  private activeProgress: ActiveTransferProgress | null = null
  private incomingMetadata: FileMetadata | null = null

  // Sending state
  private isSendCancelled = false
  private drainResolver: (() => void) | null = null
  private acceptanceResolver: ((accepted: boolean) => void) | null = null

  // Receiving state
  private receivedChunks: Uint8Array[] = []
  private expectedChunkIndex = 0
  private totalBytesReceived = 0
  private receivingMetadata: FileMetadata | null = null

  constructor(callbacks: FileTransferCallbacks = {}) {
    this.callbacks = callbacks
  }

  public setCallbacks(callbacks: FileTransferCallbacks) {
    this.callbacks = callbacks
  }

  /**
   * Attaches an RTCDataChannel and sets up message, backpressure, and lifecycle listeners.
   */
  public attachDataChannel(channel: RTCDataChannel) {
    this.channel = channel
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = FILE_TRANSFER_CONSTANTS.BUFFERED_AMOUNT_LOW_THRESHOLD

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.handleControlMessage(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        this.handleBinaryChunk(event.data)
      }
    }

    channel.onbufferedamountlow = () => {
      if (this.drainResolver) {
        const resolve = this.drainResolver
        this.drainResolver = null
        resolve()
      }
    }

    channel.onclose = () => {
      if (this.activeProgress && this.isActiveState(this.activeProgress.status)) {
        this.failActiveTransfer('WebRTC DataChannel closed unexpectedly')
      }
    }

    channel.onerror = (err) => {
      console.error('[FileTransferService] DataChannel error:', err)
      this.callbacks.onError?.(new Error(`DataChannel error: ${err.type}`))
    }
  }

  public detachDataChannel() {
    if (this.channel) {
      this.channel.onmessage = null
      this.channel.onbufferedamountlow = null
      this.channel.onclose = null
      this.channel.onerror = null
      this.channel = null
    }
    this.cancelTransfer('DataChannel detached')
  }

  public getActiveProgress(): ActiveTransferProgress | null {
    return this.activeProgress
  }

  public getIncomingRequest(): FileMetadata | null {
    return this.incomingMetadata
  }

  /**
   * Initiates sending a file over the attached DataChannel.
   */
  public async sendFile(file: File): Promise<void> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('DataChannel is not open. Connect to peer first.')
    }

    if (this.activeProgress && this.isActiveState(this.activeProgress.status)) {
      throw new Error('Another file transfer is currently active.')
    }

    if (file.size <= 0) {
      throw new Error('Selected file is empty.')
    }

    if (file.size > FILE_TRANSFER_CONSTANTS.MAX_FILE_SIZE) {
      throw new Error(`File exceeds maximum size of 500 MB (size: ${file.size} bytes).`)
    }

    const transferId = crypto.randomUUID()
    const fileName = sanitizeFileName(file.name)
    const totalChunks = Math.ceil(file.size / FILE_TRANSFER_CONSTANTS.MAX_CHUNK_PAYLOAD)

    this.isSendCancelled = false

    this.updateProgress({
      transferId,
      fileName,
      fileSize: file.size,
      bytesTransferred: 0,
      progress: 0,
      direction: 'send',
      status: 'PREPARING',
      startedAt: Date.now(),
    })

    // 1. Read entire file into ArrayBuffer and compute SHA-256
    const fileBuffer = await file.arrayBuffer()
    const sha256 = await calculateSha256Hex(fileBuffer)

    if (this.isSendCancelled) return

    const metadata: FileMetadata = {
      transferId,
      fileName,
      fileSize: file.size,
      totalChunks,
      sha256,
      mimeType: file.type || 'application/octet-stream',
      direction: 'web_to_android',
      timestamp: new Date().toISOString(),
    }

    this.updateProgress({
      ...this.activeProgress!,
      sha256,
      status: 'REQUESTING',
    })

    // 2. Transmit TRANSFER_REQUEST
    const requestMsg: ViruxControlMessage = {
      protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
      type: 'TRANSFER_REQUEST',
      metadata,
    }
    this.sendControlMessage(requestMsg)

    // 3. Await remote acceptance (timeout 60s)
    const accepted = await new Promise<boolean>((resolve) => {
      this.acceptanceResolver = resolve
      setTimeout(() => {
        if (this.acceptanceResolver === resolve) {
          this.acceptanceResolver = null
          resolve(false)
        }
      }, FILE_TRANSFER_CONSTANTS.SESSION_TIMEOUT_MS)
    })

    if (!accepted || this.isSendCancelled) {
      if (!this.isSendCancelled && this.activeProgress?.status !== 'REJECTED') {
        this.failActiveTransfer('Transfer timed out awaiting remote peer approval')
      }
      return
    }

    this.updateProgress({
      ...this.activeProgress!,
      status: 'SENDING',
    })

    // 4. Stream chunks with backpressure
    const payloadBuffer = new Uint8Array(fileBuffer)
    let bytesSent = 0

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      if (this.isSendCancelled) {
        console.warn('[FileTransferService] Send cancelled by user.')
        return
      }

      const chunkOffset = chunkIdx * FILE_TRANSFER_CONSTANTS.MAX_CHUNK_PAYLOAD
      const chunkPayloadSize = Math.min(
        FILE_TRANSFER_CONSTANTS.MAX_CHUNK_PAYLOAD,
        file.size - chunkOffset
      )
      const chunkPayload = payloadBuffer.subarray(chunkOffset, chunkOffset + chunkPayloadSize)

      // Frame: [4 bytes sequence number (UInt32 Big Endian)][raw payload]
      const framedBuffer = new ArrayBuffer(FILE_TRANSFER_CONSTANTS.SEQUENCE_HEADER_SIZE + chunkPayloadSize)
      const dataView = new DataView(framedBuffer)
      dataView.setUint32(0, chunkIdx, false)
      new Uint8Array(framedBuffer, FILE_TRANSFER_CONSTANTS.SEQUENCE_HEADER_SIZE).set(chunkPayload)

      // Check backpressure high-water mark
      if (this.channel.bufferedAmount > FILE_TRANSFER_CONSTANTS.BUFFERED_AMOUNT_HIGH_THRESHOLD) {
        await new Promise<void>((res) => {
          this.drainResolver = res
        })
      }

      this.channel.send(framedBuffer)
      bytesSent += chunkPayloadSize

      const pct = Math.floor((bytesSent / file.size) * 100)
      this.updateProgress({
        ...this.activeProgress!,
        bytesTransferred: bytesSent,
        progress: pct,
      })
    }

    // 5. Send TRANSFER_COMPLETE
    const completeMsg: ViruxControlMessage = {
      protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
      type: 'TRANSFER_COMPLETE',
      transferId,
      sha256,
      totalBytes: bytesSent,
    }
    this.sendControlMessage(completeMsg)

    this.updateProgress({
      ...this.activeProgress!,
      status: 'COMPLETED',
      bytesTransferred: file.size,
      progress: 100,
      completedAt: Date.now(),
    })

    this.callbacks.onCompleted?.(this.activeProgress!)
  }

  /**
   * Approves an incoming transfer request.
   */
  public acceptIncomingTransfer(transferId: string) {
    if (!this.incomingMetadata || this.incomingMetadata.transferId !== transferId) {
      throw new Error(`Incoming transfer ${transferId} not found`)
    }

    const meta = this.incomingMetadata
    this.receivingMetadata = meta
    this.incomingMetadata = null

    this.receivedChunks = []
    this.expectedChunkIndex = 0
    this.totalBytesReceived = 0

    this.updateProgress({
      transferId: meta.transferId,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      bytesTransferred: 0,
      progress: 0,
      direction: 'receive',
      status: 'RECEIVING',
      sha256: meta.sha256,
      startedAt: Date.now(),
    })

    const acceptMsg: ViruxControlMessage = {
      protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
      type: 'TRANSFER_ACCEPT',
      transferId,
    }
    this.sendControlMessage(acceptMsg)
  }

  /**
   * Rejects an incoming transfer request.
   */
  public rejectIncomingTransfer(transferId: string, reason = 'User declined') {
    if (this.incomingMetadata?.transferId === transferId) {
      this.incomingMetadata = null
    }

    const rejectMsg: ViruxControlMessage = {
      protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
      type: 'TRANSFER_REJECT',
      transferId,
      reason,
    }
    this.sendControlMessage(rejectMsg)

    if (this.activeProgress?.transferId === transferId) {
      this.updateProgress({
        ...this.activeProgress,
        status: 'REJECTED',
        errorMessage: reason,
      })
    }
  }

  /**
   * Cancels any active transfer (send or receive).
   */
  public cancelTransfer(reason = 'User cancelled') {
    this.isSendCancelled = true

    if (this.drainResolver) {
      this.drainResolver()
      this.drainResolver = null
    }

    if (this.acceptanceResolver) {
      this.acceptanceResolver(false)
      this.acceptanceResolver = null
    }

    if (this.activeProgress && this.isActiveState(this.activeProgress.status)) {
      const cancelMsg: ViruxControlMessage = {
        protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
        type: 'TRANSFER_CANCEL',
        transferId: this.activeProgress.transferId,
        reason,
      }
      this.sendControlMessage(cancelMsg)

      this.updateProgress({
        ...this.activeProgress,
        status: 'CANCELLED',
        errorMessage: reason,
      })
    }

    this.receivedChunks = []
    this.receivingMetadata = null
  }

  // ─── Private Protocol & Data Handlers ───────────────────────

  private handleControlMessage(text: string) {
    try {
      const msg = JSON.parse(text) as ViruxControlMessage

      if (msg.protocolVersion !== FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION) {
        console.warn(`[FileTransferService] Protocol version mismatch: ${msg.protocolVersion}`)
        return
      }

      switch (msg.type) {
        case 'TRANSFER_REQUEST': {
          if (this.activeProgress && this.isActiveState(this.activeProgress.status)) {
            const reject: ViruxControlMessage = {
              protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
              type: 'TRANSFER_REJECT',
              transferId: msg.metadata.transferId,
              reason: 'Receiver busy with another transfer',
            }
            this.sendControlMessage(reject)
            return
          }

          if (msg.metadata.fileSize > FILE_TRANSFER_CONSTANTS.MAX_FILE_SIZE) {
            const reject: ViruxControlMessage = {
              protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
              type: 'TRANSFER_REJECT',
              transferId: msg.metadata.transferId,
              reason: 'File exceeds 500 MB limit',
            }
            this.sendControlMessage(reject)
            return
          }

          this.incomingMetadata = msg.metadata
          this.callbacks.onIncomingRequest?.(msg.metadata)
          break
        }

        case 'TRANSFER_ACCEPT': {
          if (this.activeProgress?.transferId === msg.transferId) {
            this.acceptanceResolver?.(true)
            this.acceptanceResolver = null
          }
          break
        }

        case 'TRANSFER_REJECT': {
          if (this.activeProgress?.transferId === msg.transferId) {
            this.acceptanceResolver?.(false)
            this.acceptanceResolver = null
            this.updateProgress({
              ...this.activeProgress,
              status: 'REJECTED',
              errorMessage: msg.reason,
            })
          }
          break
        }

        case 'TRANSFER_COMPLETE': {
          void this.handleTransferComplete(msg.transferId, msg.sha256, msg.totalBytes)
          break
        }

        case 'TRANSFER_CANCEL': {
          if (this.activeProgress?.transferId === msg.transferId) {
            this.isSendCancelled = true
            this.updateProgress({
              ...this.activeProgress,
              status: 'CANCELLED',
              errorMessage: msg.reason,
            })
          }
          break
        }

        case 'TRANSFER_ERROR': {
          if (this.activeProgress?.transferId === msg.transferId) {
            this.failActiveTransfer(msg.error)
          }
          break
        }
      }
    } catch (e) {
      console.error('[FileTransferService] Malformed JSON control message:', e)
    }
  }

  private handleBinaryChunk(buffer: ArrayBuffer) {
    if (!this.receivingMetadata || !this.activeProgress || this.activeProgress.status !== 'RECEIVING') {
      console.warn('[FileTransferService] Received chunk without active receiving session')
      return
    }

    if (buffer.byteLength < FILE_TRANSFER_CONSTANTS.SEQUENCE_HEADER_SIZE) {
      this.failActiveTransfer('Binary chunk missing 4-byte sequence header')
      return
    }

    const dataView = new DataView(buffer)
    const chunkIndex = dataView.getUint32(0, false)

    if (chunkIndex !== this.expectedChunkIndex) {
      this.failActiveTransfer(
        `Sequence error: expected chunk #${this.expectedChunkIndex}, received #${chunkIndex}`
      )
      return
    }

    const payload = new Uint8Array(buffer, FILE_TRANSFER_CONSTANTS.SEQUENCE_HEADER_SIZE)
    this.receivedChunks.push(payload)
    this.expectedChunkIndex++
    this.totalBytesReceived += payload.byteLength

    const total = this.receivingMetadata.fileSize
    const pct = total > 0 ? Math.floor((this.totalBytesReceived / total) * 100) : 0

    this.updateProgress({
      ...this.activeProgress,
      bytesTransferred: this.totalBytesReceived,
      progress: Math.min(pct, 99), // Keep at 99% until SHA-256 verified
    })
  }

  private async handleTransferComplete(transferId: string, expectedHash: string, totalBytes: number) {
    if (!this.receivingMetadata || this.receivingMetadata.transferId !== transferId) {
      console.warn('[FileTransferService] TRANSFER_COMPLETE id mismatch')
      return
    }

    this.updateProgress({
      ...this.activeProgress!,
      status: 'VERIFYING',
    })

    // Concatenate chunks
    const fullBuffer = new Uint8Array(this.totalBytesReceived)
    let offset = 0
    for (const chunk of this.receivedChunks) {
      fullBuffer.set(chunk, offset)
      offset += chunk.byteLength
    }

    // Verify SHA-256
    const actualHash = await calculateSha256Hex(fullBuffer.buffer)
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      const err = `SHA-256 mismatch! Expected ${expectedHash}, got ${actualHash}`
      console.error('[FileTransferService]', err)
      const errorMsg: ViruxControlMessage = {
        protocolVersion: FILE_TRANSFER_CONSTANTS.PROTOCOL_VERSION,
        type: 'TRANSFER_ERROR',
        transferId,
        error: err,
      }
      this.sendControlMessage(errorMsg)
      this.failActiveTransfer(err)
      return
    }

    // Create Blob and trigger download
    this.updateProgress({
      ...this.activeProgress!,
      status: 'SAVING',
    })

    const mime = this.receivingMetadata.mimeType || 'application/octet-stream'
    const blob = new Blob([fullBuffer], { type: mime })

    // Auto-trigger browser download
    this.triggerBrowserDownload(blob, this.receivingMetadata.fileName)

    this.updateProgress({
      ...this.activeProgress!,
      status: 'COMPLETED',
      progress: 100,
      bytesTransferred: totalBytes,
      completedAt: Date.now(),
    })

    this.callbacks.onCompleted?.(this.activeProgress!, blob)
    this.receivedChunks = []
    this.receivingMetadata = null
  }

  private triggerBrowserDownload(blob: Blob, fileName: string) {
    try {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.warn('[FileTransferService] Browser download auto-trigger failed:', e)
    }
  }

  private sendControlMessage(msg: ViruxControlMessage) {
    if (!this.channel || this.channel.readyState !== 'open') {
      console.warn('[FileTransferService] Cannot send control message; DataChannel not open')
      return
    }
    this.channel.send(JSON.stringify(msg))
  }

  private updateProgress(progress: ActiveTransferProgress) {
    this.activeProgress = progress
    this.callbacks.onProgress?.(progress)
  }

  private failActiveTransfer(error: string) {
    if (this.activeProgress) {
      this.updateProgress({
        ...this.activeProgress,
        status: 'FAILED',
        errorMessage: error,
      })
    }
    this.callbacks.onError?.(new Error(error))
    this.receivedChunks = []
    this.receivingMetadata = null
  }

  private isActiveState(status: string): boolean {
    return [
      'REQUESTING',
      'AWAITING_ACCEPTANCE',
      'ACCEPTED',
      'PREPARING',
      'SENDING',
      'RECEIVING',
      'PAUSED',
      'VERIFYING',
      'SAVING',
    ].includes(status)
  }
}

