package com.virux.app

import com.virux.app.data.model.QRPayload
import org.junit.Assert.*
import org.junit.Test

class QRPayloadParsingTest {

    @Test
    fun testValidQrPayloadParsing() {
        val json = """
            {
                "v": 1,
                "sid": "7b8d3a1f-4c2e-4b92-91a5-8e3b7c2a1e0f",
                "uid": "user_abc123",
                "cn": "challenge_nonce_hex_64_chars_test_payload",
                "pin": "849201",
                "exp": 1794012600000
            }
        """.trimIndent()

        val result = QRPayload.fromJson(json)
        assertTrue(result.isSuccess)

        val payload = result.getOrThrow()
        assertEquals(1, payload.v)
        assertEquals("7b8d3a1f-4c2e-4b92-91a5-8e3b7c2a1e0f", payload.sid)
        assertEquals("user_abc123", payload.uid)
        assertEquals("challenge_nonce_hex_64_chars_test_payload", payload.cn)
        assertEquals("849201", payload.pin)
        assertEquals(1794012600000L, payload.exp)
    }

    @Test
    fun testMalformedJsonRejection() {
        val invalidJson = "{ not a valid json }"
        val result = QRPayload.fromJson(invalidJson)
        assertTrue(result.isFailure)
    }

    @Test
    fun testMissingRequiredAttributesRejection() {
        val missingSid = """
            {
                "v": 1,
                "uid": "user_abc123",
                "cn": "nonce_123"
            }
        """.trimIndent()

        val result = QRPayload.fromJson(missingSid)
        assertTrue(result.isFailure)
    }
}

