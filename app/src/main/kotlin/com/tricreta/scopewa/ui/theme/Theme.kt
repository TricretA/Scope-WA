package com.tricreta.scopewa.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = ScopeGreen,
    secondary = ScopeGreenLight,
    error = ScopeRed,
    background = ScopeBackground
)

private val DarkColors = darkColorScheme(
    primary = ScopeGreenLight,
    secondary = ScopeGreen,
    error = ScopeRed,
    background = ScopeSurfaceDark
)

@Composable
fun ScopeWaTheme(
    useDarkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (useDarkTheme) DarkColors else LightColors,
        typography = ScopeTypography,
        content = content
    )
}
