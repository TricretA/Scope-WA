package com.tricreta.scopewa.update

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Direct-install updater — architecture doc section 4: signed release APK +
 * `update.json` + in-app updater, no Play Store (same pipeline as v1).
 *
 * `update.json` is published by the release CI workflow next to the signed
 * APK on GitHub Releases. Shape:
 * ```json
 * { "versionCode": 2, "versionName": "0.2.0", "apkUrl": "https://.../scope-wa.apk", "notes": "..." }
 * ```
 */
class UpdateChecker(private val updateJsonUrl: String) {

    fun checkForUpdate(currentVersionCode: Int): UpdateInfo? {
        val connection = URL(updateJsonUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        return try {
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val remoteVersionCode = json.getInt("versionCode")
            if (remoteVersionCode <= currentVersionCode) return null

            UpdateInfo(
                versionCode = remoteVersionCode,
                versionName = json.getString("versionName"),
                apkUrl = json.getString("apkUrl"),
                notes = json.optString("notes", "")
            )
        } finally {
            connection.disconnect()
        }
    }
}

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val notes: String
)
