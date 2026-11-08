package com.virux.app.data.repository

import com.virux.app.data.model.IceCandidateBatch
import com.virux.app.data.model.IceCandidatePayload
import com.virux.app.data.model.SignalingSession
import com.virux.app.data.model.SignalingState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow

interface AndroidCandidateBatcher {
    fun queueCandidate(candidate: IceCandidatePayload)
    suspend fun completeGathering()
    suspend fun flush(isComplete: Boolean = false)
    fun dispose()
}

interface SignalingRepository {
    fun observeIncomingSessions(userId: String, deviceId: String): Flow<List<SignalingSession>>
    fun observeSession(userId: String, deviceId: String, sessionId: String): Flow<SignalingSession>
    suspend fun publishAnswer(userId: String, deviceId: String, sessionId: String, sdp: String): Result<Unit>
    suspend fun publishOffer(userId: String, deviceId: String, sessionId: String, sdp: String): Result<Unit>
    suspend fun updateStatus(userId: String, deviceId: String, sessionId: String, status: SignalingState): Result<Unit>
    suspend fun closeSession(userId: String, deviceId: String, sessionId: String): Result<Unit>
    fun observeRemoteCandidateBatches(userId: String, deviceId: String, sessionId: String, remoteSender: String = "web"): Flow<IceCandidateBatch>
    fun createCandidateBatcher(
        userId: String,
        deviceId: String,
        sessionId: String,
        sender: String = "android",
        debounceMs: Long = 250L,
        maxBatchSize: Int = 25,
        scope: CoroutineScope
    ): AndroidCandidateBatcher
}

