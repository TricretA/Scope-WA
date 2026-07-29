package com.tricreta.scopewa

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.tricreta.scopewa.ui.navigation.ScopeWaNavHost
import com.tricreta.scopewa.ui.theme.ScopeWaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ScopeWaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ScopeWaNavHost()
                }
            }
        }
    }
}
