package com.virux.app.ui.screens.home

import android.app.Application
import android.net.Uri
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.virux.app.data.model.SignalingSession
import com.virux.app.data.model.SignalingState
import com.virux.app.data.model.ViruxDevice
import com.virux.app.data.provider.DeviceIdProviderImpl
import com.virux.app.data.provider.DeviceTelemetry
import com.virux.app.data.provider.DeviceTelemetryProviderImpl
import com.virux.app.data.provider.KeyStoreProviderImpl
import com.virux.app.data.repository.DeviceRepository
import com.virux.app.data.repository.DeviceRepositoryImpl
import com.virux.app.data.repository.SignalingRepository
import com.virux.app.data.repository.SignalingRepositoryImpl
import com.virux.app.filetransfer.FileMetadata
import com.virux.app.filetransfer.FileTransferItem
import com.virux.app.filetransfer.ViruxFileTransferManager
import com.virux.app.service.ViruxDeviceService
import com.virux.app.webrtc.PeerConnectionCallback
import com.virux.app.webrtc.PeerConnectionManager
import com.virux.app.webrtc.PeerConnectionStatus
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModel @JvmOverloads constructor(
    application: Application,
    private val signalingRepository: SignalingRepository = SignalingRepositoryImpl()
) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "VIRUX_HomeVM"

        fun provideFactory(application: Application): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    if (modelClass.isAssignableFrom(HomeViewModel::class.java)) {
                        return HomeViewModel(application) as T
                    }
                    throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
                }
            }
    }

    private val deviceIdProvider = DeviceIdProviderImpl(application)
    private val keyStoreProvider = KeyStoreProviderImpl(application)
    private val telemetryProvider = DeviceTelemetryProviderImpl(application)

    val deviceRepository: DeviceRepository = DeviceRepositoryImpl(
        context = application,
        deviceIdProvider = deviceIdProvider,
        keyStoreProvider = keyStoreProvider,
        deviceTelemetryProvider = telemetryProvider
    )

    val pairedDeviceFlow: StateFlow<ViruxDevice?> = deviceRepository.getPairedDeviceFlow()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null
        )

    private val dismissedSessionIds = MutableStateFlow<Set<String>>(emptySet())

    val incomingMirrorSession: StateFlow<SignalingSession?> = pairedDeviceFlow
        .flatMapLatest { device ->
            if (device != null && device.ownerUid.isNotEmpty()) {
                signalingRepository.observeIncomingSessions(device.ownerUid, device.deviceId)
            } else {
                flowOf(emptyList())
            }
        }
        .combine(dismissedSessionIds) { sessions, dismissed ->
            sessions.firstOrNull { session ->
                session.sessionType == "screen_mirror" &&
                session.signalingState == SignalingState.OFFER_CREATED &&
                !session.isTerminal &&
                !dismissed.contains(session.sessionId)
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null
        )

    val incomingFileTransferSession: StateFlow<SignalingSession?> = pairedDeviceFlow
        .flatMapLatest { device ->
            if (device != null && device.ownerUid.isNotEmpty()) {
                signalingRepository.observeIncomingSessions(device.ownerUid, device.deviceId)
            } else {
                flowOf(emptyList())
            }
        }
        .combine(dismissedSessionIds) { sessions, dismissed ->
            sessions.firstOrNull { session ->
                session.sessionType == "file_transfer" &&
                session.signalingState == SignalingState.OFFER_CREATED &&
                !session.isTerminal &&
                !dismissed.contains(session.sessionId)
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null
        )

    val telemetry: DeviceTelemetry = telemetryProvider.getTelemetry()

    // ─── P2P File Transfer Management ─────────────────────────
    private val fileTransferManager = ViruxFileTransferManager(application, viewModelScope)
    val fileTransferItem: StateFlow<FileTransferItem?> = fileTransferManager.transferItem
    val incomingFileRequest: StateFlow<FileMetadata?> = fileTransferManager.incomingRequest

    private var fileTransferPeerConnection: PeerConnectionManager? = null
    private val _isFileTransferChannelConnected = MutableStateFlow(false)
    val isFileTransferChannelConnected: StateFlow<Boolean> = _isFileTransferChannelConnected.asStateFlow()

    fun isPaired(): Boolean = deviceRepository.isPaired()

    fun triggerSync() {
        viewModelScope.launch {
            deviceRepository.updateHeartbeat()
        }
    }

    fun unpair() {
        viewModelScope.launch {
            deviceRepository.unpair()
            ViruxDeviceService.stopService(getApplication())
        }
    }

    fun rejectMirrorSession(session: SignalingSession) {
        viewModelScope.launch {
            dismissedSessionIds.update { it + session.sessionId }
            signalingRepository.updateStatus(session.ownerUid, session.deviceId, session.sessionId, SignalingState.CLOSED)
            signalingRepository.closeSession(session.ownerUid, session.deviceId, session.sessionId)
        }
    }

    fun dismissIncomingSession(sessionId: String) {
        dismissedSessionIds.update { it + sessionId }
    }

    // ─── File Transfer Session Operations ──────────────────────
    fun acceptFileTransferSession(session: SignalingSession) {
        viewModelScope.launch {
            try {
                fileTransferPeerConnection?.close()
                dismissedSessionIds.update { it + session.sessionId }

                val manager = PeerConnectionManager(
                    userId = session.ownerUid,
                    deviceId = session.deviceId,
                    sessionId = session.sessionId,
                    signalingRepository = signalingRepository,
                    scope = viewModelScope,
                    callback = object : PeerConnectionCallback {
                        override fun onConnectionStateChange(status: PeerConnectionStatus) {
                            Log.i(TAG, "File transfer WebRTC status: $status")
                            if (status == PeerConnectionStatus.CONNECTED) {
                                _isFileTransferChannelConnected.value = true
                            } else if (status.isTerminal) {
                                _isFileTransferChannelConnected.value = false
                                fileTransferManager.detachDataChannel()
                            }
                        }

                        override fun onError(throwable: Throwable) {
                            Log.e(TAG, "File transfer PeerConnection error: ${throwable.message}")
                            _isFileTransferChannelConnected.value = false
                            fileTransferManager.detachDataChannel()
                        }
                    }
                )

                fileTransferPeerConnection = manager
                manager.initialize(
                    context = getApplication(),
                    resultData = null,
                    dataChannelCallback = { channel ->
                        Log.i(TAG, "Incoming DataChannel received on Android: ${channel.label}")
                        fileTransferManager.attachDataChannel(channel)
                        _isFileTransferChannelConnected.value = true
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error accepting file transfer session: ${e.message}")
            }
        }
    }

    fun rejectFileTransferSession(session: SignalingSession) {
        viewModelScope.launch {
            dismissedSessionIds.update { it + session.sessionId }
            signalingRepository.updateStatus(session.ownerUid, session.deviceId, session.sessionId, SignalingState.CLOSED)
            signalingRepository.closeSession(session.ownerUid, session.deviceId, session.sessionId)
        }
    }

    fun sendFile(uri: Uri): Result<Unit> {
        return fileTransferManager.startFileSend(uri, direction = "android_to_web")
    }

    fun acceptIncomingFile(transferId: String): Result<Unit> {
        return fileTransferManager.acceptIncomingTransfer(transferId)
    }

    fun rejectIncomingFile(transferId: String, reason: String = "User declined"): Result<Unit> {
        return fileTransferManager.rejectIncomingTransfer(transferId, reason)
    }

    fun cancelActiveTransfer(reason: String = "User cancelled") {
        fileTransferManager.cancelActiveTransfer(reason)
    }

    override fun onCleared() {
        super.onCleared()
        fileTransferPeerConnection?.close()
        fileTransferManager.detachDataChannel()
    }
}
