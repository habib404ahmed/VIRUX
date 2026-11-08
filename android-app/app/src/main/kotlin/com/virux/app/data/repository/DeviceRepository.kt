package com.virux.app.data.repository

import com.virux.app.data.model.QRPayload
import com.virux.app.data.model.ViruxDevice
import kotlinx.coroutines.flow.Flow

interface DeviceRepository {
    suspend fun claimPairingSession(qrPayload: QRPayload): Result<ViruxDevice>
    suspend fun claimPairingWithPin(pin: String): Result<ViruxDevice>
    suspend fun updateHeartbeat(): Result<Unit>
    fun getPairedDeviceFlow(): Flow<ViruxDevice?>
    fun isPaired(): Boolean
    fun getPairedDeviceId(): String?
    suspend fun unpair(): Result<Unit>
}

