package com.tricreta.scopewa

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class ScopeWaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CAMPAIGN_CHANNEL_ID,
                "Running campaigns",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows progress while a bulk send, extraction, or group-add job is running."
            }
        )
    }

    companion object {
        const val CAMPAIGN_CHANNEL_ID = "campaign_progress"
    }
}
