package com.virux.app.ui.screens.permissions

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virux.app.ui.components.*
import com.virux.app.ui.navigation.ViruxRoute
import com.virux.app.ui.theme.ViruxTheme

@Composable
fun PermissionCenterScreen(
    onNavigate: (String) -> Unit
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            ViruxTopBar(
                title = "Permission Center",
                subtitle = "Security & System Access",
                showBackButton = true,
                onBackClick = { onNavigate(ViruxRoute.Home.route) }
            )
        },
        bottomBar = {
            ViruxBottomNavigation(
                currentRoute = ViruxRoute.Permissions.route,
                onNavigate = onNavigate
            )
        },
        containerColor = colors.background
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(scrollState)
                .padding(horizontal = spacing.md, vertical = spacing.sm),
            verticalArrangement = Arrangement.spacedBy(spacing.md)
        ) {
            // Explanation Banner
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
                    Icon(
                        imageVector = Icons.Default.Security,
                        contentDescription = null,
                        tint = colors.accent,
                        modifier = Modifier.size(28.dp)
                    )
                    Column {
                        Text(
                            text = "Granular Access Control",
                            color = colors.textPrimary,
                            fontSize = 14.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                        )
                        Text(
                            text = "VIRUX operates under strict least-privilege principles. Permissions are only requested when needed by user-initiated actions.",
                            color = colors.textSecondary,
                            fontSize = 11.sp,
                            lineHeight = 16.sp
                        )
                    }
                }
            }

            SectionHeader(
                title = "Required Capabilities",
                subtitle = "Permissions necessary for remote device ecosystem integration"
            )

            // 1. Notifications
            PermissionCard(
                title = "Notifications & Mirroring",
                purposeExplanation = "Allows VIRUX to listen for incoming Android notifications and securely mirror them to your PC dashboard in real-time.",
                icon = Icons.Default.Notifications,
                isGranted = true,
                onConfigureClick = {}
            )

            // 2. Screen Mirroring (MediaProjection)
            PermissionCard(
                title = "Display Capture (MediaProjection)",
                purposeExplanation = "Enables hardware-accelerated screen casting to your PC browser. Only active during explicit mirroring sessions.",
                icon = Icons.Default.Cast,
                isGranted = false,
                onConfigureClick = {}
            )

            // 3. Camera
            PermissionCard(
                title = "Camera (QR Scanner)",
                purposeExplanation = "Required solely to scan dashboard authentication QR codes when pairing with a new PC.",
                icon = Icons.Default.PhotoCamera,
                isGranted = true,
                onConfigureClick = {}
            )

            // 4. Storage & Media
            PermissionCard(
                title = "Shared Storage & Files",
                purposeExplanation = "Permits direct peer-to-peer file transfers and saving received documents to your device storage.",
                icon = Icons.Default.Folder,
                isGranted = true,
                onConfigureClick = {}
            )

            // Guidance Card
            Surface(
                color = colors.secondaryBackground,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(spacing.md)) {
                    Text(
                        text = "Android System Note",
                        color = colors.accent,
                        fontSize = 12.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                    Text(
                        text = "To grant or revoke permissions, open Android System Settings > Apps > VIRUX > Permissions. Dynamic runtime permission prompts will trigger upon first use in Phase 4.",
                        color = colors.textSecondary,
                        fontSize = 11.sp,
                        lineHeight = 16.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(spacing.md))
        }
    }
}

