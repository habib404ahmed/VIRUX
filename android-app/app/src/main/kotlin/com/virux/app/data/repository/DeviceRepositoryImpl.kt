package com.virux.app.data.repository

import android.content.Context
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.virux.app.data.model.DeviceCapabilities
import com.virux.app.data.model.QRPayload
import com.virux.app.data.model.ViruxDevice
import com.virux.app.data.provider.DeviceIdProvider
import com.virux.app.data.provider.DeviceTelemetryProvider
import com.virux.app.data.provider.KeyStoreProvider
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class DeviceRepositoryImpl(
    private val context: Context,
    private val deviceIdProvider: DeviceIdProvider,
    private val keyStoreProvider: KeyStoreProvider,
    private val deviceTelemetryProvider: DeviceTelemetryProvider,
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) : DeviceRepository {

    companion object {
        private const val TAG = "VIRUX_DeviceRepo"
        private const val PREFS_NAME = "virux_device_pairing_prefs"
        private const val KEY_IS_PAIRED = "is_paired"
        private const val KEY_PAIRED_OWNER_UID = "paired_owner_uid"
        private const val KEY_PAIRED_DEVICE_NAME = "paired_device_name"
    }

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun isPaired(): Boolean = prefs.getBoolean(KEY_IS_PAIRED, false)

    override fun getPairedDeviceId(): String? {
        return if (isPaired()) deviceIdProvider.getDeviceId() else null
    }

    fun getPairedOwnerUid(): String? = prefs.getString(KEY_PAIRED_OWNER_UID, null)

    override suspend fun claimPairingSession(qrPayload: QRPayload): Result<ViruxDevice> {
        val currentUser = auth.currentUser
            ?: return Result.failure(IllegalStateException("You must be signed in to the VIRUX app to pair."))

        if (currentUser.uid != qrPayload.uid) {
            return Result.failure(
                IllegalStateException("QR code belongs to user ${qrPayload.uid.take(6)}..., but this app is logged into ${currentUser.uid.take(6)}...")
            )
        }

        val nowMs = System.currentTimeMillis()
        if (qrPayload.exp > 0 && nowMs > qrPayload.exp) {
            return Result.failure(IllegalStateException("Pairing session has expired. Please refresh the QR code on your PC dashboard."))
        }

        val deviceId = deviceIdProvider.getDeviceId()
        val signature = try {
            keyStoreProvider.signChallenge(
                challengeNonce = qrPayload.cn,
                sessionId = qrPayload.sid,
                ownerUid = qrPayload.uid,
                deviceId = deviceId
            )
        } catch (e: Exception) {
            return Result.failure(IllegalStateException("Cryptographic signing error: ${e.message}", e))
        }

        val publicKeyBase64 = keyStoreProvider.getPublicKeyBase64()
        val telemetry = deviceTelemetryProvider.getTelemetry()

        return try {
            firestore.runTransaction { transaction ->
                val sessionRef = firestore.collection("users").document(qrPayload.uid)
                    .collection("pairingSessions").document(qrPayload.sid)

                val sessionSnap = transaction.get(sessionRef)
                if (!sessionSnap.exists()) {
                    throw IllegalStateException("Pairing session does not exist on the server.")
                }

                val currentStatus = sessionSnap.getString("status")
                if (currentStatus != "pending") {
                    throw IllegalStateException("Session is no longer pending (current state: $currentStatus).")
                }

                // 1. Claim session atomically
                transaction.update(
                    sessionRef,
                    mapOf(
                        "status" to "claimed",
                        "claimedByDeviceId" to deviceId,
                        "devicePublicKey" to publicKeyBase64,
                        "signature" to signature,
                        "claimedAt" to FieldValue.serverTimestamp()
                    )
                )

                // 2. Register device profile atomically
                val deviceRef = firestore.collection("users").document(qrPayload.uid)
                    .collection("devices").document(deviceId)

                transaction.set(
                    deviceRef,
                    mapOf(
                        "deviceId" to deviceId,
                        "ownerUid" to qrPayload.uid,
                        "deviceName" to telemetry.deviceName,
                        "deviceType" to telemetry.deviceType,
                        "manufacturer" to telemetry.manufacturer,
                        "model" to telemetry.model,
                        "androidVersion" to telemetry.androidVersion,
                        "sdkVersion" to telemetry.sdkVersion,
                        "appVersion" to telemetry.appVersion,
                        "devicePublicKey" to publicKeyBase64,
                        "batteryLevel" to telemetry.batteryLevel,
                        "isCharging" to telemetry.isCharging,
                        "networkType" to telemetry.networkType,
                        "capabilities" to telemetry.capabilities,
                        "createdAt" to FieldValue.serverTimestamp(),
                        "lastSeen" to FieldValue.serverTimestamp(),
                        "revokedAt" to null,
                        "pairingSessionId" to qrPayload.sid
                    )
                )
            }.await()

            // Persist local pairing state
            prefs.edit()
                .putBoolean(KEY_IS_PAIRED, true)
                .putString(KEY_PAIRED_OWNER_UID, qrPayload.uid)
                .putString(KEY_PAIRED_DEVICE_NAME, telemetry.deviceName)
                .apply()

            val pairedDevice = ViruxDevice(
                deviceId = deviceId,
                ownerUid = qrPayload.uid,
                deviceName = telemetry.deviceName,
                deviceType = telemetry.deviceType,
                manufacturer = telemetry.manufacturer,
                model = telemetry.model,
                androidVersion = telemetry.androidVersion,
                sdkVersion = telemetry.sdkVersion,
                appVersion = telemetry.appVersion,
                devicePublicKey = publicKeyBase64,
                batteryLevel = telemetry.batteryLevel,
                isCharging = telemetry.isCharging,
                networkType = telemetry.networkType,
                capabilities = DeviceCapabilities()
            )

            Result.success(pairedDevice)
        } catch (e: Exception) {
            Log.e(TAG, "Pairing transaction failed", e)
            val message = when (e) {
                is FirebaseFirestoreException -> {
                    if (e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) {
                        "Permission denied by Firestore rules. Note: Phase 4 rules are pending deployment in Step 3."
                    } else {
                        "Firestore error (${e.code}): ${e.message}"
                    }
                }
                else -> e.message ?: "Unknown pairing transaction error"
            }
            Result.failure(IllegalStateException(message, e))
        }
    }

    override suspend fun claimPairingWithPin(pin: String): Result<ViruxDevice> {
        val currentUser = auth.currentUser
            ?: return Result.failure(IllegalStateException("You must be signed in to pair."))

        val cleanPin = pin.trim()
        if (cleanPin.length != 6) {
            return Result.failure(IllegalArgumentException("Pairing PIN must be exactly 6 digits."))
        }

        return try {
            val querySnapshot = firestore.collection("users").document(currentUser.uid)
                .collection("pairingSessions")
                .whereEqualTo("pin", cleanPin)
                .whereEqualTo("status", "pending")
                .get()
                .await()

            if (querySnapshot.isEmpty) {
                return Result.failure(IllegalStateException("No active pairing session found for PIN $cleanPin. Check the Web Dashboard code."))
            }

            val doc = querySnapshot.documents.first()
            val challengeNonce = doc.getString("challengeNonce") ?: ""
            val expMillis = doc.getTimestamp("expiresAt")?.toDate()?.time
                ?: (System.currentTimeMillis() + 600_000)

            val payload = QRPayload(
                v = 1,
                sid = doc.id,
                uid = currentUser.uid,
                cn = challengeNonce,
                pin = cleanPin,
                exp = expMillis
            )

            claimPairingSession(payload)
        } catch (e: Exception) {
            Log.e(TAG, "PIN lookup failed", e)
            val msg = if (e is FirebaseFirestoreException && e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) {
                "Permission denied by Firestore rules. Subcollection pairingSessions requires Phase 4 security rules."
            } else {
                e.message ?: "PIN pairing failed"
            }
            Result.failure(IllegalStateException(msg, e))
        }
    }

    override suspend fun updateHeartbeat(): Result<Unit> {
        if (!isPaired()) return Result.success(Unit)
        val ownerUid = getPairedOwnerUid() ?: return Result.success(Unit)
        val deviceId = deviceIdProvider.getDeviceId()

        val batteryLevel = deviceTelemetryProvider.getBatteryLevel()
        val isCharging = deviceTelemetryProvider.isCharging()
        val networkType = deviceTelemetryProvider.getNetworkTransport()

        return try {
            val deviceRef = firestore.collection("users").document(ownerUid)
                .collection("devices").document(deviceId)

            deviceRef.update(
                mapOf(
                    "lastSeen" to FieldValue.serverTimestamp(),
                    "batteryLevel" to batteryLevel,
                    "isCharging" to isCharging,
                    "networkType" to networkType
                )
            ).await()

            Result.success(Unit)
        } catch (e: Exception) {
            Log.w(TAG, "Heartbeat failed (network transient or rules blocked): ${e.message}")
            Result.failure(e)
        }
    }

    override fun getPairedDeviceFlow(): Flow<ViruxDevice?> = callbackFlow {
        if (!isPaired()) {
            trySend(null)
            close()
            return@callbackFlow
        }

        val ownerUid = getPairedOwnerUid()
        val deviceId = deviceIdProvider.getDeviceId()

        if (ownerUid == null) {
            trySend(null)
            close()
            return@callbackFlow
        }

        val deviceRef = firestore.collection("users").document(ownerUid)
            .collection("devices").document(deviceId)

        val registration = deviceRef.addSnapshotListener { snap, err ->
            if (err != null) {
                Log.w(TAG, "Snapshot error on device $deviceId: ${err.message}")
                return@addSnapshotListener
            }

            if (snap != null && snap.exists()) {
                val dev = snap.toObject(ViruxDevice::class.java)
                trySend(dev)
            } else {
                trySend(null)
            }
        }

        awaitClose { registration.remove() }
    }

    override suspend fun unpair(): Result<Unit> {
        val ownerUid = getPairedOwnerUid()
        val deviceId = deviceIdProvider.getDeviceId()

        // Clear local state first
        prefs.edit().clear().apply()

        if (ownerUid != null) {
            try {
                firestore.collection("users").document(ownerUid)
                    .collection("devices").document(deviceId)
                    .update("revokedAt", FieldValue.serverTimestamp())
                    .await()
            } catch (e: Exception) {
                Log.w(TAG, "Remote unpair notification failed: ${e.message}")
            }
        }

        return Result.success(Unit)
    }
}

