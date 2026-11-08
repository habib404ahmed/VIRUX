package com.virux.app.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

enum class SignalingState(val value: String) {
    CREATED("created"),
    OFFER_CREATED("offer_created"),
    ANSWER_CREATED("answer_created"),
    CONNECTING("connecting"),
    CONNECTED("connected"),
    CLOSED("closed"),
    REVOKED("revoked"),
    EXPIRED("expired");

    companion object {
        fun fromValue(value: String): SignalingState {
            return entries.firstOrNull { it.value.equals(value, ignoreCase = true) } ?: CREATED
        }
    }
}

enum class SessionType(val value: String) {
    SCREEN_MIRROR("screen_mirror"),
    FILE_TRANSFER("file_transfer");

    companion object {
        fun fromValue(value: String): SessionType {
            return entries.firstOrNull { it.value.equals(value, ignoreCase = true) } ?: SCREEN_MIRROR
        }
    }
}

enum class ParticipantRole(val value: String) {
    WEB("web"),
    ANDROID("android");

    companion object {
        fun fromValue(value: String): ParticipantRole {
            return entries.firstOrNull { it.value.equals(value, ignoreCase = true) } ?: ANDROID
        }
    }
}

data class SdpPayload(
    val type: String = "",
    val sdp: String = ""
)

data class IceCandidatePayload(
    val candidate: String = "",
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null
)

data class IceCandidateBatch(
    @DocumentId
    val batchId: String = "",
    val sessionId: String = "",
    val sender: String = ParticipantRole.ANDROID.value,
    val sequenceNumber: Int = 0,
    val candidates: List<IceCandidatePayload> = emptyList(),
    val isComplete: Boolean = false,
    @ServerTimestamp
    val createdAt: Date? = null
)

data class SignalingSession(
    @DocumentId
    val sessionId: String = "",
    val ownerUid: String = "",
    val deviceId: String = "",
    val initiator: String = ParticipantRole.WEB.value,
    val sessionType: String = SessionType.SCREEN_MIRROR.value,
    val status: String = SignalingState.CREATED.value,
    val protocolVersion: String = "1.0",
    @ServerTimestamp
    val createdAt: Date? = null,
    @ServerTimestamp
    val updatedAt: Date? = null,
    val expiresAt: Date? = null,
    val offer: SdpPayload? = null,
    val answer: SdpPayload? = null
) {
    val signalingState: SignalingState
        get() {
            // Check local expiry
            if (expiresAt != null && System.currentTimeMillis() > expiresAt.time) {
                return SignalingState.EXPIRED
            }
            return SignalingState.fromValue(status)
        }

    val isTerminal: Boolean
        get() = signalingState in listOf(SignalingState.CLOSED, SignalingState.REVOKED, SignalingState.EXPIRED)
}

