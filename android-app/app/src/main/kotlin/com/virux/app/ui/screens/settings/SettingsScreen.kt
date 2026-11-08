package com.virux.app.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseAuth
import com.virux.app.ui.components.*
import com.virux.app.ui.navigation.ViruxRoute
import com.virux.app.ui.screens.auth.AuthViewModel
import com.virux.app.ui.theme.ViruxTheme

@Composable
fun SettingsScreen(
    viewModel: AuthViewModel? = null,
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit = {}
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing
    val scrollState = rememberScrollState()

    var autoStartOnBoot by remember { mutableStateOf(true) }
    var localWifiOnly by remember { mutableStateOf(true) }
    var backgroundHeartbeat by remember { mutableStateOf(false) }

    val user = FirebaseAuth.getInstance().currentUser
    val displayName = user?.displayName ?: user?.email?.substringBefore('@') ?: "VIRUX User"
    val email = user?.email ?: "No email attached"
    val initials = displayName.split(" ")
        .mapNotNull { it.firstOrNull()?.toString() }
        .take(2)
        .joinToString("")
        .uppercase()
        .ifEmpty { "VX" }

    Scaffold(
        topBar = {
            ViruxTopBar(
                title = "Settings",
                subtitle = "App Configuration & Ecosystem",
                showBackButton = true,
                onBackClick = { onNavigate(ViruxRoute.Home.route) }
            )
        },
        bottomBar = {
            ViruxBottomNavigation(
                currentRoute = ViruxRoute.Settings.route,
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
            verticalArrangement = Arrangement.spacedBy(spacing.lg)
        ) {
            // ─── 1. User Profile Active Session Card ───────────────
            ViruxCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(spacing.md)
                ) {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .background(colors.primary),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initials,
                            color = colors.textPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(spacing.xs)
                        ) {
                            Text(
                                text = displayName,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = colors.textPrimary
                            )
                            Surface(
                                color = colors.primary.copy(alpha = 0.2f),
                                shape = RoundedCornerShape(4.dp)
                            ) {
                                Text(
                                    text = if (user?.isEmailVerified == true) "VERIFIED" else "SPARK",
                                    color = colors.accent,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                )
                            }
                        }

                        Text(
                            text = email,
                            fontSize = 12.sp,
                            color = colors.textSecondary
                        )

                        Text(
                            text = "UID: ${user?.uid?.take(16) ?: "Offline"}...",
                            fontSize = 10.sp,
                            color = colors.textSecondary.copy(alpha = 0.6f),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(spacing.md))

                ViruxButton(
                    text = "Sign Out",
                    icon = Icons.AutoMirrored.Filled.Logout,
                    variant = ViruxButtonVariant.Danger,
                    onClick = {
                        if (viewModel != null) {
                            viewModel.logout { onSignOut() }
                        } else {
                            FirebaseAuth.getInstance().signOut()
                            onSignOut()
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // ─── 2. Application Preferences ───────────────────────
            SectionHeader(
                title = "Application Preferences",
                subtitle = "Background operation and connection rules"
            )

            ViruxCard {
                Column(verticalArrangement = Arrangement.spacedBy(spacing.md)) {
                    SettingToggleRow(
                        title = "Auto-Start Service",
                        description = "Launch VIRUX background synchronization service on device boot",
                        icon = Icons.Default.PowerSettingsNew,
                        checked = autoStartOnBoot,
                        onCheckedChange = { autoStartOnBoot = it }
                    )

                    HorizontalDivider(color = colors.border)

                    SettingToggleRow(
                        title = "Local Network Mesh Only",
                        description = "Restrict peer connections strictly to local Wi-Fi subnet",
                        icon = Icons.Default.WifiLock,
                        checked = localWifiOnly,
                        onCheckedChange = { localWifiOnly = it }
                    )

                    HorizontalDivider(color = colors.border)

                    SettingToggleRow(
                        title = "Background Heartbeat",
                        description = "Transmit periodic state pings to Firestore (increases battery consumption)",
                        icon = Icons.Default.Favorite,
                        checked = backgroundHeartbeat,
                        onCheckedChange = { backgroundHeartbeat = it }
                    )
                }
            }

            // ─── 3. About VIRUX Information ────────────────────────
            SectionHeader(
                title = "About VIRUX",
                subtitle = "Ecosystem metadata and license specifications"
            )

            ViruxCard {
                Column(verticalArrangement = Arrangement.spacedBy(spacing.sm)) {
                    AboutInfoRow("Application Version", "0.1.0-alpha (Phase 3 Auth)")
                    AboutInfoRow("Android Target SDK", "API 35 (Android 15)")
                    AboutInfoRow("Package Name", "com.virux.app")
                    AboutInfoRow("Firebase Project ID", "virux-504a5")
                    AboutInfoRow("Authentication", "Firebase Auth + Coroutines")
                    AboutInfoRow("License", "VIRUX Proprietary Ecosystem")
                }
            }

            Spacer(modifier = Modifier.height(spacing.md))
        }
    }
}

@Composable
private fun SettingToggleRow(
    title: String,
    description: String,
    icon: ImageVector,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = colors.primary,
                modifier = Modifier.size(20.dp)
            )
            Column {
                Text(
                    text = title,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                    color = colors.textPrimary
                )
                Text(
                    text = description,
                    fontSize = 11.sp,
                    color = colors.textSecondary,
                    lineHeight = 15.sp
                )
            }
        }

        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = colors.accent,
                checkedTrackColor = colors.primary,
                uncheckedThumbColor = colors.textSecondary,
                uncheckedTrackColor = colors.surfaceVariant
            )
        )
    }
}

@Composable
private fun AboutInfoRow(label: String, value: String) {
    val colors = ViruxTheme.colors

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = colors.textSecondary
        )
        Text(
            text = value,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = colors.textPrimary
        )
    }
}
