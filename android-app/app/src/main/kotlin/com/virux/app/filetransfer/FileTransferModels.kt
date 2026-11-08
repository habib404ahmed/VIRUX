package com.virux.app.filetransfer

enum class FileTransferState(val value: String) {
    IDLE("idle"),
    REQUESTING("requesting"),
    AWAITING_ACCEPTANCE("awaiting_acceptance"),
    ACCEPTED("accepted"),
    PREPARING("preparing"),
    SENDING("sending"),
    RECEIVING("receiving"),
    PAUSED("paused"),
    VERIFYING("verifying"),
    SAVING("saving"),
    COMPLETED("completed"),
    CANCELLED("cancelled"),
    REJECTED("rejected"),
    FAILED("failed"),
    EXPIRED("expired");

    val isTerminal: Boolean
        get() = this in listOf(COMPLETED, CANCELLED, REJECTED, FAILED, EXPIRED)

    val isActive: Boolean
        get() = this in listOf(REQUESTING, AWAITING_ACCEPTANCE, ACCEPTED, PREPARING, SENDING, RECEIVING, PAUSED, VERIFYING, SAVING)

    companion object {
        fun fromValue(value: String): FileTransferState {
            return entries.firstOrNull { it.value.equals(value, ignoreCase = true) } ?: IDLE
        }
    }
}

object FileTransferConstants {
    const val PROTOCOL_VERSION = "VIRUX_FILE_TRANSFER_V1"
    const val DATA_CHANNEL_LABEL = "virux-file-transfer"
    const val CHUNK_SIZE = 65536 // 64 KiB
    const val MAX_CHUNK_PAYLOAD = 65532 // 64 KiB - 4 byte index header
    const val MAX_FILE_SIZE = 524_288_000L // 500 MB safe limit for P2P buffer
    const val BUFFERED_AMOUNT_HIGH_THRESHOLD = 524_288L // 512 KiB
    const val BUFFERED_AMOUNT_LOW_THRESHOLD = 65_536L // 64 KiB
}

data class FileMetadata(
    val transferId: String,
    val protocolVersion: String = FileTransferConstants.PROTOCOL_VERSION,
    val fileName: String,
    val fileSize: Long,
    val mimeType: String = "application/octet-stream",
    val chunkSize: Int = FileTransferConstants.CHUNK_SIZE,
    val totalChunks: Int,
    val sha256: String,
    val direction: String, // "android_to_web" or "web_to_android"
    val timestamp: String
)

data class FileTransferItem(
    val id: String,
    val fileName: String,
    val fileSize: Long,
    val bytesTransferred: Long = 0L,
    val progress: Int = 0,
    val direction: String, // "send" or "receive"
    val status: FileTransferState = FileTransferState.IDLE,
    val mimeType: String = "application/octet-stream",
    val sha256: String = "",
    val errorMessage: String? = null,
    val startedAt: Long = System.currentTimeMillis(),
    val completedAt: Long? = null
)

