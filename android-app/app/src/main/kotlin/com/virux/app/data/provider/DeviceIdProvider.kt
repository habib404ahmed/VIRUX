package com.virux.app.data.provider

import android.content.Context
import java.util.UUID

/**
 * Provides a persistent, unique hardware identifier for this Android installation.
 * Uses application-private SharedPreferences to retain the UUID across app sessions.
 */
interface DeviceIdProvider {
    fun getDeviceId(): String
}

class DeviceIdProviderImpl(
    private val context: Context
) : DeviceIdProvider {

    companion object {
        private const val PREFS_NAME = "virux_device_identity"
        private const val KEY_DEVICE_ID = "persistent_device_uuid"
    }

    override fun getDeviceId(): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var id = prefs.getString(KEY_DEVICE_ID, null)
        if (id.isNullOrBlank()) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        }
        return id
    }
}

