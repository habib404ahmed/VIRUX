package com.virux.app.filetransfer

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID

/**
 * Android peer-to-peer file transfer manager executing over WebRTC ViruxDataChannel.
 * Supports incremental chunking, backpressure drainage, SHA-256 verification, and SAF I/O.
 */
class ViruxFileTransferManager(
    private val context: Context,
    private val scope: CoroutineScope
) : ViruxDataChannelObserver {

    companion object {
        private const val TAG = "VIRUX_FileTransferMgr"
    }

    private val mutex = Mutex()
    private var dataChannel: ViruxDataChannel? = null

    private val _transferItem = MutableStateFlow<FileTransferItem?>(null)
    val transferItem: StateFlow<FileTransferItem?> = _transferItem.asStateFlow()

    private val _incomingRequest = MutableStateFlow<FileMetadata?>(null)
    val incomingRequest: StateFlow<FileMetadata?> = _incomingRequest.asStateFlow()

    private var activeSendingJob: Job? = null
    private var activeReceivingFile: File? = null
    private var activeReceivingStream: FileOutputStream? = null
    private var activeDigest: MessageDigest? = null
    private var activeMetadata: FileMetadata? = null
    private var expectedChunkIndex = 0
    private var totalBytesReceived = 0L

    // Backpressure synchronization
    private var isBackpressurePaused = false
    private val bufferDrainNotifier = CompletableDeferred<Unit>()

    fun attachDataChannel(channel: ViruxDataChannel) {
        this.dataChannel = channel
        channel.registerObserver(this)
        Log.i(TAG, "Attached DataChannel: ${channel.label} (isOpen=${channel.isOpen()})")
    }

    fun detachDataChannel() {
        dataChannel?.unregisterObserver()
        dataChannel = null
        cancelActiveTransfer("DataChannel detached")
    }

    override fun onStateChange(isOpen: Boolean) {
        Log.i(TAG, "DataChannel state changed: isOpen=$isOpen")
        if (!isOpen) {
            val current = _transferItem.value
            if (current != null && current.status.isActive) {
                failActiveTransfer("Peer connection DataChannel closed unexpectedly")
            }
        }
    }

    override fun onBufferedAmountChange(previousAmount: Long) {
        val currentAmount = dataChannel?.bufferedAmount() ?: 0L
        if (isBackpressurePaused && currentAmount <= FileTransferConstants.BUFFERED_AMOUNT_LOW_THRESHOLD) {
            isBackpressurePaused = false
            Log.d(TAG, "Buffer drained to $currentAmount bytes. Resuming producer.")
        }
    }

    override fun onMessage(text: String?, binaryData: ByteArray?) {
        if (text != null) {
            handleControlMessageText(text)
        } else if (binaryData != null) {
            handleBinaryChunk(binaryData)
        }
    }

    private fun handleControlMessageText(text: String) {
        val parsed = FileTransferProtocol.parseControlMessage(text).getOrElse { err ->
            Log.w(TAG, "Malformed control message received: ${err.message}")
            return
        }

        when (parsed) {
            is ViruxControlMessage.TransferRequest -> {
                Log.i(TAG, "Incoming TRANSFER_REQUEST for ${parsed.metadata.fileName} (${parsed.metadata.fileSize} bytes)")
                activeMetadata = parsed.metadata
                _incomingRequest.value = parsed.metadata
                _transferItem.value = FileTransferItem(
                    id = parsed.metadata.transferId,
                    fileName = parsed.metadata.fileName,
                    fileSize = parsed.metadata.fileSize,
                    direction = "receive",
                    status = FileTransferState.AWAITING_ACCEPTANCE,
                    mimeType = parsed.metadata.mimeType,
                    sha256 = parsed.metadata.sha256
                )
            }
            is ViruxControlMessage.TransferAccept -> {
                Log.i(TAG, "Remote peer ACCEPTED transfer ${parsed.transferId}")
                _transferItem.update { it?.copy(status = FileTransferState.SENDING) }
            }
            is ViruxControlMessage.TransferReject -> {
                Log.i(TAG, "Remote peer REJECTED transfer: ${parsed.reason}")
                _transferItem.update { it?.copy(status = FileTransferState.REJECTED, errorMessage = parsed.reason) }
                cleanupActiveSend()
            }
            is ViruxControlMessage.TransferComplete -> {
                Log.i(TAG, "Remote peer signaled TRANSFER_COMPLETE for ${parsed.transferId}")
                verifyAndCommitReceivedFile(parsed)
            }
            is ViruxControlMessage.TransferCancel -> {
                Log.i(TAG, "Remote peer CANCELLED transfer: ${parsed.reason}")
                _transferItem.update { it?.copy(status = FileTransferState.CANCELLED, errorMessage = parsed.reason) }
                cleanupActiveReceive(deleteFile = true)
                cleanupActiveSend()
            }
            is ViruxControlMessage.TransferError -> {
                Log.e(TAG, "Remote peer reported TRANSFER_ERROR: ${parsed.error}")
                _transferItem.update { it?.copy(status = FileTransferState.FAILED, errorMessage = parsed.error) }
                cleanupActiveReceive(deleteFile = true)
                cleanupActiveSend()
            }
        }
    }

    private fun handleBinaryChunk(binaryData: ByteArray) {
        val item = _transferItem.value ?: return
        if (item.status != FileTransferState.RECEIVING && item.status != FileTransferState.AWAITING_ACCEPTANCE) {
            Log.w(TAG, "Received chunk in unexpected state: ${item.status}")
            return
        }

        val (chunkIndex, payload) = try {
            FileTransferProtocol.unpackChunk(binaryData)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unpack binary chunk: ${e.message}")
            failActiveTransfer("Malformed binary chunk header")
            return
        }

        if (chunkIndex != expectedChunkIndex) {
            Log.e(TAG, "Chunk sequence mismatch! Expected $expectedChunkIndex, received $chunkIndex")
            failActiveTransfer("Chunk out of order: expected $expectedChunkIndex, received $chunkIndex")
            return
        }

        try {
            val fos = activeReceivingStream ?: throw IllegalStateException("Receiving stream is not open")
            fos.write(payload)
            activeDigest?.update(payload)
            expectedChunkIndex++
            totalBytesReceived += payload.size

            val pct = if (item.fileSize > 0) ((totalBytesReceived * 100) / item.fileSize).toInt() else 0
            _transferItem.update {
                it?.copy(
                    bytesTransferred = totalBytesReceived,
                    progress = pct,
                    status = FileTransferState.RECEIVING
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error writing incoming chunk to storage: ${e.message}")
            failActiveTransfer("Storage write error: ${e.message}")
        }
    }

    /**
     * User accepts an incoming transfer request.
     */
    fun acceptIncomingTransfer(transferId: String): Result<Unit> = runCatching {
        val meta = activeMetadata ?: throw IllegalStateException("No active transfer metadata")
        if (meta.transferId != transferId) throw IllegalArgumentException("Transfer ID mismatch")

        val tempFile = File(context.cacheDir, "virux_transfer_${meta.transferId}.part")
        if (tempFile.exists()) tempFile.delete()
        tempFile.createNewFile()

        this.activeReceivingFile = tempFile
        this.activeReceivingStream = FileOutputStream(tempFile)
        this.activeDigest = MessageDigest.getInstance("SHA-256")
        this.expectedChunkIndex = 0
        this.totalBytesReceived = 0L

        _incomingRequest.value = null
        _transferItem.update { it?.copy(status = FileTransferState.RECEIVING) }

        val acceptMsg = ViruxControlMessage.TransferAccept(transferId)
        val sent = dataChannel?.sendText(FileTransferProtocol.serializeMessage(acceptMsg)) ?: false
        if (!sent) {
            throw IllegalStateException("Failed to transmit TRANSFER_ACCEPT over DataChannel")
        }
        Log.i(TAG, "Accepted incoming transfer for ${meta.fileName}, writing to ${tempFile.absolutePath}")
    }

    /**
     * User rejects an incoming transfer request.
     */
    fun rejectIncomingTransfer(transferId: String, reason: String = "User declined"): Result<Unit> = runCatching {
        _incomingRequest.value = null
        _transferItem.update { it?.copy(status = FileTransferState.REJECTED, errorMessage = reason) }
        val rejectMsg = ViruxControlMessage.TransferReject(transferId, reason)
        dataChannel?.sendText(FileTransferProtocol.serializeMessage(rejectMsg))
        cleanupActiveReceive(deleteFile = true)
        Log.i(TAG, "Rejected incoming transfer $transferId: $reason")
    }

    private fun verifyAndCommitReceivedFile(completeMsg: ViruxControlMessage.TransferComplete) {
        val item = _transferItem.value ?: return
        _transferItem.update { it?.copy(status = FileTransferState.VERIFYING) }

        try {
            activeReceivingStream?.flush()
            activeReceivingStream?.close()
            activeReceivingStream = null

            val digestBytes = activeDigest?.digest() ?: ByteArray(0)
            val actualHash = digestBytes.joinToString("") { "%02x".format(it) }.lowercase()
            val expectedHash = completeMsg.sha256.lowercase()

            if (actualHash != expectedHash) {
                Log.e(TAG, "SHA-256 integrity mismatch! Expected: $expectedHash, Actual: $actualHash")
                failActiveTransfer("File integrity check failed: SHA-256 digest mismatch")
                cleanupActiveReceive(deleteFile = true)
                return
            }

            _transferItem.update { it?.copy(status = FileTransferState.SAVING) }

            // Move completed file to dedicated downloads cache
            val finalDir = File(context.filesDir, "transfers").apply { if (!exists()) mkdirs() }
            val finalFile = File(finalDir, item.fileName)
            activeReceivingFile?.let { temp ->
                if (finalFile.exists()) finalFile.delete()
                temp.renameTo(finalFile)
            }

            _transferItem.update {
                it?.copy(
                    status = FileTransferState.COMPLETED,
                    progress = 100,
                    bytesTransferred = it.fileSize,
                    completedAt = System.currentTimeMillis()
                )
            }
            Log.i(TAG, "Successfully verified and committed file ${item.fileName} (${item.fileSize} bytes)")
        } catch (e: Exception) {
            Log.e(TAG, "Verification/Commit error: ${e.message}")
            failActiveTransfer("Save error: ${e.message}")
            cleanupActiveReceive(deleteFile = true)
        }
    }

    /**
     * Initiates sending a file to the remote peer over DataChannel.
     */
    fun startFileSend(uri: Uri, direction: String = "android_to_web"): Result<Unit> = runCatching {
        val channel = dataChannel ?: throw IllegalStateException("DataChannel is not connected")
        if (!channel.isOpen()) throw IllegalStateException("DataChannel is not open (state=${channel.isOpen()})")

        val current = _transferItem.value
        if (current != null && current.status.isActive) {
            throw IllegalStateException("Another file transfer is currently active (${current.status})")
        }

        val transferId = UUID.randomUUID().toString()
        val (rawName, size) = queryFileInfo(uri)
        val fileName = FileTransferProtocol.sanitizeFileName(rawName)

        if (size <= 0) throw IllegalArgumentException("Selected file is empty")
        if (size > FileTransferConstants.MAX_FILE_SIZE) throw IllegalArgumentException("File exceeds 500MB maximum limit")

        _transferItem.value = FileTransferItem(
            id = transferId,
            fileName = fileName,
            fileSize = size,
            direction = "send",
            status = FileTransferState.PREPARING
        )

        activeSendingJob?.cancel()
        activeSendingJob = scope.launch(Dispatchers.IO) {
            try {
                // 1. Calculate SHA-256 incrementally before sending
                val digest = MessageDigest.getInstance("SHA-256")
                val buf = ByteArray(FileTransferConstants.CHUNK_SIZE)
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    var r: Int
                    while (stream.read(buf).also { r = it } != -1) {
                        digest.update(buf, 0, r)
                    }
                }
                val sha256 = digest.digest().joinToString("") { "%02x".format(it) }.lowercase()

                val totalChunks = Math.ceil(size.toDouble() / FileTransferConstants.MAX_CHUNK_PAYLOAD).toInt()
                val metadata = FileMetadata(
                    transferId = transferId,
                    fileName = fileName,
                    fileSize = size,
                    totalChunks = totalChunks,
                    sha256 = sha256,
                    direction = direction,
                    timestamp = System.currentTimeMillis().toString()
                )

                _transferItem.update { it?.copy(sha256 = sha256, status = FileTransferState.REQUESTING) }

                // 2. Transmit TRANSFER_REQUEST
                val requestMsg = ViruxControlMessage.TransferRequest(metadata)
                channel.sendText(FileTransferProtocol.serializeMessage(requestMsg))
                Log.i(TAG, "Sent TRANSFER_REQUEST for $fileName. Awaiting remote acceptance...")

                // 3. Wait for remote ACCEPT
                withTimeout(60_000L) {
                    while (isActive) {
                        val state = _transferItem.value?.status
                        if (state == FileTransferState.SENDING) break
                        if (state == FileTransferState.REJECTED || state == FileTransferState.CANCELLED || state == FileTransferState.FAILED) {
                            return@withTimeout
                        }
                        delay(100)
                    }
                }

                if (_transferItem.value?.status != FileTransferState.SENDING) {
                    Log.w(TAG, "Transfer was not accepted. Aborting send pipeline.")
                    return@launch
                }

                // 4. Stream chunks with backpressure
                Log.i(TAG, "Streaming $totalChunks chunks for $fileName...")
                var chunkIdx = 0
                var bytesSent = 0L
                val chunkBuffer = ByteArray(FileTransferConstants.MAX_CHUNK_PAYLOAD)

                context.contentResolver.openInputStream(uri)?.use { stream ->
                    var bytesRead: Int
                    while (stream.read(chunkBuffer).also { bytesRead = it } != -1 && isActive) {
                        // Check backpressure
                        while (channel.bufferedAmount() > FileTransferConstants.BUFFERED_AMOUNT_HIGH_THRESHOLD && isActive) {
                            isBackpressurePaused = true
                            delay(20)
                        }

                        val payload = if (bytesRead == FileTransferConstants.MAX_CHUNK_PAYLOAD) chunkBuffer else chunkBuffer.copyOf(bytesRead)
                        val packed = FileTransferProtocol.packChunk(chunkIdx, payload)
                        val sent = channel.sendBinary(packed)
                        if (!sent) {
                            throw IllegalStateException("DataChannel.sendBinary failed at chunk $chunkIdx")
                        }

                        chunkIdx++
                        bytesSent += bytesRead

                        val pct = ((bytesSent * 100) / size).toInt()
                        _transferItem.update {
                            it?.copy(
                                bytesTransferred = bytesSent,
                                progress = pct
                            )
                        }
                    }
                }

                // 5. Transmit TRANSFER_COMPLETE
                val completeMsg = ViruxControlMessage.TransferComplete(transferId, totalChunks, bytesSent, sha256)
                channel.sendText(FileTransferProtocol.serializeMessage(completeMsg))

                _transferItem.update {
                    it?.copy(
                        status = FileTransferState.COMPLETED,
                        progress = 100,
                        bytesTransferred = size,
                        completedAt = System.currentTimeMillis()
                    )
                }
                Log.i(TAG, "Successfully sent $fileName ($bytesSent bytes in $totalChunks chunks)")
            } catch (e: Exception) {
                if (e is CancellationException) {
                    Log.i(TAG, "File send job cancelled")
                } else {
                    Log.e(TAG, "Error in file send pipeline: ${e.message}")
                    failActiveTransfer("Send error: ${e.message}")
                }
            }
        }
    }

    private fun queryFileInfo(uri: Uri): Pair<String, Long> {
        var name = "file.bin"
        var size = 0L
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIdx != -1) name = cursor.getString(nameIdx) ?: "file.bin"
                if (sizeIdx != -1) size = cursor.getLong(sizeIdx)
            }
        }
        return Pair(name, size)
    }

    fun cancelActiveTransfer(reason: String = "Cancelled by user") {
        val item = _transferItem.value ?: return
        if (item.status.isActive) {
            val cancelMsg = ViruxControlMessage.TransferCancel(item.id, reason)
            dataChannel?.sendText(FileTransferProtocol.serializeMessage(cancelMsg))
            _transferItem.update { it?.copy(status = FileTransferState.CANCELLED, errorMessage = reason) }
        }
        cleanupActiveSend()
        cleanupActiveReceive(deleteFile = true)
    }

    private fun failActiveTransfer(error: String) {
        val item = _transferItem.value
        if (item != null) {
            val errorMsg = ViruxControlMessage.TransferError(item.id, error)
            dataChannel?.sendText(FileTransferProtocol.serializeMessage(errorMsg))
            _transferItem.update { it?.copy(status = FileTransferState.FAILED, errorMessage = error) }
        }
        cleanupActiveSend()
        cleanupActiveReceive(deleteFile = true)
    }

    private fun cleanupActiveSend() {
        activeSendingJob?.cancel()
        activeSendingJob = null
    }

    private fun cleanupActiveReceive(deleteFile: Boolean) {
        try {
            activeReceivingStream?.close()
        } catch (e: Exception) {}
        activeReceivingStream = null
        activeDigest = null
        if (deleteFile) {
            activeReceivingFile?.delete()
        }
        activeReceivingFile = null
    }

    fun clearCompletedTransfer() {
        if (_transferItem.value?.status?.isTerminal == true) {
            _transferItem.value = null
            _incomingRequest.value = null
        }
    }
}
