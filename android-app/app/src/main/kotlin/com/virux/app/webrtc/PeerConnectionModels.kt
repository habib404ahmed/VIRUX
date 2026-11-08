package com.virux.app.webrtc

enum class PeerConnectionStatus(val value: String) {
    NEW("new"),
    CONNECTING("connecting"),
    CONNECTED("connected"),
    DISCONNECTED("disconnected"),
    FAILED("failed"),
    CLOSED("closed");

    val isTerminal: Boolean
        get() = this in listOf(DISCONNECTED, FAILED, CLOSED)

    companion object {
        fun fromValue(value: String): PeerConnectionStatus {
            return entries.firstOrNull { it.value.equals(value, ignoreCase = true) } ?: NEW
        }
    }
}

enum class IceGatheringState {
    NEW,
    GATHERING,
    COMPLETE
}

interface PeerConnectionCallback {
    fun onConnectionStateChange(status: PeerConnectionStatus) {}
    fun onIceGatheringStateChange(state: IceGatheringState) {}
    fun onError(error: Throwable) {}
}

