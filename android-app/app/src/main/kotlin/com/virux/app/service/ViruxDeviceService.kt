package com.virux.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.virux.app.MainActivity
import com.virux.app.R
import com.virux.app.data.provider.DeviceIdProviderImpl
import com.virux.app.data.provider.DeviceTelemetryProviderImpl
import com.virux.app.data.provider.KeyStoreProviderImpl
import com.virux.app.data.repository.DeviceRepository
import com.virux.app.data.repository.DeviceRepositoryImpl
import kotlinx.coroutines.*

/**
 * Android Foreground Service maintaining periodic device heartbeat and telemetry sync
 * to Cloud Firestore. Configured as a 'dataSync' foreground service under Android 14/15 policies.
 */
class ViruxDeviceService : Service() {

    companion object {
        private const val TAG = "VIRUX_DeviceService"
        private const val NOTIFICATION_CHANNEL_ID = "virux_presence_channel"
        private const val NOTIFICATION_ID = 9012
        private const val HEARTBEAT_INTERVAL_MS = 45_000L // 45 seconds

        fun startService(context: Context) {
            val intent = Intent(context, ViruxDeviceService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, ViruxDeviceService::class.java)
            context.stopService(intent)
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null
    private lateinit var deviceRepository: DeviceRepository

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "ViruxDeviceService created")

        val deviceIdProvider = DeviceIdProviderImpl(applicationContext)
        val keyStoreProvider = KeyStoreProviderImpl(applicationContext)
        val telemetryProvider = DeviceTelemetryProviderImpl(applicationContext)

        deviceRepository = DeviceRepositoryImpl(
            context = applicationContext,
            deviceIdProvider = deviceIdProvider,
            keyStoreProvider = keyStoreProvider,
            deviceTelemetryProvider = telemetryProvider
        )

        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "ViruxDeviceService onStartCommand (startId=$startId)")

        val notification = buildForegroundNotification()

        val foregroundType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        } else {
            0
        }

        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            foregroundType
        )

        startHeartbeatLoop()

        return START_STICKY
    }

    private fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        heartbeatJob = serviceScope.launch {
            while (isActive) {
                try {
                    if (deviceRepository.isPaired()) {
                        val result = deviceRepository.updateHeartbeat()
                        if (result.isSuccess) {
                            Log.d(TAG, "Periodic heartbeat pushed successfully (serverTimestamp)")
                        } else {
                            Log.w(TAG, "Heartbeat sync failed: ${result.exceptionOrNull()?.message}")
                        }
                    } else {
                        Log.i(TAG, "Device is no longer paired. Stopping heartbeat service.")
                        stopSelf()
                        break
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Exception in heartbeat loop: ${e.message}")
                }
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    private fun buildForegroundNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("VIRUX Device Mesh Active")
            .setContentText("Connected to ecosystem · Synchronization active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "VIRUX Mesh Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Ongoing foreground service maintaining VIRUX hardware presence & heartbeat"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "ViruxDeviceService destroyed")
        heartbeatJob?.cancel()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

