package com.tricreta.scopewa.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.tricreta.scopewa.ui.common.ComingSoonScreen
import com.tricreta.scopewa.ui.home.HomeScreen

@Composable
fun ScopeWaNavHost(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController()
) {
    NavHost(
        navController = navController,
        startDestination = ScopeWaDestination.Home.route,
        modifier = modifier
    ) {
        composable(ScopeWaDestination.Home.route) { HomeScreen() }

        composable(ScopeWaDestination.Contacts.route) {
            ComingSoonScreen("Contacts", "Lands in Phase 2 — see architecture doc section 9.")
        }
        composable(ScopeWaDestination.Extract.route) {
            ComingSoonScreen("Extract", "Lands in Phase 4 — see architecture doc section 9.")
        }
        composable(ScopeWaDestination.Templates.route) {
            ComingSoonScreen("Templates", "Lands in Phase 3 — see architecture doc section 9.")
        }
        composable(ScopeWaDestination.Campaign.route) {
            ComingSoonScreen("Campaign", "Lands in Phase 5 — see architecture doc section 9.")
        }
        composable(ScopeWaDestination.Running.route) {
            ComingSoonScreen("Running", "Lands in Phase 5 — see architecture doc section 9.")
        }
        composable(ScopeWaDestination.GroupAdd.route) {
            ComingSoonScreen("Group Add", "Lands in Phase 7 — ships last, strictest settings.")
        }
        composable(ScopeWaDestination.ActivityLog.route) {
            ComingSoonScreen("Activity log", "Lands in Phase 6 — see architecture doc section 9.")
        }
        composable(ScopeWaDestination.Settings.route) {
            ComingSoonScreen("Settings", "Lands alongside Phase 1's permission walkthrough.")
        }
    }
}
