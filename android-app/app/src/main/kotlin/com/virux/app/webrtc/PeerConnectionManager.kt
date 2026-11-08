package com.virux.app.webrtc

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.util.Log
import com.virux.app.data.model.IceCandidateBatch
import com.virux.app.data.model.IceCandidatePayload
import com.virux.app.data.model.SignalingSession
import com.virux.app.data.model.SignalingState
import com.virux.app.data.repository.AndroidCandidateBatcher
import com.virux.app.data.repository.SignalingRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Android WebRTC PeerConnection coordinator bridging Cloud Firestore signaling
 * with the native WebRTC runtime and ScreenCapturerAndroid pipeline.
 */
class PeerConnectionManager(
    private val userId: String,
    private val deviceId: String,
    private val sessionId: String,
    private val signalingRepository: SignalingRepository,
    private val scope: CoroutineScope,
    private val callback: PeerConnectionCallback? = null,
    private val engine: WebRtcEngine = NativeWebRtcEngine()
) {
    companion object {
        private const val TAG = "VIRUX_PeerConnMgr"
    }

    private val mutex = Mutex()
    private var batcher: AndroidCandidateBatcher? = null
    private var sessionListenerJob: Job? = null
    private var candidateListenerJob: Job? = null

    private val appliedRemoteCandidateSignatures = mutableSetOf<String>()
    private var connectionStatus: PeerConnectionStatus = PeerConnectionStatus.NEW
    private var isDisposed = false

    private var dataChannelListener: ((com.virux.app.filetransfer.ViruxDataChannel) -> Unit)? = null

    fun getStatus(): PeerConnectionStatus = connectionStatus

    fun isDisposed(): Boolean = isDisposed

    fun setDataChannelListener(listener: (com.virux.app.filetransfer.ViruxDataChannel) -> Unit) {
        this.dataChannelListener = listener
    }

    fun createDataChannel(label: String = com.virux.app.filetransfer.FileTransferConstants.DATA_CHANNEL_LABEL): Result<com.virux.app.filetransfer.ViruxDataChannel> {
        return engine.createDataChannel(label)
    }

    /**
     * Initializes the peer connection session, native capture pipeline (if requested),
     * and hooks into Firestore signaling.
     */
    fun initialize(
        context: Context? = null,
        resultData: Intent? = null,
        width: Int = 1280,
        height: Int = 720,
        fps: Int = 30,
        projectionCallback: MediaProjection.Callback? = null,
        dataChannelCallback: ((com.virux.app.filetransfer.ViruxDataChannel) -> Unit)? = null
    ) {
        if (isDisposed) return
        dataChannelCallback?.let { this.dataChannelListener = it }

        batcher = signalingRepository.createCandidateBatcher(
            userId = userId,
            deviceId = deviceId,
            sessionId = sessionId,
            sender = "android",
            debounceMs = 250L,
            maxBatchSize = 25,
            scope = scope
        )

        updateStatus(PeerConnectionStatus.NEW)

        // Initialize WebRTC engine if Android context provided
        if (context != null) {
            val initRes = engine.initialize(context)
            if (initRes.isFailure) {
                Log.e(TAG, "Failed to initialize WebRTC engine: ${initRes.exceptionOrNull()?.message}")
                handleError(initRes.exceptionOrNull() ?: Exception("WebRTC initialization failed"))
                return
            }

            val observer = object : WebRtcEngineObserver {
                override fun onIceCandidateGathered(candidate: IceCandidatePayload) {
                    onLocalIceCandidateGathered(candidate)
                }

                override fun onIceGatheringComplete() {
                    scope.launch { onLocalIceGatheringComplete() }
                }

                override fun onConnectionStateChange(status: PeerConnectionStatus) {
                    scope.launch {
                        if (status == PeerConnectionStatus.CONNECTED) {
                            onPeerConnected()
                        } else {
                            updateStatus(status)
                        }
                    }
                }

                override fun onCapturerStarted(success: Boolean) {
                    Log.i(TAG, "Screen capturer started: success=$success")
                }

                override fun onCapturerStopped() {
                    Log.w(TAG, "Screen capturer stopped")
                    close()
                }

                override fun onDataChannelReceived(channel: com.virux.app.filetransfer.ViruxDataChannel) {
                    Log.i(TAG, "ViruxDataChannel received: ${channel.label}")
                    dataChannelListener?.invoke(channel)
                }

                override fun onError(throwable: Throwable) {
                    handleError(throwable)
                }
            }

            val pcRes = engine.createPeerConnection(listOf(NativeWebRtcEngine.DEFAULT_STUN_SERVER), observer)
            if (pcRes.isFailure) {
                Log.e(TAG, "Failed to create WebRTC PeerConnection: ${pcRes.exceptionOrNull()?.message}")
                handleError(pcRes.exceptionOrNull() ?: Exception("PeerConnection creation failed"))
                return
            }

            // Start screen capture only if MediaProjection intent token is provided
            if (resultData != null) {
                val capRes = engine.startScreenCapture(context, resultData, width, height, fps, projectionCallback)
                if (capRes.isFailure) {
                    Log.e(TAG, "Failed to start ScreenCapturer: ${capRes.exceptionOrNull()?.message}")
                    handleError(capRes.exceptionOrNull() ?: Exception("Screen capture start failed"))
                    return
                }
            }
        }

        // Observe session document changes (revocation, offer, expiration)
        sessionListenerJob = scope.launch {
            try {
                signalingRepository.observeSession(userId, deviceId, sessionId).collectLatest { session ->
                    handleSessionUpdate(session)
                }
            } catch (e: CancellationException) {
                // Cooperative coroutine cancellation during teardown
            } catch (e: Exception) {
                Log.e(TAG, "Error in signaling session observation: ${e.message}")
                handleError(e)
            }
        }

        // Observe remote candidate batches published by the Web client
        candidateListenerJob = scope.launch {
            try {
                signalingRepository.observeRemoteCandidateBatches(userId, deviceId, sessionId, "web")
                    .collect { batch ->
                        applyRemoteCandidateBatch(batch)
                    }
            } catch (e: CancellationException) {
                // Cooperative coroutine cancellation during teardown
            } catch (e: Exception) {
                Log.w(TAG, "Error observing remote candidate batches: ${e.message}")
            }
        }
    }

    private suspend fun handleSessionUpdate(session: SignalingSession) {
        if (isDisposed) return

        // 1. Check expiration or revocation
        if (session.isTerminal) {
            Log.i(TAG, "Session reached terminal state: ${session.signalingState}. Tearing down.")
            updateStatus(PeerConnectionStatus.CLOSED)
            close()
            return
        }

        // 2. Handle incoming SDP offer from Web client
        if (session.signalingState == SignalingState.OFFER_CREATED && session.offer != null) {
            processSdpOffer(session.offer.sdp)
        }
    }

    /**
     * Processes remote SDP offer, forms local SDP answer, and publishes to Firestore.
     */
    suspend fun processSdpOffer(offerSdp: String) {
        mutex.withLock {
            if (isDisposed) return

            if (offerSdp.length > 65536) {
                val err = IllegalArgumentException("SDP offer exceeds 64KB limit")
                handleError(err)
                return
            }

            updateStatus(PeerConnectionStatus.CONNECTING)

            // Leverage native WebRTC engine to process offer and generate real SDP answer
            engine.processRemoteOffer(
                offerSdp = offerSdp,
                onAnswerCreated = { answerSdp ->
                    scope.launch {
                        val result = signalingRepository.publishAnswer(userId, deviceId, sessionId, answerSdp)
                        if (result.isSuccess) {
                            Log.i(TAG, "Successfully published SDP answer for session $sessionId")
                        } else {
                            val err = result.exceptionOrNull() ?: Exception("Failed to publish SDP answer")
                            handleError(err)
                        }
                    }
                },
                onError = { err ->
                    Log.e(TAG, "Failed to negotiate SDP offer/answer: ${err.message}")
                    handleError(err)
                }
            )
        }
    }

    /**
     * Applies remote candidate batch with deduplication and safe out-of-order tolerance.
     */
    suspend fun applyRemoteCandidateBatch(batch: IceCandidateBatch) {
        mutex.withLock {
            if (isDisposed) return

            for (item in batch.candidates) {
                val signature = "${item.candidate}|${item.sdpMid}|${item.sdpMLineIndex}"
                if (appliedRemoteCandidateSignatures.contains(signature)) {
                    continue
                }
                appliedRemoteCandidateSignatures.add(signature)
                engine.addRemoteIceCandidate(item)
                Log.d(TAG, "Applied remote ICE candidate: ${item.candidate.take(30)}...")
            }

            if (batch.isComplete) {
                Log.i(TAG, "Remote peer candidate gathering marked complete (seq=${batch.sequenceNumber})")
            }
        }
    }

    /**
     * Emits a local ICE candidate through the debounced candidate batcher.
     */
    fun onLocalIceCandidateGathered(candidate: IceCandidatePayload) {
        if (isDisposed) return
        batcher?.queueCandidate(candidate)
    }

    /**
     * Notifies candidate batcher that local ICE gathering has completed.
     */
    suspend fun onLocalIceGatheringComplete() {
        if (isDisposed) return
        callback?.onIceGatheringStateChange(IceGatheringState.COMPLETE)
        batcher?.completeGathering()
    }

    /**
     * Transitions connection status to CONNECTED once P2P transport is ready.
     */
    suspend fun onPeerConnected() {
        mutex.withLock {
            if (isDisposed) return
            updateStatus(PeerConnectionStatus.CONNECTED)
            signalingRepository.updateStatus(userId, deviceId, sessionId, SignalingState.CONNECTED)
        }
    }

    private fun updateStatus(status: PeerConnectionStatus) {
        connectionStatus = status
        callback?.onConnectionStateChange(status)
    }

    private fun handleError(throwable: Throwable) {
        updateStatus(PeerConnectionStatus.FAILED)
        callback?.onError(throwable)
        close()
    }

    /**
     * Idempotently disposes listeners, candidate batcher, engine, and active connections.
     */
    fun close() {
        if (isDisposed) return
        isDisposed = true

        sessionListenerJob?.cancel()
        sessionListenerJob = null

        candidateListenerJob?.cancel()
        candidateListenerJob = null

        batcher?.dispose()
        batcher = null

        engine.dispose()

        appliedRemoteCandidateSignatures.clear()
        if (connectionStatus != PeerConnectionStatus.FAILED) {
            updateStatus(PeerConnectionStatus.CLOSED)
        }
    }
}
