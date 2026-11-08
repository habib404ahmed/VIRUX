package com.virux.app.filetransfer

import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer

sealed class ViruxControlMessage {
    data class TransferRequest(val metadata: FileMetadata) : ViruxControlMessage()
    data class TransferAccept(val transferId: String) : ViruxControlMessage()
    data class TransferReject(val transferId: String, val reason: String) : ViruxControlMessage()
    data class TransferComplete(val transferId: String, val totalChunks: Int, val totalBytes: Long, val sha256: String) : ViruxControlMessage()
    data class TransferCancel(val transferId: String, val reason: String) : ViruxControlMessage()
    data class TransferError(val transferId: String, val error: String) : ViruxControlMessage()
}

object FileTransferProtocol {

    private val SHA256_REGEX = Regex("^[0-9a-fA-F]{64}$")

    /**
     * Sanitizes an incoming filename to prevent path traversal or filesystem escaping.
     */
    fun sanitizeFileName(rawName: String): String {
        val clean = rawName.replace("\\", "/")
            .substringAfterLast("/")
            .replace(Regex("[\r\n\t]"), "")
            .replace(Regex("[^a-zA-Z0-9._\\-\\s]"), "_")
            .trim()
        val withoutRelative = clean.replace(Regex("\\.{2,}"), ".")
            .trim { it == '.' || it.isWhitespace() }
        return withoutRelative.take(200).ifEmpty { "download.bin" }
    }

    /**
     * Serializes a control message to JSON string.
     */
    fun serializeMessage(msg: ViruxControlMessage): String {
        val json = JSONObject()
        when (msg) {
            is ViruxControlMessage.TransferRequest -> {
                json.put("type", "TRANSFER_REQUEST")
                json.put("transferId", msg.metadata.transferId)
                json.put("protocolVersion", msg.metadata.protocolVersion)
                json.put("fileName", msg.metadata.fileName)
                json.put("fileSize", msg.metadata.fileSize)
                json.put("mimeType", msg.metadata.mimeType)
                json.put("chunkSize", msg.metadata.chunkSize)
                json.put("totalChunks", msg.metadata.totalChunks)
                json.put("sha256", msg.metadata.sha256)
                json.put("direction", msg.metadata.direction)
                json.put("timestamp", msg.metadata.timestamp)
            }
            is ViruxControlMessage.TransferAccept -> {
                json.put("type", "TRANSFER_ACCEPT")
                json.put("transferId", msg.transferId)
            }
            is ViruxControlMessage.TransferReject -> {
                json.put("type", "TRANSFER_REJECT")
                json.put("transferId", msg.transferId)
                json.put("reason", msg.reason)
            }
            is ViruxControlMessage.TransferComplete -> {
                json.put("type", "TRANSFER_COMPLETE")
                json.put("transferId", msg.transferId)
                json.put("totalChunks", msg.totalChunks)
                json.put("totalBytes", msg.totalBytes)
                json.put("sha256", msg.sha256)
            }
            is ViruxControlMessage.TransferCancel -> {
                json.put("type", "TRANSFER_CANCEL")
                json.put("transferId", msg.transferId)
                json.put("reason", msg.reason)
            }
            is ViruxControlMessage.TransferError -> {
                json.put("type", "TRANSFER_ERROR")
                json.put("transferId", msg.transferId)
                json.put("error", msg.error)
            }
        }
        return json.toString()
    }

    /**
     * Parses and strictly validates an incoming JSON control message.
     */
    fun parseControlMessage(text: String): Result<ViruxControlMessage> = runCatching {
        val json = JSONObject(text)
        val type = json.optString("type")
        val transferId = json.optString("transferId")

        if (transferId.isEmpty()) {
            throw IllegalArgumentException("Missing transferId in control message")
        }

        when (type) {
            "TRANSFER_REQUEST" -> {
                val protocol = json.optString("protocolVersion")
                if (protocol != FileTransferConstants.PROTOCOL_VERSION) {
                    throw IllegalArgumentException("Unsupported protocol version: $protocol")
                }

                val rawName = json.optString("fileName")
                val fileName = sanitizeFileName(rawName)

                val fileSize = json.optLong("fileSize", -1L)
                if (fileSize <= 0) {
                    throw IllegalArgumentException("Invalid file size: $fileSize")
                }
                if (fileSize > FileTransferConstants.MAX_FILE_SIZE) {
                    throw IllegalArgumentException("File size exceeds 500MB maximum limit")
                }

                val chunkSize = json.optInt("chunkSize", FileTransferConstants.CHUNK_SIZE)
                val totalChunks = json.optInt("totalChunks", 0)
                if (totalChunks <= 0) {
                    throw IllegalArgumentException("Invalid totalChunks count: $totalChunks")
                }

                val sha256 = json.optString("sha256")
                if (!SHA256_REGEX.matches(sha256)) {
                    throw IllegalArgumentException("Invalid SHA-256 hash format: $sha256")
                }

                val metadata = FileMetadata(
                    transferId = transferId,
                    protocolVersion = protocol,
                    fileName = fileName,
                    fileSize = fileSize,
                    mimeType = json.optString("mimeType", "application/octet-stream"),
                    chunkSize = chunkSize,
                    totalChunks = totalChunks,
                    sha256 = sha256.lowercase(),
                    direction = json.optString("direction", "web_to_android"),
                    timestamp = json.optString("timestamp")
                )
                ViruxControlMessage.TransferRequest(metadata)
            }
            "TRANSFER_ACCEPT" -> {
                ViruxControlMessage.TransferAccept(transferId)
            }
            "TRANSFER_REJECT" -> {
                ViruxControlMessage.TransferReject(transferId, json.optString("reason", "Transfer rejected"))
            }
            "TRANSFER_COMPLETE" -> {
                val totalChunks = json.optInt("totalChunks", 0)
                val totalBytes = json.optLong("totalBytes", 0L)
                val sha256 = json.optString("sha256", "").lowercase()
                ViruxControlMessage.TransferComplete(transferId, totalChunks, totalBytes, sha256)
            }
            "TRANSFER_CANCEL" -> {
                ViruxControlMessage.TransferCancel(transferId, json.optString("reason", "Transfer cancelled"))
            }
            "TRANSFER_ERROR" -> {
                ViruxControlMessage.TransferError(transferId, json.optString("error", "Unknown error"))
            }
            else -> throw IllegalArgumentException("Unknown control message type: $type")
        }
    }

    /**
     * Packs binary chunk with 4-byte sequence number header.
     */
    fun packChunk(chunkIndex: Int, data: ByteArray): ByteArray {
        val buffer = ByteBuffer.allocate(4 + data.size)
        buffer.putInt(chunkIndex)
        buffer.put(data)
        return buffer.array()
    }

    /**
     * Unpacks 4-byte sequence number and payload bytes from binary chunk.
     */
    fun unpackChunk(data: ByteArray): Pair<Int, ByteArray> {
        if (data.size < 4) {
            throw IllegalArgumentException("Chunk data smaller than 4-byte header: ${data.size} bytes")
        }
        val buffer = ByteBuffer.wrap(data)
        val index = buffer.getInt()
        val payload = ByteArray(data.size - 4)
        buffer.get(payload)
        return Pair(index, payload)
    }
}

