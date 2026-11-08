package com.virux.app.data.model

import org.json.JSONObject

/**
 * QR Pairing payload matching Web Dashboard schema:
 * { "v": 1, "sid": "...", "uid": "...", "cn": "...", "pin": "...", "exp": 179... }
 */
data class QRPayload(
    val v: Int = 1,
    val sid: String = "",
    val uid: String = "",
    val cn: String = "",
    val pin: String = "",
    val exp: Long = 0L
) {
    companion object {
        fun fromJson(jsonStr: String): Result<QRPayload> {
            return try {
                val obj = JSONObject(jsonStr)
                val sid = obj.getString("sid")
                val uid = obj.getString("uid")
                val cn = obj.getString("cn")

                if (sid.isBlank() || uid.isBlank() || cn.isBlank()) {
                    return Result.failure(IllegalArgumentException("QR payload is missing required pairing attributes."))
                }

                Result.success(
                    QRPayload(
                        v = obj.optInt("v", 1),
                        sid = sid,
                        uid = uid,
                        cn = cn,
                        pin = obj.optString("pin", ""),
                        exp = obj.optLong("exp", 0L)
                    )
                )
            } catch (e: Exception) {
                Result.failure(IllegalArgumentException("Invalid QR code format: Not a VIRUX pairing token.", e))
            }
        }
    }
}

