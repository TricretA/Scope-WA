package com.tricreta.scopewa.accessibility

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * The "Hands" layer — architecture doc section 5.2. Reads WhatsApp's screen
 * and taps buttons on the job runner's behalf. Scoped to `com.whatsapp` and
 * `com.whatsapp.w4b` only, enforced by `accessibility_service_config.xml`.
 *
 * Phase 1 fills in node-walking + `dispatchGesture` calls here, driven by
 * [WaSelectors]. Nothing acts yet — this is the connection scaffold plus the
 * "can I see WhatsApp?" signal Phase 1's test screen needs.
 */
class WaAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Phase 1: route window-state/content-change events to the job runner
        // when a campaign step is waiting on one.
    }

    override fun onInterrupt() {
        // Required override; nothing to clean up yet.
    }

    companion object {
        @Volatile
        var isConnected: Boolean = false
            private set
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        isConnected = true
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        isConnected = false
        return super.onUnbind(intent)
    }
}
