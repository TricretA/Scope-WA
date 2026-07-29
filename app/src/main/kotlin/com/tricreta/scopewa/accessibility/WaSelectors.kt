package com.tricreta.scopewa.accessibility

/**
 * Every WhatsApp-specific view-id, text, and content-description lives here,
 * with ordered fallbacks — architecture doc section 5.1 / section 8. When
 * WhatsApp changes its UI, this is the one file that needs a patch.
 *
 * Nothing is populated yet — Phase 1 (accessibility walkthrough + "can I see
 * WhatsApp?" test screen) is where these get filled in against a real device,
 * for both `com.whatsapp` and `com.whatsapp.w4b`.
 */
object WaSelectors {

    const val PACKAGE_WHATSAPP = "com.whatsapp"
    const val PACKAGE_WHATSAPP_BUSINESS = "com.whatsapp.w4b"

    /** Ordered fallback view-ids/content-descriptions for the compose box's send button. */
    val sendButtonIds: List<String> = emptyList()

    /** Ordered fallback view-ids for the message compose text field. */
    val composeBoxIds: List<String> = emptyList()

    /** Ordered fallback view-ids for a group's participant list entry point. */
    val groupInfoParticipantsIds: List<String> = emptyList()

    /** Ordered fallback view-ids for the "Add participants" search field. */
    val addParticipantSearchIds: List<String> = emptyList()
}
