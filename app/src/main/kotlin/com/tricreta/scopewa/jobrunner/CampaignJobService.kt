package com.tricreta.scopewa.jobrunner

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.tricreta.scopewa.ScopeWaApplication

/**
 * The "Job Runner" layer — architecture doc section 5.2. Takes the next step
 * of a campaign, waits out the pacing delay from
 * [com.tricreta.scopewa.brain.pacing.PacingPlanner], and survives reboots by
 * persisting progress to Room before every step.
 *
 * A foreground service is correct here (unlike v1's SMS-detection rule)
 * because this is long-running, visible, user-started work — see section 5.2.
 *
 * Phase 5 wires this to the brain + accessibility layers. For now it only
 * establishes the foreground-service scaffold so later phases don't need to
 * restructure the manifest or notification channel.
 */
class CampaignJobService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildIdleNotification())
        // Phase 5: pull the next queued step from Room and hand it to the
        // accessibility layer, gated by CircuitBreaker.checkPauseReason().
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildIdleNotification(): Notification =
        NotificationCompat.Builder(this, ScopeWaApplication.CAMPAIGN_CHANNEL_ID)
            .setContentTitle("Scope WA")
            .setContentText("No campaign running")
            .setOngoing(true)
            .build()

    companion object {
        private const val NOTIFICATION_ID = 1001
    }
}
