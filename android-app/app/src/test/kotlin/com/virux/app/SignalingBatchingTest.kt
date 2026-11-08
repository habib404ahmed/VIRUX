package com.virux.app

import com.virux.app.data.model.IceCandidatePayload
import com.virux.app.data.model.ParticipantRole
import com.virux.app.data.model.SdpPayload
import com.virux.app.data.model.SessionType
import com.virux.app.data.model.SignalingSession
import com.virux.app.data.model.SignalingState
import org.junit.Assert.*
import org.junit.Test
import java.util.Date

class SignalingBatchingTest {

    @Test
    fun testSignalingStateEnumMapping() {
        assertEquals(SignalingState.CREATED, SignalingState.fromValue("created"))
        assertEquals(SignalingState.OFFER_CREATED, SignalingState.fromValue("offer_created"))
        assertEquals(SignalingState.ANSWER_CREATED, SignalingState.fromValue("answer_created"))
        assertEquals(SignalingState.CONNECTING, SignalingState.fromValue("connecting"))
        assertEquals(SignalingState.CONNECTED, SignalingState.fromValue("connected"))
        assertEquals(SignalingState.CLOSED, SignalingState.fromValue("closed"))
        assertEquals(SignalingState.REVOKED, SignalingState.fromValue("revoked"))
        assertEquals(SignalingState.EXPIRED, SignalingState.fromValue("expired"))
        // Fallback
        assertEquals(SignalingState.CREATED, SignalingState.fromValue("unknown_state"))
    }

    @Test
    fun testSessionExpiryDetection() {
        val now = System.currentTimeMillis()
        val expiredSession = SignalingSession(
            sessionId = "test-session-1",
            ownerUid = "user_101",
            deviceId = "dev_202",
            status = "created",
            expiresAt = Date(now - 10000) // 10s in the past
        )

        assertEquals(SignalingState.EXPIRED, expiredSession.signalingState)
        assertTrue(expiredSession.isTerminal)

        val activeSession = SignalingSession(
            sessionId = "test-session-2",
            ownerUid = "user_101",
            deviceId = "dev_202",
            status = "connecting",
            expiresAt = Date(now + 60000) // 60s in the future
        )

        assertEquals(SignalingState.CONNECTING, activeSession.signalingState)
        assertFalse(activeSession.isTerminal)
    }

    @Test
    fun testTerminalStatesImmutability() {
        val closedSession = SignalingSession(status = "closed")
        val revokedSession = SignalingSession(status = "revoked")
        val connectingSession = SignalingSession(status = "connecting")

        assertTrue(closedSession.isTerminal)
        assertTrue(revokedSession.isTerminal)
        assertFalse(connectingSession.isTerminal)
    }

    @Test
    fun testCandidateDeduplicationFingerprint() {
        val candidates = listOf(
            IceCandidatePayload("candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host", "0", 0),
            IceCandidatePayload("candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host", "0", 0), // Duplicate
            IceCandidatePayload("candidate:2 1 UDP 2130706431 192.168.1.10 54322 typ host", "0", 0)
        )

        val seen = mutableSetOf<String>()
        val uniqueCandidates = mutableListOf<IceCandidatePayload>()

        for (c in candidates) {
            val fp = "${c.candidate}|${c.sdpMid}|${c.sdpMLineIndex}"
            if (seen.add(fp)) {
                uniqueCandidates.add(c)
            }
        }

        assertEquals(2, uniqueCandidates.size)
        assertEquals("candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host", uniqueCandidates[0].candidate)
        assertEquals("candidate:2 1 UDP 2130706431 192.168.1.10 54322 typ host", uniqueCandidates[1].candidate)
    }

    @Test
    fun testCandidateBatchSizing() {
        val maxBatchSize = 25
        val candidatesList = (1..60).map { i ->
            IceCandidatePayload("candidate:$i 1 UDP 2130706431 192.168.1.10 ${50000 + i} typ host", "0", 0)
        }

        val batches = candidatesList.chunked(maxBatchSize)
        assertEquals(3, batches.size)
        assertEquals(25, batches[0].size)
        assertEquals(25, batches[1].size)
        assertEquals(10, batches[2].size)
    }

    @Test
    fun testSdpPayloadBoundaries() {
        val validSdp = "v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
        val payload = SdpPayload(type = "offer", sdp = validSdp)
        assertTrue(payload.sdp.length <= 65536)

        val oversizedSdp = "x".repeat(66000)
        assertTrue(oversizedSdp.length > 65536)
    }
}

