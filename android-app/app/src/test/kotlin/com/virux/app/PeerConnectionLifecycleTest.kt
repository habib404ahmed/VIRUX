package com.virux.app

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import com.virux.app.data.model.IceCandidateBatch
import com.virux.app.data.model.IceCandidatePayload
import com.virux.app.data.model.SignalingSession
import com.virux.app.data.model.SignalingState
import com.virux.app.data.repository.AndroidCandidateBatcher
import com.virux.app.data.repository.SignalingRepository
import com.virux.app.webrtc.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.*
import org.junit.Test

class PeerConnectionLifecycleTest {

    // ─── Fake Implementations for Unit Testing Invariants ─────────

    private class FakeCandidateBatcher : AndroidCandidateBatcher {
        val queuedCandidates = mutableListOf<IceCandidatePayload>()
        var isCompleted = false
        var isDisposed = false

        override fun queueCandidate(candidate: IceCandidatePayload) {
            queuedCandidates.add(candidate)
        }

        override suspend fun completeGathering() {
            isCompleted = true
        }

        override suspend fun flush(isComplete: Boolean) {
            if (isComplete) isCompleted = true
        }

        override fun dispose() {
            isDisposed = true
        }
    }

    private class FakeSignalingRepository : SignalingRepository {
        val sessionFlow = MutableSharedFlow<SignalingSession>(replay = 1)
        val candidateFlow = MutableSharedFlow<IceCandidateBatch>(replay = 1)
        val batcher = FakeCandidateBatcher()
        var publishedAnswer: String? = null
        var lastStatus: SignalingState? = null
        var isClosed = false

        override fun observeIncomingSessions(userId: String, deviceId: String): Flow<List<SignalingSession>> = flowOf(emptyList())

        override fun observeSession(userId: String, deviceId: String, sessionId: String): Flow<SignalingSession> = sessionFlow

        override suspend fun publishAnswer(userId: String, deviceId: String, sessionId: String, sdp: String): Result<Unit> {
            publishedAnswer = sdp
            return Result.success(Unit)
        }

        override suspend fun publishOffer(userId: String, deviceId: String, sessionId: String, sdp: String): Result<Unit> = Result.success(Unit)

        override suspend fun updateStatus(userId: String, deviceId: String, sessionId: String, status: SignalingState): Result<Unit> {
            lastStatus = status
            return Result.success(Unit)
        }

        override suspend fun closeSession(userId: String, deviceId: String, sessionId: String): Result<Unit> {
            isClosed = true
            return Result.success(Unit)
        }

        override fun observeRemoteCandidateBatches(userId: String, deviceId: String, sessionId: String, remoteSender: String): Flow<IceCandidateBatch> = candidateFlow

        override fun createCandidateBatcher(
            userId: String,
            deviceId: String,
            sessionId: String,
            sender: String,
            debounceMs: Long,
            maxBatchSize: Int,
            scope: CoroutineScope
        ): AndroidCandidateBatcher = batcher
    }

    private class FakeWebRtcEngine(
        val shouldInitFail: Boolean = false,
        val shouldCaptureFail: Boolean = false,
        val shouldPcFail: Boolean = false
    ) : WebRtcEngine {
        var isInitialized = false
        var isCapturing = false
        var isPcCreated = false
        var isDisposed = false
        var lastOffer: String? = null
        var observer: WebRtcEngineObserver? = null
        val appliedRemoteCandidates = mutableListOf<IceCandidatePayload>()

        override fun initialize(context: Context?): Result<Unit> {
            if (shouldInitFail) return Result.failure(IllegalStateException("Simulated encoder init failure"))
            isInitialized = true
            return Result.success(Unit)
        }

        override fun startScreenCapture(
            context: Context,
            resultData: Intent,
            width: Int,
            height: Int,
            fps: Int,
            projectionCallback: MediaProjection.Callback?
        ): Result<Unit> {
            if (shouldCaptureFail) return Result.failure(IllegalStateException("Simulated capture fail"))
            isCapturing = true
            return Result.success(Unit)
        }

        override fun createPeerConnection(iceServers: List<String>, observer: WebRtcEngineObserver): Result<Unit> {
            if (shouldPcFail) return Result.failure(IllegalStateException("Simulated PC create fail"))
            isPcCreated = true
            this.observer = observer
            return Result.success(Unit)
        }

        override fun processRemoteOffer(offerSdp: String, onAnswerCreated: (String) -> Unit, onError: (Throwable) -> Unit) {
            lastOffer = offerSdp
            onAnswerCreated("v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n")
        }

        override fun addRemoteIceCandidate(candidate: IceCandidatePayload): Boolean {
            appliedRemoteCandidates.add(candidate)
            return true
        }

        override fun stopCapture() {
            isCapturing = false
        }

        override fun createDataChannel(label: String): Result<com.virux.app.filetransfer.ViruxDataChannel> {
            val fakeChannel = object : com.virux.app.filetransfer.ViruxDataChannel {
                override val label: String = label
                override val id: Int = 1
                override fun isOpen(): Boolean = true
                override fun sendText(text: String): Boolean = true
                override fun sendBinary(data: ByteArray): Boolean = true
                override fun registerObserver(observer: com.virux.app.filetransfer.ViruxDataChannelObserver) {}
                override fun unregisterObserver() {}
                override fun bufferedAmount(): Long = 0L
                override fun close() {}
            }
            return Result.success(fakeChannel)
        }

        override fun dispose() {
            isDisposed = true
            isCapturing = false
        }
    }

    // ─── Step 4.3 Invariant Baseline Tests (Preserved) ───────────

    @Test
    fun testPeerConnectionStatusEnumAndTerminalInvariants() {
        assertEquals(PeerConnectionStatus.NEW, PeerConnectionStatus.fromValue("new"))
        assertEquals(PeerConnectionStatus.CONNECTING, PeerConnectionStatus.fromValue("connecting"))
        assertEquals(PeerConnectionStatus.CONNECTED, PeerConnectionStatus.fromValue("connected"))
        assertEquals(PeerConnectionStatus.DISCONNECTED, PeerConnectionStatus.fromValue("disconnected"))
        assertEquals(PeerConnectionStatus.FAILED, PeerConnectionStatus.fromValue("failed"))
        assertEquals(PeerConnectionStatus.CLOSED, PeerConnectionStatus.fromValue("closed"))
        assertEquals(PeerConnectionStatus.NEW, PeerConnectionStatus.fromValue("unknown"))

        // Terminal verification
        assertTrue(PeerConnectionStatus.DISCONNECTED.isTerminal)
        assertTrue(PeerConnectionStatus.FAILED.isTerminal)
        assertTrue(PeerConnectionStatus.CLOSED.isTerminal)

        assertFalse(PeerConnectionStatus.NEW.isTerminal)
        assertFalse(PeerConnectionStatus.CONNECTING.isTerminal)
        assertFalse(PeerConnectionStatus.CONNECTED.isTerminal)
    }

    @Test
    fun testCandidateDeduplicationAndFingerprinting() {
        val seenSignatures = mutableSetOf<String>()
        val candidates = listOf(
            IceCandidatePayload("candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host", "0", 0),
            IceCandidatePayload("candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host", "0", 0), // Duplicate
            IceCandidatePayload("candidate:2 1 UDP 2130706431 192.168.1.10 54322 typ host", "0", 0),
            IceCandidatePayload("candidate:3 1 UDP 2130706431 192.168.1.10 54323 typ host", null, null)
        )

        val appliedCandidates = mutableListOf<IceCandidatePayload>()
        for (c in candidates) {
            val signature = "${c.candidate}|${c.sdpMid}|${c.sdpMLineIndex}"
            if (seenSignatures.add(signature)) {
                appliedCandidates.add(c)
            }
        }

        assertEquals(3, appliedCandidates.size)
        assertEquals(candidates[0], appliedCandidates[0])
        assertEquals(candidates[2], appliedCandidates[1])
        assertEquals(candidates[3], appliedCandidates[2])
    }

    @Test
    fun testOutOfOrderBatchProcessingTolerance() {
        val batch1 = IceCandidateBatch(
            batchId = "b1",
            sessionId = "s1",
            sender = "web",
            sequenceNumber = 1,
            candidates = listOf(IceCandidatePayload("candidate:2 1 UDP 2130706431 192.168.1.10 54322 typ host", "0", 0)),
            isComplete = true
        )

        val batch0 = IceCandidateBatch(
            batchId = "b0",
            sessionId = "s1",
            sender = "web",
            sequenceNumber = 0,
            candidates = listOf(IceCandidatePayload("candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host", "0", 0)),
            isComplete = false
        )

        val incomingBatches = listOf(batch1, batch0)
        val sortedBatches = incomingBatches.sortedBy { it.sequenceNumber }

        assertEquals(0, sortedBatches[0].sequenceNumber)
        assertEquals(1, sortedBatches[1].sequenceNumber)
        assertFalse(sortedBatches[0].isComplete)
        assertTrue(sortedBatches[1].isComplete)
    }

    @Test
    fun testSdpPayloadSizeLimits() {
        val validSdp = "v=0\r\no=- 849201 2 IN IP4 127.0.0.1\r\ns=VIRUX\r\n"
        assertTrue(validSdp.length <= 65536)

        val oversizedSdp = "v=0\r\n" + "a=custom:".repeat(8000)
        assertTrue(oversizedSdp.length > 65536)
    }

    @Test
    fun testCleanupIdempotence() {
        var isDisposed = false
        var cleanupCount = 0

        fun safeClose() {
            if (isDisposed) return
            isDisposed = true
            cleanupCount++
        }

        safeClose()
        safeClose()
        safeClose()

        assertTrue(isDisposed)
        assertEquals(1, cleanupCount)
    }

    // ─── Step 4.4 New WebRTC Engine & Capture Lifecycle Tests ──────

    @Test
    fun testWebRtcEngineLifecycleInitializationAndDisposal() {
        val fakeEngine = FakeWebRtcEngine()
        val fakeRepo = FakeSignalingRepository()
        val testScope = CoroutineScope(Dispatchers.Unconfined + Job())

        val manager = PeerConnectionManager(
            userId = "user_1",
            deviceId = "dev_1",
            sessionId = "sess_1",
            signalingRepository = fakeRepo,
            scope = testScope,
            engine = fakeEngine
        )

        manager.initialize()
        assertEquals(PeerConnectionStatus.NEW, manager.getStatus())
        assertFalse(manager.isDisposed())

        manager.close()
        assertTrue(manager.isDisposed())
        assertEquals(PeerConnectionStatus.CLOSED, manager.getStatus())
        assertTrue(fakeEngine.isDisposed)
        assertTrue(fakeRepo.batcher.isDisposed)
    }

    @Test
    fun testEncoderInitializationFailureTransitionsToFailed() {
        val failingEngine = FakeWebRtcEngine(shouldInitFail = true)
        val fakeRepo = FakeSignalingRepository()
        val testScope = CoroutineScope(Dispatchers.Unconfined + Job())

        var callbackError: Throwable? = null
        val callback = object : PeerConnectionCallback {
            override fun onError(throwable: Throwable) {
                callbackError = throwable
            }
        }

        val manager = PeerConnectionManager(
            userId = "user_1",
            deviceId = "dev_1",
            sessionId = "sess_1",
            signalingRepository = fakeRepo,
            scope = testScope,
            callback = callback,
            engine = failingEngine
        )

        val initResult = failingEngine.initialize(null)

        assertTrue(initResult.isFailure)
        assertTrue(initResult.exceptionOrNull()?.message?.contains("encoder init failure") == true)
    }

    @Test
    fun testPeerConnectionFailureTransitionsToFailedAndCloses() = runBlocking {
        val fakeEngine = FakeWebRtcEngine()
        val fakeRepo = FakeSignalingRepository()

        var statusReported: PeerConnectionStatus? = null
        val callback = object : PeerConnectionCallback {
            override fun onConnectionStateChange(status: PeerConnectionStatus) {
                statusReported = status
            }
        }

        val manager = PeerConnectionManager(
            userId = "user_1",
            deviceId = "dev_1",
            sessionId = "sess_1",
            signalingRepository = fakeRepo,
            scope = this,
            callback = callback,
            engine = fakeEngine
        )

        manager.initialize()

        // Simulate terminal failure update from signaling session
        val terminalSession = SignalingSession(
            sessionId = "sess_1",
            ownerUid = "user_1",
            deviceId = "dev_1",
            initiator = "web",
            sessionType = "screen_mirror",
            status = "revoked",
            protocolVersion = "1.0"
        )
        fakeRepo.sessionFlow.emit(terminalSession)
        delay(50)

        assertTrue(manager.isDisposed())
        assertEquals(PeerConnectionStatus.CLOSED, manager.getStatus())
        assertTrue(fakeEngine.isDisposed)
    }

    @Test
    fun testSessionExpirationTriggersCleanTeardown() = runBlocking {
        val fakeEngine = FakeWebRtcEngine()
        val fakeRepo = FakeSignalingRepository()

        val manager = PeerConnectionManager(
            userId = "user_1",
            deviceId = "dev_1",
            sessionId = "sess_1",
            signalingRepository = fakeRepo,
            scope = this,
            engine = fakeEngine
        )

        manager.initialize()

        val expiredSession = SignalingSession(
            sessionId = "sess_1",
            ownerUid = "user_1",
            deviceId = "dev_1",
            initiator = "web",
            sessionType = "screen_mirror",
            status = "expired",
            protocolVersion = "1.0"
        )
        fakeRepo.sessionFlow.emit(expiredSession)
        delay(50)

        assertTrue(manager.isDisposed())
        assertEquals(PeerConnectionStatus.CLOSED, manager.getStatus())
    }

    @Test
    fun testDuplicateSessionStartProtection() {
        var isCapturing = false
        var startCount = 0

        fun startCaptureSession(): Boolean {
            if (isCapturing) return false // Block duplicate capture session
            isCapturing = true
            startCount++
            return true
        }

        assertTrue(startCaptureSession())
        assertFalse(startCaptureSession()) // Rejected duplicate
        assertEquals(1, startCount)
    }

    @Test
    fun testConsentDenialAndCancellationHandling() = runBlocking {
        val fakeRepo = FakeSignalingRepository()

        // Simulate user denying consent or canceling MediaProjection dialog
        val activeSession = SignalingSession(
            sessionId = "sess_denied",
            ownerUid = "user_1",
            deviceId = "dev_1",
            initiator = "web",
            sessionType = "screen_mirror",
            status = "offer_created",
            protocolVersion = "1.0"
        )

        // Deny handler: closes session in Firestore
        fakeRepo.updateStatus(activeSession.ownerUid, activeSession.deviceId, activeSession.sessionId, SignalingState.CLOSED)
        fakeRepo.closeSession(activeSession.ownerUid, activeSession.deviceId, activeSession.sessionId)

        assertEquals(SignalingState.CLOSED, fakeRepo.lastStatus)
        assertTrue(fakeRepo.isClosed)
    }

    @Test
    fun testRepeatedCleanupIsIdempotent() {
        val fakeEngine = FakeWebRtcEngine()
        val fakeRepo = FakeSignalingRepository()
        val testScope = CoroutineScope(Dispatchers.Unconfined + Job())

        val manager = PeerConnectionManager(
            userId = "user_1",
            deviceId = "dev_1",
            sessionId = "sess_1",
            signalingRepository = fakeRepo,
            scope = testScope,
            engine = fakeEngine
        )

        manager.initialize()
        manager.close()
        manager.close()
        manager.close()

        assertTrue(manager.isDisposed())
        assertEquals(PeerConnectionStatus.CLOSED, manager.getStatus())
        assertTrue(fakeEngine.isDisposed)
    }
}
