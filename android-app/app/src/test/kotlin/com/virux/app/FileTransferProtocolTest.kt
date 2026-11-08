package com.virux.app

import com.virux.app.filetransfer.FileMetadata
import com.virux.app.filetransfer.FileTransferConstants
import com.virux.app.filetransfer.FileTransferProtocol
import com.virux.app.filetransfer.ViruxControlMessage
import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer

class FileTransferProtocolTest {

    @Test
    fun testProtocolVersionIsStrict() {
        assertEquals("VIRUX_FILE_TRANSFER_V1", FileTransferConstants.PROTOCOL_VERSION)
    }

    @Test
    fun testControlMessageSerializationAndParsing() {
        val metadata = FileMetadata(
            transferId = "tx-test-123",
            fileName = "sample_photo.jpg",
            fileSize = 1048576L,
            totalChunks = 16,
            sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            mimeType = "image/jpeg",
            direction = "android_to_web",
            timestamp = "1731050000000"
        )

        // 1. TRANSFER_REQUEST
        val req = ViruxControlMessage.TransferRequest(metadata)
        val jsonReq = FileTransferProtocol.serializeMessage(req)
        val parsedReq = FileTransferProtocol.parseControlMessage(jsonReq).getOrThrow()
        assertTrue(parsedReq is ViruxControlMessage.TransferRequest)
        assertEquals(metadata.transferId, (parsedReq as ViruxControlMessage.TransferRequest).metadata.transferId)
        assertEquals(metadata.fileName, parsedReq.metadata.fileName)
        assertEquals(metadata.fileSize, parsedReq.metadata.fileSize)
        assertEquals(metadata.totalChunks, parsedReq.metadata.totalChunks)
        assertEquals(metadata.sha256, parsedReq.metadata.sha256)

        // 2. TRANSFER_ACCEPT
        val accept = ViruxControlMessage.TransferAccept("tx-test-123")
        val jsonAccept = FileTransferProtocol.serializeMessage(accept)
        val parsedAccept = FileTransferProtocol.parseControlMessage(jsonAccept).getOrThrow()
        assertTrue(parsedAccept is ViruxControlMessage.TransferAccept)
        assertEquals("tx-test-123", (parsedAccept as ViruxControlMessage.TransferAccept).transferId)

        // 3. TRANSFER_REJECT
        val reject = ViruxControlMessage.TransferReject("tx-test-123", "User declined")
        val jsonReject = FileTransferProtocol.serializeMessage(reject)
        val parsedReject = FileTransferProtocol.parseControlMessage(jsonReject).getOrThrow()
        assertTrue(parsedReject is ViruxControlMessage.TransferReject)
        assertEquals("User declined", (parsedReject as ViruxControlMessage.TransferReject).reason)

        // 4. TRANSFER_COMPLETE
        val complete = ViruxControlMessage.TransferComplete("tx-test-123", 16, 1048576L, metadata.sha256)
        val jsonComplete = FileTransferProtocol.serializeMessage(complete)
        val parsedComplete = FileTransferProtocol.parseControlMessage(jsonComplete).getOrThrow()
        assertTrue(parsedComplete is ViruxControlMessage.TransferComplete)
        assertEquals(1048576L, (parsedComplete as ViruxControlMessage.TransferComplete).totalBytes)
        assertEquals(16, parsedComplete.totalChunks)

        // 5. TRANSFER_CANCEL
        val cancel = ViruxControlMessage.TransferCancel("tx-test-123", "User abort")
        val jsonCancel = FileTransferProtocol.serializeMessage(cancel)
        val parsedCancel = FileTransferProtocol.parseControlMessage(jsonCancel).getOrThrow()
        assertTrue(parsedCancel is ViruxControlMessage.TransferCancel)
        assertEquals("User abort", (parsedCancel as ViruxControlMessage.TransferCancel).reason)

        // 6. TRANSFER_ERROR
        val error = ViruxControlMessage.TransferError("tx-test-123", "SHA-256 mismatch")
        val jsonError = FileTransferProtocol.serializeMessage(error)
        val parsedError = FileTransferProtocol.parseControlMessage(jsonError).getOrThrow()
        assertTrue(parsedError is ViruxControlMessage.TransferError)
        assertEquals("SHA-256 mismatch", (parsedError as ViruxControlMessage.TransferError).error)
    }

    @Test
    fun testParseRejectsProtocolVersionMismatch() {
        val invalidJson = """
            {
                "protocolVersion": "VIRUX_V2_UNSUPPORTED",
                "type": "TRANSFER_ACCEPT",
                "transferId": "tx-123"
            }
        """.trimIndent()

        val result = FileTransferProtocol.parseControlMessage(invalidJson)
        // TRANSFER_REQUEST validates protocolVersion
        val invalidReqJson = """
            {
                "type": "TRANSFER_REQUEST",
                "transferId": "tx-123",
                "protocolVersion": "VIRUX_V2_UNSUPPORTED",
                "fileName": "test.txt",
                "fileSize": 100,
                "totalChunks": 1,
                "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            }
        """.trimIndent()
        val reqResult = FileTransferProtocol.parseControlMessage(invalidReqJson)
        assertTrue(reqResult.isFailure)
        assertTrue(reqResult.exceptionOrNull()?.message?.contains("Unsupported protocol version") == true)
    }

    @Test
    fun testFileNameSanitizationRemovesPathTraversal() {
        val cases = listOf(
            "../../../../etc/passwd" to "passwd",
            "..\\..\\Windows\\System32\\calc.exe" to "calc.exe",
            "   report_final\r\n.pdf   " to "report_final.pdf",
            "" to "download.bin",
            "   " to "download.bin",
            "../../.." to "download.bin",
            "simple_test.txt" to "simple_test.txt"
        )

        for ((input, expected) in cases) {
            val sanitized = FileTransferProtocol.sanitizeFileName(input)
            assertEquals(expected, sanitized)
            assertFalse(sanitized.contains("/"))
            assertFalse(sanitized.contains("\\"))
            assertFalse(sanitized.contains("\r"))
            assertFalse(sanitized.contains("\n"))
        }
    }

    @Test
    fun testMetadataValidationInParsing() {
        // Oversized file (> 500 MB)
        val oversizedJson = """
            {
                "type": "TRANSFER_REQUEST",
                "transferId": "tx-oversized",
                "protocolVersion": "VIRUX_FILE_TRANSFER_V1",
                "fileName": "huge.iso",
                "fileSize": 524288001,
                "totalChunks": 8000,
                "sha256": "${"a".repeat(64)}"
            }
        """.trimIndent()
        assertTrue(FileTransferProtocol.parseControlMessage(oversizedJson).isFailure)

        // Negative or zero file size
        val zeroSizeJson = """
            {
                "type": "TRANSFER_REQUEST",
                "transferId": "tx-zero",
                "protocolVersion": "VIRUX_FILE_TRANSFER_V1",
                "fileName": "zero.bin",
                "fileSize": 0,
                "totalChunks": 1,
                "sha256": "${"a".repeat(64)}"
            }
        """.trimIndent()
        assertTrue(FileTransferProtocol.parseControlMessage(zeroSizeJson).isFailure)

        // Invalid SHA-256 (not 64 characters)
        val shortHashJson = """
            {
                "type": "TRANSFER_REQUEST",
                "transferId": "tx-short-hash",
                "protocolVersion": "VIRUX_FILE_TRANSFER_V1",
                "fileName": "bad_hash.bin",
                "fileSize": 100,
                "totalChunks": 1,
                "sha256": "deadbeef"
            }
        """.trimIndent()
        assertTrue(FileTransferProtocol.parseControlMessage(shortHashJson).isFailure)
    }

    @Test
    fun testBinaryChunkFramingPackAndUnpack() {
        val sequenceIndex = 12345
        val testPayload = "VIRUX SCTP DataChannel Chunk Payload".toByteArray(Charsets.UTF_8)

        val packed = FileTransferProtocol.packChunk(sequenceIndex, testPayload)
        assertEquals(4 + testPayload.size, packed.size)

        // Verify big-endian sequence header
        val headerBuf = ByteBuffer.wrap(packed, 0, 4)
        assertEquals(sequenceIndex, headerBuf.int)

        val (extractedIndex, extractedPayload) = FileTransferProtocol.unpackChunk(packed)
        assertEquals(sequenceIndex, extractedIndex)
        assertArrayEquals(testPayload, extractedPayload)
    }

    @Test
    fun testUnpackChunkRejectsTruncatedFrame() {
        val truncatedFrame = ByteArray(3) // Less than 4-byte sequence header
        try {
            FileTransferProtocol.unpackChunk(truncatedFrame)
            fail("Expected IllegalArgumentException for frame < 4 bytes")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("smaller than 4-byte header") == true)
        }
    }

    @Test
    fun testConstantsInvariants() {
        assertEquals(65536, FileTransferConstants.CHUNK_SIZE)
        assertEquals(65532, FileTransferConstants.MAX_CHUNK_PAYLOAD)
        assertEquals(524288000L, FileTransferConstants.MAX_FILE_SIZE)
        assertEquals(524288L, FileTransferConstants.BUFFERED_AMOUNT_HIGH_THRESHOLD)
        assertEquals(65536L, FileTransferConstants.BUFFERED_AMOUNT_LOW_THRESHOLD)
        assertTrue(FileTransferConstants.BUFFERED_AMOUNT_HIGH_THRESHOLD > FileTransferConstants.BUFFERED_AMOUNT_LOW_THRESHOLD)
    }
}
