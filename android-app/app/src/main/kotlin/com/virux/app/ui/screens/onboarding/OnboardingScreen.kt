package com.virux.app.ui.screens.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virux.app.ui.components.ViruxButton
import com.virux.app.ui.components.ViruxButtonVariant
import com.virux.app.ui.theme.ViruxTheme

data class OnboardingPillar(
    val title: String,
    val description: String,
    val icon: ImageVector
)

@Composable
fun OnboardingScreen(
    onContinue: () -> Unit
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing

    val pillars = listOf(
        OnboardingPillar(
            title = "Zero-Cloud File Transfer",
            description = "High-speed direct WebRTC data channels between your PC and Android without file size restrictions.",
            icon = Icons.Default.SwapHoriz
        ),
        OnboardingPillar(
            title = "Ultra-Low Latency Mirroring",
            description = "Live display casting and interaction on the web dashboard with hardware-accelerated video decoding.",
            icon = Icons.Default.Cast
        ),
        OnboardingPillar(
            title = "Unified Device Synchrony",
            description = "Real-time notification mirroring, battery tracking, and clipboard clipboard bridge across your hardware.",
            icon = Icons.Default.NotificationsActive
        )
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(spacing.lg)
                .systemBarsPadding(),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Header Section
            Column(modifier = Modifier.padding(top = spacing.md)) {
                Surface(
                    color = colors.primary.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(50),
                    border = androidx.compose.foundation.BorderStroke(1.dp, colors.primary.copy(alpha = 0.3f))
                ) {
                    Text(
                        text = "WELCOME TO VIRUX",
                        color = colors.accent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.5.sp,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }

                Spacer(modifier = Modifier.height(spacing.md))

                Text(
                    text = "Seamless Android & PC Unification",
                    color = colors.textPrimary,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 36.sp
                )

                Text(
                    text = "Control, mirror, and transfer seamlessly through an encrypted peer-to-peer ecosystem.",
                    color = colors.textSecondary,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(top = spacing.sm)
                )
            }

            // Feature Pillars Cards
            Column(
                verticalArrangement = Arrangement.spacedBy(spacing.md),
                modifier = Modifier.padding(vertical = spacing.md)
            ) {
                pillars.forEach { pillar ->
                    Surface(
                        color = colors.card,
                        shape = RoundedCornerShape(16.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(spacing.md),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(spacing.md)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(46.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(colors.primary.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = pillar.icon,
                                    contentDescription = null,
                                    tint = colors.accent,
                                    modifier = Modifier.size(22.dp)
                                )
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = pillar.title,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = colors.textPrimary
                                )
                                Text(
                                    text = pillar.description,
                                    fontSize = 12.sp,
                                    color = colors.textSecondary,
                                    lineHeight = 17.sp,
                                    modifier = Modifier.padding(top = 2.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Bottom CTA
            Column(modifier = Modifier.fillMaxWidth()) {
                ViruxButton(
                    text = "Enter Ecosystem",
                    icon = androidx.compose.material.icons.Icons.AutoMirrored.Filled.ArrowForward,
                    variant = ViruxButtonVariant.Accent,
                    onClick = onContinue,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(spacing.sm))

                Text(
                    text = "Firebase virux-504a5 · End-to-End Encrypted",
                    color = colors.textSecondary,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
