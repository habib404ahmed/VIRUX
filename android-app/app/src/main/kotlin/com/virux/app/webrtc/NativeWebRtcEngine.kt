package com.virux.app.webrtc

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.util.Log
import com.virux.app.data.model.IceCandidatePayload
import org.webrtc.*
import java.nio.ByteBuffer

/**
 * Concrete WebRTC implementation leveraging the native Stream WebRTC runtime (M120+).
 * Manages EGL, hardware-accelerated MediaCodec video encoding, ScreenCapturerAndroid,
 * and RTCPeerConnection negotiation.
 */
class NativeWebRtcEngine : WebRtcEngine {

    companion object {
        private const val TAG = "VIRUX_NativeWebRtc"
        private var isFactoryInitialized = false
        private val initLock = Any()

        const val DEFAULT_STUN_SERVER = "stun:stun.l.google.com:19302"
        const val VIDEO_TRACK_ID = "VIRUX_SCREEN_VIDEO_TRACK"
        const val MEDIA_STREAM_ID = "VIRUX_STREAM_0"
    }

    private var eglBase: EglBase? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var screenCapturer: ScreenCapturerAndroid? = null
    private var videoSource: VideoSource? = null
    private var videoTrack: VideoTrack? = null
    private var peerConnection: PeerConnection? = null
    private var engineObserver: WebRtcEngineObserver? = null

    private var isDisposed = false
    private var isCapturing = false

    override fun initialize(context: Context?): Result<Unit> = runCatching {
        if (isDisposed) throw IllegalStateException("NativeWebRtcEngine has already been disposed")
        val ctx = context ?: throw IllegalArgumentException("Context cannot be null for NativeWebRtcEngine")

        synchronized(initLock) {
            if (!isFactoryInitialized) {
                Log.i(TAG, "Initializing native PeerConnectionFactory...")
                val options = PeerConnectionFactory.InitializationOptions.builder(ctx.applicationContext)
                    .setEnableInternalTracer(false)
                    .createInitializationOptions()
                PeerConnectionFactory.initialize(options)
                isFactoryInitialized = true
            }
        }

        val egl = EglBase.create()
        this.eglBase = egl

        // Hardware-accelerated video encoder factory with VP8/H.264 support
        val encoderFactory = DefaultVideoEncoderFactory(
            egl.eglBaseContext,
            true, // enableIntelVp8
            true  // enableH264HighProfile
        )

        // Hardware-accelerated video decoder factory
        val decoderFactory = DefaultVideoDecoderFactory(egl.eglBaseContext)

        val factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        this.peerConnectionFactory = factory
        Log.i(TAG, "NativeWebRtcEngine successfully initialized with EGL context & hardware encoder factory")
    }

    override fun startScreenCapture(
        context: Context,
        resultData: Intent,
        width: Int,
        height: Int,
        fps: Int,
        projectionCallback: MediaProjection.Callback?
    ): Result<Unit> = runCatching {
        if (isDisposed) throw IllegalStateException("NativeWebRtcEngine disposed")
        val factory = peerConnectionFactory ?: throw IllegalStateException("PeerConnectionFactory not initialized")
        val egl = eglBase ?: throw IllegalStateException("EGL context not initialized")

        Log.i(TAG, "Starting screen capture pipeline: ${width}x${height} @ ${fps}fps")

        // 1. Create VideoSource configured for screencast content
        val source = factory.createVideoSource(true) // isScreencast = true
        this.videoSource = source

        // 2. Create SurfaceTextureHelper dedicated to screen capture GL frames
        val textureHelper = SurfaceTextureHelper.create("ViruxScreenCaptureGL", egl.eglBaseContext)
        this.surfaceTextureHelper = textureHelper

        // 3. Create ScreenCapturerAndroid with the OS user consent token
        val capturer = ScreenCapturerAndroid(resultData, object : MediaProjection.Callback() {
            override fun onStop() {
                super.onStop()
                Log.w(TAG, "MediaProjection.Callback: System or user revoked screen capture")
                isCapturing = false
                engineObserver?.onCapturerStopped()
                projectionCallback?.onStop()
            }
        })
        this.screenCapturer = capturer

        // 4. Initialize and start frame capture
        capturer.initialize(textureHelper, context.applicationContext, source.capturerObserver)
        capturer.startCapture(width, height, fps)
        isCapturing = true

        // 5. Create real VideoTrack attached to the VideoSource
        val track = factory.createVideoTrack(VIDEO_TRACK_ID, source)
        track.setEnabled(true)
        this.videoTrack = track

        // 6. If PeerConnection already exists, attach the video track
        peerConnection?.let { pc ->
            pc.addTrack(track, listOf(MEDIA_STREAM_ID))
            Log.i(TAG, "VideoTrack $VIDEO_TRACK_ID attached to active PeerConnection")
        }

        engineObserver?.onCapturerStarted(true)
        Log.i(TAG, "Screen capture pipeline operational")
    }

    override fun createPeerConnection(
        iceServers: List<String>,
        observer: WebRtcEngineObserver
    ): Result<Unit> = runCatching {
        if (isDisposed) throw IllegalStateException("NativeWebRtcEngine disposed")
        val factory = peerConnectionFactory ?: throw IllegalStateException("PeerConnectionFactory not initialized")

        this.engineObserver = observer

        val servers = iceServers.map { uri ->
            PeerConnection.IceServer.builder(uri).createIceServer()
        }

        val rtcConfig = PeerConnection.RTCConfiguration(servers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        val pcObserver = object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                Log.d(TAG, "PeerConnection onSignalingChange: $state")
            }

            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                Log.d(TAG, "PeerConnection onIceConnectionChange: $state")
                when (state) {
                    PeerConnection.IceConnectionState.CONNECTED -> observer.onConnectionStateChange(PeerConnectionStatus.CONNECTED)
                    PeerConnection.IceConnectionState.DISCONNECTED -> observer.onConnectionStateChange(PeerConnectionStatus.DISCONNECTED)
                    PeerConnection.IceConnectionState.FAILED -> observer.onConnectionStateChange(PeerConnectionStatus.FAILED)
                    PeerConnection.IceConnectionState.CLOSED -> observer.onConnectionStateChange(PeerConnectionStatus.CLOSED)
                    else -> Unit
                }
            }

            override fun onIceConnectionReceivingChange(receiving: Boolean) {}

            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                Log.d(TAG, "PeerConnection onIceGatheringChange: $state")
                if (state == PeerConnection.IceGatheringState.COMPLETE) {
                    observer.onIceGatheringComplete()
                }
            }

            override fun onIceCandidate(candidate: IceCandidate?) {
                if (candidate != null) {
                    Log.d(TAG, "Native ICE candidate gathered: ${candidate.sdp.take(40)}")
                    val payload = IceCandidatePayload(
                        candidate = candidate.sdp,
                        sdpMid = candidate.sdpMid,
                        sdpMLineIndex = candidate.sdpMLineIndex
                    )
                    observer.onIceCandidateGathered(payload)
                }
            }

            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}

            override fun onAddStream(stream: MediaStream?) {}

            override fun onRemoveStream(stream: MediaStream?) {}

            override fun onDataChannel(channel: DataChannel?) {
                if (channel != null) {
                    Log.i(TAG, "Native DataChannel received from remote peer: ${channel.label()}")
                    observer.onDataChannelReceived(com.virux.app.filetransfer.NativeViruxDataChannel(channel))
                }
            }

            override fun onRenegotiationNeeded() {
                Log.d(TAG, "PeerConnection onRenegotiationNeeded")
            }

            override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
        }

        val pc = factory.createPeerConnection(rtcConfig, pcObserver)
            ?: throw IllegalStateException("Failed to create native PeerConnection")
        this.peerConnection = pc

        // Attach video track if capture pipeline was initialized prior to peer connection
        videoTrack?.let { track ->
            pc.addTrack(track, listOf(MEDIA_STREAM_ID))
            Log.i(TAG, "Attached pre-existing VideoTrack to new PeerConnection")
        }

        Log.i(TAG, "PeerConnection instantiated with ${servers.size} ICE servers")
    }

    override fun createDataChannel(label: String): Result<com.virux.app.filetransfer.ViruxDataChannel> = runCatching {
        val pc = peerConnection ?: throw IllegalStateException("PeerConnection is not initialized")
        val init = DataChannel.Init().apply {
            ordered = true
        }
        val channel = pc.createDataChannel(label, init)
            ?: throw IllegalStateException("Native createDataChannel returned null")
        Log.i(TAG, "Created native DataChannel: $label")
        com.virux.app.filetransfer.NativeViruxDataChannel(channel)
    }

    override fun processRemoteOffer(
        offerSdp: String,
        onAnswerCreated: (String) -> Unit,
        onError: (Throwable) -> Unit
    ) {
        val pc = peerConnection
        if (pc == null || isDisposed) {
            onError(IllegalStateException("PeerConnection is not available"))
            return
        }

        val remoteSessionDesc = SessionDescription(SessionDescription.Type.OFFER, offerSdp)
        pc.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                Log.i(TAG, "Remote SDP offer successfully set on native PeerConnection")
                val constraints = MediaConstraints().apply {
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
                }

                pc.createAnswer(object : SdpObserver {
                    override fun onCreateSuccess(answerDesc: SessionDescription?) {
                        if (answerDesc == null) {
                            onError(Exception("Native createAnswer returned null description"))
                            return
                        }
                        Log.i(TAG, "Native SDP answer generated. Setting local description...")
                        pc.setLocalDescription(object : SdpObserver {
                            override fun onSetSuccess() {
                                Log.i(TAG, "Local SDP answer set. Returning negotiated answer description.")
                                onAnswerCreated(answerDesc.description)
                            }

                            override fun onSetFailure(err: String?) {
                                onError(Exception("Failed to set local description: $err"))
                            }

                            override fun onCreateSuccess(p0: SessionDescription?) {}
                            override fun onCreateFailure(p0: String?) {}
                        }, answerDesc)
                    }

                    override fun onCreateFailure(err: String?) {
                        onError(Exception("Failed to create SDP answer: $err"))
                    }

                    override fun onSetSuccess() {}
                    override fun onSetFailure(p0: String?) {}
                }, constraints)
            }

            override fun onSetFailure(err: String?) {
                onError(Exception("Failed to set remote description: $err"))
            }

            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onCreateFailure(p0: String?) {}
        }, remoteSessionDesc)
    }

    override fun addRemoteIceCandidate(candidate: IceCandidatePayload): Boolean {
        val pc = peerConnection ?: return false
        if (isDisposed) return false

        val rtcCandidate = IceCandidate(
            candidate.sdpMid,
            candidate.sdpMLineIndex ?: 0,
            candidate.candidate
        )
        return pc.addIceCandidate(rtcCandidate)
    }

    override fun stopCapture() {
        if (!isCapturing) return
        isCapturing = false
        Log.i(TAG, "Stopping ScreenCapturerAndroid...")
        try {
            screenCapturer?.stopCapture()
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping screen capturer: ${e.message}")
        }
        engineObserver?.onCapturerStopped()
    }

    override fun dispose() {
        if (isDisposed) return
        isDisposed = true
        Log.i(TAG, "Disposing NativeWebRtcEngine resources...")

        stopCapture()

        try {
            screenCapturer?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Error disposing screenCapturer: ${e.message}")
        }
        screenCapturer = null

        try {
            videoTrack?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Error disposing videoTrack: ${e.message}")
        }
        videoTrack = null

        try {
            videoSource?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Error disposing videoSource: ${e.message}")
        }
        videoSource = null

        try {
            surfaceTextureHelper?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Error disposing surfaceTextureHelper: ${e.message}")
        }
        surfaceTextureHelper = null

        try {
            peerConnection?.close()
            peerConnection?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing peerConnection: ${e.message}")
        }
        peerConnection = null

        try {
            peerConnectionFactory?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Error disposing peerConnectionFactory: ${e.message}")
        }
        peerConnectionFactory = null

        try {
            eglBase?.release()
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing EglBase: ${e.message}")
        }
        eglBase = null

        Log.i(TAG, "NativeWebRtcEngine resources cleanly disposed")
    }
}
