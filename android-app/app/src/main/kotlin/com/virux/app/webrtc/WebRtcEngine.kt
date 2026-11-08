package com.virux.app.webrtc

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import com.virux.app.data.model.IceCandidatePayload

/**
 * Observer callbacks for WebRTC PeerConnection and VideoCapturer events.
 */
interface WebRtcEngineObserver {
    fun onIceCandidateGathered(candidate: IceCandidatePayload)
    fun onIceGatheringComplete()
    fun onConnectionStateChange(status: PeerConnectionStatus)
    fun onCapturerStarted(success: Boolean)
    fun onCapturerStopped()
    fun onDataChannelReceived(channel: com.virux.app.filetransfer.ViruxDataChannel) {}
    fun onError(throwable: Throwable)
}

/**
 * Interface abstracting the native WebRTC runtime operations:
 * - PeerConnectionFactory initialization
 * - EGL context & hardware video encoder/decoder factories
 * - ScreenCapturerAndroid pipeline & SurfaceTextureHelper
 * - VideoSource & VideoTrack creation
 * - PeerConnection lifecycle and SDP offer/answer negotiation
 * - DataChannel creation & lifecycle
 */
interface WebRtcEngine {
    fun initialize(context: Context? = null): Result<Unit>

    fun startScreenCapture(
        context: Context,
        resultData: Intent,
        width: Int = 1280,
        height: Int = 720,
        fps: Int = 30,
        projectionCallback: MediaProjection.Callback? = null
    ): Result<Unit>

    fun createPeerConnection(
        iceServers: List<String>,
        observer: WebRtcEngineObserver
    ): Result<Unit>

    fun createDataChannel(label: String): Result<com.virux.app.filetransfer.ViruxDataChannel>

    fun processRemoteOffer(
        offerSdp: String,
        onAnswerCreated: (String) -> Unit,
        onError: (Throwable) -> Unit
    )

    fun addRemoteIceCandidate(candidate: IceCandidatePayload): Boolean

    fun stopCapture()

    fun dispose()
}

