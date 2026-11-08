package com.virux.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.virux.app.ui.theme.ViruxTheme
import com.virux.app.ui.navigation.ViruxNavHost

/**
 * VIRUX — Main Entry Activity.
 *
 * Phase 1: Sets up the Compose host and applies the VIRUX design system theme.
 * Navigation host is wired but only contains the foundation screen for now.
 *
 * Future phases will add:
 * - Authentication gate.
 * - Device pairing flow.
 * - Dashboard screen.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ViruxTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = ViruxTheme.colors.background
                ) {
                    ViruxNavHost()
                }
            }
        }
    }
}

