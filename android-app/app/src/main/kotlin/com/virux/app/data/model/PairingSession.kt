package com.virux.app.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class PairingSession(
    @DocumentId
    val sessionId: String = "",
    val ownerUid: String = "",
    val pin: String = "",
    val challengeNonce: String = "",
    val status: String = "pending", // 'pending' | 'claimed' | 'revoked'
    @ServerTimestamp
    val createdAt: Date? = null,
    val expiresAt: Date? = null,
    val claimedByDeviceId: String? = null,
    val devicePublicKey: String? = null,
    val signature: String? = null,
    @ServerTimestamp
    val claimedAt: Date? = null,
    @ServerTimestamp
    val revokedAt: Date? = null
)

