package com.tricreta.scopewa.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Phase 0 placeholder. Real Home screen (today's counters, warm-up day, active
 * campaign — architecture doc section 7) lands once Phase 1's Accessibility
 * Service test screen is working.
 */
@Composable
fun HomeScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Scope WA", style = MaterialTheme.typography.titleLarge)
        Text(
            text = "Phase 0 skeleton. Next: Accessibility Service walkthrough (Phase 1).",
            style = MaterialTheme.typography.bodyLarge
        )
    }
}
