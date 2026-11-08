package com.virux.app.data.provider

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import com.virux.app.BuildConfig

data class DeviceTelemetry(
    val deviceName: String,
    val deviceType: String,
    val manufacturer: String,
    val model: String,
    val androidVersion: String,
    val sdkVersion: Int,
    val appVersion: String,
    val batteryLevel: Int,
    val isCharging: Boolean,
    val networkType: String,
    val capabilities: Map<String, Boolean>
)

interface DeviceTelemetryProvider {
    fun getTelemetry(): DeviceTelemetry
    fun getBatteryLevel(): Int
    fun isCharging(): Boolean
    fun getNetworkTransport(): String
}

class DeviceTelemetryProviderImpl(
    private val context: Context
) : DeviceTelemetryProvider {

    override fun getTelemetry(): DeviceTelemetry {
        val batteryInfo = getBatteryInfo()
        val networkType = getNetworkTransport()
        val devType = detectDeviceType()

        val friendlyName = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"

        return DeviceTelemetry(
            deviceName = friendlyName,
            deviceType = devType,
            manufacturer = Build.MANUFACTURER,
            model = Build.MODEL,
            androidVersion = Build.VERSION.RELEASE ?: "15",
            sdkVersion = Build.VERSION.SDK_INT,
            appVersion = BuildConfig.VERSION_NAME,
            batteryLevel = batteryInfo.first,
            isCharging = batteryInfo.second,
            networkType = networkType,
            capabilities = mapOf(
                "fileTransfer" to true,
                "screenMirror" to true,
                "notifications" to true,
                "clipboard" to true
            )
        )
    }

    override fun getBatteryLevel(): Int = getBatteryInfo().first

    override fun isCharging(): Boolean = getBatteryInfo().second

    private fun getBatteryInfo(): Pair<Int, Boolean> {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return Pair(100, false)

        val level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val status = batteryIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)

        val pct = if (level >= 0 && scale > 0) {
            (level * 100) / scale
        } else {
            100
        }

        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        return Pair(pct, isCharging)
    }

    override fun getNetworkTransport(): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return "none"

        val activeNetwork = cm.activeNetwork ?: return "none"
        val caps = cm.getNetworkCapabilities(activeNetwork) ?: return "none"

        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "none"
        }
    }

    private fun detectDeviceType(): String {
        val screenLayout = context.resources.configuration.screenLayout
        val isTablet = (screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK) >= Configuration.SCREENLAYOUT_SIZE_LARGE
        return if (isTablet) "tablet" else "phone"
    }
}

