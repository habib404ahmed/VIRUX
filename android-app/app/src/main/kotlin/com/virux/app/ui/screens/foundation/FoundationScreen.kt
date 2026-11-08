package com.virux.app.ui.screens.foundation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virux.app.ui.theme.ViruxTheme

/**
 * VIRUX — Foundation Screen (Phase 1)
 *
 * This screen is a placeholder that confirms the design system,
 * theme, and navigation are correctly wired. It is NOT a final
 * UI screen and will be replaced by the authentication flow
 * in Phase 2.
 *
 * Purpose:
 * - Verify ViruxTheme renders correctly.
 * - Verify color tokens are applied.
 * - Verify the app launches without crashes.
 */
@Composable
fun FoundationScreen() {
    val colors  = ViruxTheme.colors
    val spacing = ViruxTheme.spacing

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(spacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.md),
        ) {

            // Brand name
            Text(
                text = "VIRUX",
                color = colors.primary,
                fontSize = 48.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 8.sp,
            )

            // Tagline
            Text(
                text = "Your Devices. One Ecosystem.",
                color = colors.textSecondary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Normal,
                textAlign = TextAlign.Center,
                letterSpacing = 1.sp,
            )

            Spacer(modifier = Modifier.height(spacing.xl))

            // Status badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(colors.surface)
                    .padding(horizontal = spacing.md, vertical = spacing.sm),
            ) {
                Text(
                    text = "● Phase 1 — Foundation",
                    color = colors.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 0.5.sp,
                )
            }

            Spacer(modifier = Modifier.height(spacing.sm))

            Text(
                text = "Design system initialized.\nFirebase SDK configured.\nPhase 2 pending.",
                color = colors.textSecondary,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                lineHeight = 20.sp,
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF090D18)
@Composable
fun FoundationScreenPreview() {
    ViruxTheme {
        FoundationScreen()
    }
}

