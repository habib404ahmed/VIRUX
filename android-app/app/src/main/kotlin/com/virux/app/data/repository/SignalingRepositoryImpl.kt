package com.virux.app.data.repository

import android.util.Log
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.virux.app.data.model.IceCandidateBatch
import com.virux.app.data.model.IceCandidatePayload
import com.virux.app.data.model.SignalingSession
import com.virux.app.data.model.SignalingState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import java.util.UUID

class AndroidCandidateBatcherImpl(
    private val firestore: FirebaseFirestore,
    private val userId: String,
    private val deviceId: String,
    private val sessionId: String,
    private val sender: String,
    private val debounceMs: Long,
    private val maxBatchSize: Int,
    private val scope: CoroutineScope
) : AndroidCandidateBatcher {

    private val mutex = Mutex()
    private val buffer = mutableListOf<IceCandidatePayload>()
    private val seenFingerprints = mutableSetOf<String>()
    private var sequenceNumber = 0
    private var debounceJob: Job? = null
    private var isDisposed = false

    override fun queueCandidate(candidate: IceCandidatePayload) {
        scope.launch {
            mutex.withLock {
                if (isDisposed) return@launch

                val fingerprint = "${candidate.candidate}|${candidate.sdpMid}|${candidate.sdpMLineIndex}"
                if (seenFingerprints.contains(fingerprint)) return@launch

                seenFingerprints.add(fingerprint)
                buffer.add(candidate)

                if (buffer.size >= maxBatchSize) {
                    debounceJob?.cancel()
                    debounceJob = null
                    flushInternal(isComplete = false)
                    return@launch
                }

                if (debounceJob == null) {
                    debounceJob = scope.launch {
                        delay(debounceMs)
                        mutex.withLock {
                            debounceJob = null
                            flushInternal(isComplete = false)
                        }
                    }
                }
            }
        }
    }

    override suspend fun completeGathering() {
        mutex.withLock {
            if (isDisposed) return
            debounceJob?.cancel()
            debounceJob = null
            flushInternal(isComplete = true)
        }
    }

    override suspend fun flush(isComplete: Boolean) {
        mutex.withLock {
            if (isDisposed) return
            debounceJob?.cancel()
            debounceJob = null
            flushInternal(isComplete)
        }
    }

    private suspend fun flushInternal(isComplete: Boolean) {
        if (buffer.isEmpty() && !isComplete) return

        val candidatesToWrite = buffer.toList()
        buffer.clear()

        val batchId = UUID.randomUUID().toString()
        val batchRef = firestore.collection("users")
            .document(userId)
            .collection("devices")
            .document(deviceId)
            .collection("signaling")
            .document(sessionId)
            .collection("candidateBatches")
            .document(batchId)

        val batchData = hashMapOf(
            "batchId" to batchId,
            "sessionId" to sessionId,
            "sender" to sender,
            "sequenceNumber" to sequenceNumber++,
            "candidates" to candidatesToWrite.map {
                hashMapOf(
                    "candidate" to it.candidate,
                    "sdpMid" to it.sdpMid,
                    "sdpMLineIndex" to it.sdpMLineIndex
                )
            },
            "isComplete" to isComplete,
            "createdAt" to FieldValue.serverTimestamp()
        )

        try {
            batchRef.set(batchData).await()
        } catch (e: Exception) {
            Log.e("VIRUX_CandidateBatcher", "Failed to write candidate batch: ${e.message}")
            if (!isDisposed) {
                // Restore failed candidates
                buffer.addAll(0, candidatesToWrite)
            }
            throw e
        }
    }

    override fun dispose() {
        isDisposed = true
        debounceJob?.cancel()
        debounceJob = null
        buffer.clear()
        seenFingerprints.clear()
    }
}

class SignalingRepositoryImpl(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance()
) : SignalingRepository {

    companion object {
        private const val TAG = "VIRUX_SignalingRepo"
    }

    override fun observeIncomingSessions(userId: String, deviceId: String): Flow<List<SignalingSession>> = callbackFlow {
        val collectionRef = firestore.collection("users")
            .document(userId)
            .collection("devices")
            .document(deviceId)
            .collection("signaling")

        val listener = collectionRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e(TAG, "Error listening to signaling sessions: ${error.message}")
                close(error)
                return@addSnapshotListener
            }

            if (snapshot != null) {
                val sessions = snapshot.documents.mapNotNull { it.toObject(SignalingSession::class.java) }
                    .filter { !it.isTerminal }
                trySend(sessions)
            }
        }

        awaitClose { listener.remove() }
    }

    override fun observeSession(userId: String, deviceId: String, sessionId: String): Flow<SignalingSession> = callbackFlow {
        val docRef = firestore.collection("users")
            .document(userId)
            .collection("devices")
            .document(deviceId)
            .collection("signaling")
            .document(sessionId)

        val listener = docRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e(TAG, "Error listening to signaling session $sessionId: ${error.message}")
                close(error)
                return@addSnapshotListener
            }

            if (snapshot != null && snapshot.exists()) {
                val session = snapshot.toObject(SignalingSession::class.java)
                if (session != null) {
                    trySend(session)
                }
            } else {
                close(IllegalStateException("Signaling session document does not exist"))
            }
        }

        awaitClose { listener.remove() }
    }

    override suspend fun publishAnswer(userId: String, deviceId: String, sessionId: String, sdp: String): Result<Unit> {
        return try {
            if (sdp.length > 65536) {
                return Result.failure(IllegalArgumentException("SDP payload exceeds 64KB security limit"))
            }

            val docRef = firestore.collection("users")
                .document(userId)
                .collection("devices")
                .document(deviceId)
                .collection("signaling")
                .document(sessionId)

            val updates = hashMapOf<String, Any>(
                "status" to SignalingState.ANSWER_CREATED.value,
                "answer" to hashMapOf(
                    "type" to "answer",
                    "sdp" to sdp
                ),
                "updatedAt" to FieldValue.serverTimestamp()
            )

            docRef.update(updates).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to publish answer: ${e.message}")
            Result.failure(e)
        }
    }

    override suspend fun publishOffer(userId: String, deviceId: String, sessionId: String, sdp: String): Result<Unit> {
        return try {
            if (sdp.length > 65536) {
                return Result.failure(IllegalArgumentException("SDP payload exceeds 64KB security limit"))
            }

            val docRef = firestore.collection("users")
                .document(userId)
                .collection("devices")
                .document(deviceId)
                .collection("signaling")
                .document(sessionId)

            val updates = hashMapOf<String, Any>(
                "status" to SignalingState.OFFER_CREATED.value,
                "offer" to hashMapOf(
                    "type" to "offer",
                    "sdp" to sdp
                ),
                "updatedAt" to FieldValue.serverTimestamp()
            )

            docRef.update(updates).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to publish offer: ${e.message}")
            Result.failure(e)
        }
    }

    override suspend fun updateStatus(userId: String, deviceId: String, sessionId: String, status: SignalingState): Result<Unit> {
        return try {
            val docRef = firestore.collection("users")
                .document(userId)
                .collection("devices")
                .document(deviceId)
                .collection("signaling")
                .document(sessionId)

            val updates = hashMapOf<String, Any>(
                "status" to status.value,
                "updatedAt" to FieldValue.serverTimestamp()
            )

            docRef.update(updates).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update signaling status to $status: ${e.message}")
            Result.failure(e)
        }
    }

    override suspend fun closeSession(userId: String, deviceId: String, sessionId: String): Result<Unit> {
        return try {
            val docRef = firestore.collection("users")
                .document(userId)
                .collection("devices")
                .document(deviceId)
                .collection("signaling")
                .document(sessionId)

            val updates = hashMapOf<String, Any>(
                "status" to SignalingState.CLOSED.value,
                "updatedAt" to FieldValue.serverTimestamp()
            )

            docRef.update(updates).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to close signaling session: ${e.message}")
            Result.failure(e)
        }
    }

    override fun observeRemoteCandidateBatches(
        userId: String,
        deviceId: String,
        sessionId: String,
        remoteSender: String
    ): Flow<IceCandidateBatch> = callbackFlow {
        val batchesRef = firestore.collection("users")
            .document(userId)
            .collection("devices")
            .document(deviceId)
            .collection("signaling")
            .document(sessionId)
            .collection("candidateBatches")
            .whereEqualTo("sender", remoteSender)
            .orderBy("sequenceNumber", Query.Direction.ASCENDING)

        val listener = batchesRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e(TAG, "Error observing candidate batches: ${error.message}")
                close(error)
                return@addSnapshotListener
            }

            if (snapshot != null) {
                for (docChange in snapshot.documentChanges) {
                    if (docChange.type == com.google.firebase.firestore.DocumentChange.Type.ADDED) {
                        val batch = docChange.document.toObject(IceCandidateBatch::class.java)
                        trySend(batch)
                    }
                }
            }
        }

        awaitClose { listener.remove() }
    }

    override fun createCandidateBatcher(
        userId: String,
        deviceId: String,
        sessionId: String,
        sender: String,
        debounceMs: Long,
        maxBatchSize: Int,
        scope: CoroutineScope
    ): AndroidCandidateBatcher {
        return AndroidCandidateBatcherImpl(
            firestore = firestore,
            userId = userId,
            deviceId = deviceId,
            sessionId = sessionId,
            sender = sender,
            debounceMs = debounceMs,
            maxBatchSize = maxBatchSize,
            scope = scope
        )
    }
}

