package com.virux.app.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class DeviceCapabilities(
    val fileTransfer: Boolean = true,
    val screenMirror: Boolean = true,
    val notifications: Boolean = true,
    val clipboard: Boolean = true
)

data class ViruxDevice(
    @DocumentId
    val deviceId: String = "",
    val ownerUid: String = "",
    val deviceName: String = "",
    val deviceType: String = "phone",
    val manufacturer: String = "",
    val model: String = "",
    val androidVersion: String = "",
    val sdkVersion: Int = 0,
    val appVersion: String = "",
    val devicePublicKey: String = "",
    val batteryLevel: Int = 0,
    val isCharging: Boolean = false,
    val networkType: String = "none",
    val capabilities: DeviceCapabilities = DeviceCapabilities(),
    @ServerTimestamp
    val createdAt: Date? = null,
    @ServerTimestamp
    val lastSeen: Date? = null,
    val revokedAt: Date? = null,
    val pairingSessionId: String? = null
)

