package com.virux.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.virux.app.MainActivity
import com.virux.app.R
import com.virux.app.data.repository.SignalingRepositoryImpl
import com.virux.app.webrtc.PeerConnectionCallback
import com.virux.app.webrtc.PeerConnectionManager
import com.virux.app.webrtc.PeerConnectionStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * Android Foreground Service managing MediaProjection screen capture and WebRTC
 * peer-connection streaming under Android 14/15 restrictions.
 */
class ViruxScreenMirrorService : Service() {

    companion object {
        private const val TAG = "VIRUX_ScreenMirrorSvc"
        private const val NOTIFICATION_CHANNEL_ID = "virux_screen_mirror_channel"
        private const val NOTIFICATION_ID = 9015

        const val ACTION_START_MIRRORING = "com.virux.app.action.START_MIRRORING"
        const val ACTION_STOP_MIRRORING = "com.virux.app.action.STOP_MIRRORING"

        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"
        const val EXTRA_SESSION_ID = "extra_session_id"
        const val EXTRA_DEVICE_ID = "extra_device_id"
        const val EXTRA_USER_ID = "extra_user_id"

        fun startService(
            context: Context,
            resultCode: Int,
            resultData: Intent,
            userId: String,
            deviceId: String,
            sessionId: String
        ) {
            val intent = Intent(context, ViruxScreenMirrorService::class.java).apply {
                action = ACTION_START_MIRRORING
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, resultData)
                putExtra(EXTRA_USER_ID, userId)
                putExtra(EXTRA_DEVICE_ID, deviceId)
                putExtra(EXTRA_SESSION_ID, sessionId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, ViruxScreenMirrorService::class.java).apply {
                action = ACTION_STOP_MIRRORING
            }
            context.startService(intent)
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var peerConnectionManager: PeerConnectionManager? = null
    private var isMirroring = false

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "ViruxScreenMirrorService onCreate")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_STOP_MIRRORING -> {
                Log.i(TAG, "Received ACTION_STOP_MIRRORING request")
                stopMirroringSession()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START_MIRRORING -> {
                handleStartMirroring(intent)
            }
        }

        return START_NOT_STICKY
    }

    private fun handleStartMirroring(intent: Intent) {
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }

        val userId = intent.getStringExtra(EXTRA_USER_ID) ?: ""
        val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID) ?: ""
        val sessionId = intent.getStringExtra(EXTRA_SESSION_ID) ?: ""

        if (resultCode == 0 || resultData == null || userId.isEmpty() || deviceId.isEmpty() || sessionId.isEmpty()) {
            Log.e(TAG, "Missing MediaProjection consent intent or session params. Aborting.")
            stopSelf()
            return
        }

        // 1. Enter foreground with FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION immediately
        val notification = buildForegroundNotification()
        val foregroundType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        } else {
            0
        }

        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                foregroundType
            )
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException entering foreground with mediaProjection: ${e.message}")
            stopSelf()
            return
        }

        // 2. Initialize PeerConnectionManager and native screen capture pipeline
        try {
            this.isMirroring = true

            val metrics = resources.displayMetrics
            val targetWidth = 720
            val targetHeight = ((targetWidth.toFloat() * metrics.heightPixels) / metrics.widthPixels).toInt()
            val fps = 30

            val manager = PeerConnectionManager(
                userId = userId,
                deviceId = deviceId,
                sessionId = sessionId,
                signalingRepository = SignalingRepositoryImpl(),
                scope = serviceScope,
                callback = object : PeerConnectionCallback {
                    override fun onConnectionStateChange(status: PeerConnectionStatus) {
                        Log.i(TAG, "WebRTC PeerConnection state: $status")
                        if (status.isTerminal) {
                            stopMirroringSession()
                            stopSelf()
                        }
                    }

                    override fun onError(throwable: Throwable) {
                        Log.e(TAG, "PeerConnection error in service: ${throwable.message}")
                        stopMirroringSession()
                        stopSelf()
                    }
                }
            )
            this.peerConnectionManager = manager

            manager.initialize(
                context = this,
                resultData = resultData,
                width = targetWidth,
                height = targetHeight,
                fps = fps,
                projectionCallback = object : MediaProjection.Callback() {
                    override fun onStop() {
                        super.onStop()
                        Log.i(TAG, "MediaProjection.Callback: OS or user stopped screen capture")
                        stopMirroringSession()
                        stopSelf()
                    }
                }
            )

            Log.i(TAG, "Native Screen Mirroring pipeline successfully launched for session $sessionId")
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing screen capture pipeline: ${e.message}")
            stopMirroringSession()
            stopSelf()
        }
    }

    private fun stopMirroringSession() {
        if (!isMirroring) return
        isMirroring = false

        Log.i(TAG, "Stopping screen mirroring session and releasing surfaces")

        try {
            peerConnectionManager?.close()
            peerConnectionManager = null
        } catch (e: Exception) {
            Log.w(TAG, "Error closing PeerConnectionManager: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "ViruxScreenMirrorService onDestroy")
        stopMirroringSession()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "VIRUX Screen Mirroring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifies when screen mirroring to VIRUX Web Dashboard is active"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, ViruxScreenMirrorService::class.java).apply {
            action = ACTION_STOP_MIRRORING
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Screen Mirroring Active — VIRUX")
            .setContentText("Streaming display directly to your VIRUX Web Dashboard")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(contentPendingIntent)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop Mirroring",
                stopPendingIntent
            )
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
}
