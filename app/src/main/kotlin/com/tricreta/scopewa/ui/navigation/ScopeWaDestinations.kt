package com.tricreta.scopewa.ui.navigation

/**
 * One route per screen in ARCHITECTURE-V2-WHATSAPP.md section 7.
 * Screens land in build-order phases (see the doc, section 9); until then each
 * route resolves to a [com.tricreta.scopewa.ui.common.ComingSoonScreen].
 */
enum class ScopeWaDestination(val route: String, val label: String) {
    Home("home", "Home"),
    Contacts("contacts", "Contacts"),
    Extract("extract", "Extract"),
    Templates("templates", "Templates"),
    Campaign("campaign", "Campaign"),
    Running("running", "Running"),
    GroupAdd("group_add", "Group Add"),
    ActivityLog("activity_log", "Activity log"),
    Settings("settings", "Settings")
}
