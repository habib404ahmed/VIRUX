package com.virux.app.ui.screens.home

import android.app.Activity
import android.content.Context
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.virux.app.data.model.SignalingSession
import com.virux.app.service.ViruxScreenMirrorService
import com.virux.app.ui.components.*
import com.virux.app.ui.navigation.ViruxRoute
import com.virux.app.ui.theme.ViruxTheme

@Composable
fun HomeScreen(
    onNavigate: (String) -> Unit,
    viewModel: HomeViewModel = viewModel()
) {
    val context = LocalContext.current
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing
    val scrollState = rememberScrollState()

    val pairedDevice by viewModel.pairedDeviceFlow.collectAsState()
    val isPaired = viewModel.isPaired()
    val telemetry = viewModel.telemetry
    val incomingMirrorSession by viewModel.incomingMirrorSession.collectAsState()
    val incomingFileTransferSession by viewModel.incomingFileTransferSession.collectAsState()
    val activeTransferItem by viewModel.fileTransferItem.collectAsState()
    val incomingFileRequest by viewModel.incomingFileRequest.collectAsState()
    val isFileTransferConnected by viewModel.isFileTransferChannelConnected.collectAsState()

    var pendingConsentSession by remember { mutableStateOf<SignalingSession?>(null) }
    var showCastInfoDialog by remember { mutableStateOf(false) }
    var showFileTransferInfoDialog by remember { mutableStateOf(false) }

    val mediaProjectionManager = remember {
        context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }

    val screenCaptureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val session = pendingConsentSession
        if (result.resultCode == Activity.RESULT_OK && result.data != null && session != null) {
            ViruxScreenMirrorService.startService(
                context = context,
                resultCode = result.resultCode,
                resultData = result.data!!,
                userId = session.ownerUid,
                deviceId = session.deviceId,
                sessionId = session.sessionId
            )
            viewModel.dismissIncomingSession(session.sessionId)
            pendingConsentSession = null
        } else if (session != null) {
            viewModel.rejectMirrorSession(session)
            pendingConsentSession = null
        }
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            viewModel.sendFile(uri)
        }
    }

    Scaffold(
        topBar = {
            ViruxTopBar(
                title = "VIRUX",
                subtitle = "Ecosystem Hub · Android ${telemetry.androidVersion}",
                actions = {
                    IconButton(onClick = { onNavigate(ViruxRoute.Settings.route) }) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings",
                            tint = colors.textPrimary
                        )
                    }
                }
            )
        },
        bottomBar = {
            ViruxBottomNavigation(
                currentRoute = ViruxRoute.Home.route,
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
            // ─── Incoming Screen Mirroring Notification Banner ────
            incomingMirrorSession?.let { session ->
                Surface(
                    color = colors.accent.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(16.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, colors.accent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(spacing.md),
                        verticalArrangement = Arrangement.spacedBy(spacing.sm)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                        ) {
                            Icon(
                                imageVector = Icons.Default.CastConnected,
                                contentDescription = null,
                                tint = colors.accent
                            )
                            Text(
                                text = "Screen Mirror Requested",
                                style = MaterialTheme.typography.titleSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = colors.textPrimary
                                )
                            )
                        }
                        Text(
                            text = "A connected Web Dashboard session is requesting live screen projection via WebRTC.",
                            style = MaterialTheme.typography.bodySmall.copy(color = colors.textSecondary)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                        ) {
                            ViruxButton(
                                text = "Approve Capture",
                                icon = Icons.Default.Check,
                                variant = ViruxButtonVariant.Accent,
                                onClick = {
                                    pendingConsentSession = session
                                    val captureIntent = mediaProjectionManager.createScreenCaptureIntent()
                                    screenCaptureLauncher.launch(captureIntent)
                                },
                                modifier = Modifier.weight(1f)
                            )
                            ViruxButton(
                                text = "Deny",
                                icon = Icons.Default.Close,
                                variant = ViruxButtonVariant.Danger,
                                onClick = {
                                    viewModel.rejectMirrorSession(session)
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            // ─── Incoming File Transfer Session Request Banner ───
            incomingFileTransferSession?.let { session ->
                Surface(
                    color = colors.primary.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(16.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, colors.primary),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(spacing.md),
                        verticalArrangement = Arrangement.spacedBy(spacing.sm)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                        ) {
                            Icon(
                                imageVector = Icons.Default.SwapHoriz,
                                contentDescription = null,
                                tint = colors.primary
                            )
                            Text(
                                text = "File Transfer Channel Requested",
                                style = MaterialTheme.typography.titleSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = colors.textPrimary
                                )
                            )
                        }
                        Text(
                            text = "A connected PC Web Dashboard is requesting a direct WebRTC DataChannel connection for secure file transfers.",
                            style = MaterialTheme.typography.bodySmall.copy(color = colors.textSecondary)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                        ) {
                            ViruxButton(
                                text = "Accept Channel",
                                icon = Icons.Default.Check,
                                variant = ViruxButtonVariant.Accent,
                                onClick = {
                                    viewModel.acceptFileTransferSession(session)
                                },
                                modifier = Modifier.weight(1f)
                            )
                            ViruxButton(
                                text = "Decline",
                                icon = Icons.Default.Close,
                                variant = ViruxButtonVariant.Danger,
                                onClick = {
                                    viewModel.rejectFileTransferSession(session)
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            // ─── Incoming File Request Approval Banner ───────────
            incomingFileRequest?.let { meta ->
                Surface(
                    color = colors.accent.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(16.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, colors.accent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(spacing.md),
                        verticalArrangement = Arrangement.spacedBy(spacing.sm)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                        ) {
                            Icon(
                                imageVector = Icons.Default.FileDownload,
                                contentDescription = null,
                                tint = colors.accent
                            )
                            Text(
                                text = "Incoming File: ${meta.fileName}",
                                style = MaterialTheme.typography.titleSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = colors.textPrimary
                                )
                            )
                        }
                        Text(
                            text = "Size: ${meta.fileSize / 1024} KB · SHA-256 integrity protected. Save to device?",
                            style = MaterialTheme.typography.bodySmall.copy(color = colors.textSecondary)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                        ) {
                            ViruxButton(
                                text = "Accept & Download",
                                icon = Icons.Default.Check,
                                variant = ViruxButtonVariant.Accent,
                                onClick = {
                                    viewModel.acceptIncomingFile(meta.transferId)
                                },
                                modifier = Modifier.weight(1f)
                            )
                            ViruxButton(
                                text = "Reject",
                                icon = Icons.Default.Close,
                                variant = ViruxButtonVariant.Danger,
                                onClick = {
                                    viewModel.rejectIncomingFile(meta.transferId)
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            // ─── Active File Transfer Progress Card ───────────────
            activeTransferItem?.takeIf { it.status.isActive }?.let { item ->
                Surface(
                    color = colors.card,
                    shape = RoundedCornerShape(16.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, colors.primary),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(spacing.md),
                        verticalArrangement = Arrangement.spacedBy(spacing.sm)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                            ) {
                                Icon(
                                    imageVector = if (item.direction == "send") Icons.Default.FileUpload else Icons.Default.FileDownload,
                                    contentDescription = null,
                                    tint = colors.primary
                                )
                                Column {
                                    Text(
                                        text = item.fileName,
                                        style = MaterialTheme.typography.titleSmall.copy(
                                            fontWeight = FontWeight.Bold,
                                            color = colors.textPrimary
                                        )
                                    )
                                    Text(
                                        text = "${item.status.name} · ${item.bytesTransferred / 1024} KB / ${item.fileSize / 1024} KB (${item.progress}%)",
                                        style = MaterialTheme.typography.bodySmall.copy(color = colors.textSecondary)
                                    )
                                }
                            }
                            IconButton(onClick = { viewModel.cancelActiveTransfer() }) {
                                Icon(
                                    imageVector = Icons.Default.Cancel,
                                    contentDescription = "Cancel Transfer",
                                    tint = colors.error
                                )
                            }
                        }

                        LinearProgressIndicator(
                            progress = { item.progress / 100f },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = colors.primary,
                            trackColor = colors.background
                        )
                    }
                }
            }

            // ─── Top Greeting Banner ──────────────────────────────
            Surface(
                color = colors.card,
                shape = RoundedCornerShape(16.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            text = if (isPaired) "Mesh Synchronized" else "Standalone Hardware",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = colors.textPrimary
                            )
                        )
                        Text(
                            text = if (isPaired)
                                "Linked to PC Dashboard · Heartbeat active"
                            else
                                "Ready to pair with PC Web Dashboard",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = if (isPaired) colors.success else colors.accent
                            )
                        )
                    }

                    Surface(
                        color = colors.primary.copy(alpha = 0.2f),
                        shape = CircleShape,
                        border = androidx.compose.foundation.BorderStroke(1.dp, colors.primary.copy(alpha = 0.4f))
                    ) {
                        Text(
                            text = if (isPaired) "PAIRED" else "SPARK TIER",
                            color = if (isPaired) colors.success else colors.primary,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            // ─── Device Connection Status Card ─────────────────────
            SectionHeader(
                title = "Hardware State",
                subtitle = if (isPaired) "Live Firestore synchronization" else "Device telemetry (Unpaired)"
            )

            DeviceStatusCard(
                deviceName = if (isPaired) (pairedDevice?.deviceName ?: telemetry.deviceName) else telemetry.deviceName,
                deviceModel = "${telemetry.manufacturer.replaceFirstChar { it.uppercase() }} ${telemetry.model} · Android ${telemetry.androidVersion}",
                isConnected = isPaired,
                batteryPercentage = telemetry.batteryLevel,
                isCharging = telemetry.isCharging,
                wifiSsid = telemetry.networkType.uppercase(),
                onPairClick = { onNavigate(ViruxRoute.Pairing.route) }
            )

            // ─── Pair or Sync Action Button ───────────────────────
            if (!isPaired) {
                ViruxButton(
                    text = "Pair PC Web Dashboard",
                    icon = Icons.Default.QrCodeScanner,
                    variant = ViruxButtonVariant.Accent,
                    onClick = { onNavigate(ViruxRoute.Pairing.route) },
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                ) {
                    ViruxButton(
                        text = "Sync Telemetry",
                        icon = Icons.Default.Sync,
                        variant = ViruxButtonVariant.Secondary,
                        onClick = { viewModel.triggerSync() },
                        modifier = Modifier.weight(1f)
                    )
                    ViruxButton(
                        text = "Unpair",
                        icon = Icons.Default.LinkOff,
                        variant = ViruxButtonVariant.Danger,
                        onClick = { viewModel.unpair() },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // ─── Quick Actions Grid ────────────────────────────────
            SectionHeader(
                title = "Quick Actions",
                subtitle = "Inter-device transmission channels"
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.sm)
            ) {
                QuickActionCard(
                    title = "Send Files",
                    description = if (isFileTransferConnected) "DataChannel open" else "P2P WebRTC data chunks",
                    icon = Icons.Default.SwapHoriz,
                    onClick = {
                        if (isFileTransferConnected) {
                            filePickerLauncher.launch(arrayOf("*/*"))
                        } else {
                            showFileTransferInfoDialog = true
                        }
                    },
                    comingSoon = false,
                    modifier = Modifier.weight(1f)
                )

                QuickActionCard(
                    title = "Cast Display",
                    description = "MediaProjection mirror",
                    icon = Icons.Default.Cast,
                    onClick = {
                        val session = incomingMirrorSession
                        if (session != null) {
                            pendingConsentSession = session
                            val captureIntent = mediaProjectionManager.createScreenCaptureIntent()
                            screenCaptureLauncher.launch(captureIntent)
                        } else {
                            showCastInfoDialog = true
                        }
                    },
                    comingSoon = false,
                    modifier = Modifier.weight(1f)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.sm)
            ) {
                QuickActionCard(
                    title = "Sync Clipboard",
                    description = "Secure encrypted buffer",
                    icon = Icons.Default.ContentPaste,
                    onClick = { /* Phase 6 feature */ },
                    comingSoon = true,
                    modifier = Modifier.weight(1f)
                )

                QuickActionCard(
                    title = "Permissions",
                    description = "System security checks",
                    icon = Icons.Default.Security,
                    onClick = { onNavigate(ViruxRoute.Permissions.route) },
                    comingSoon = false,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }

    if (showCastInfoDialog) {
        AlertDialog(
            onDismissRequest = { showCastInfoDialog = false },
            title = {
                Text(
                    text = "Cast Display",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
            },
            text = {
                Text(
                    text = "To mirror this screen, open the VIRUX Web Dashboard on your PC, navigate to Screen Mirroring, and click 'Start Mirroring'. When requested, confirm the OS consent prompt on this phone.",
                    style = MaterialTheme.typography.bodyMedium
                )
            },
            confirmButton = {
                TextButton(onClick = { showCastInfoDialog = false }) {
                    Text("Understood", color = colors.primary)
                }
            },
            containerColor = colors.card,
            titleContentColor = colors.textPrimary,
            textContentColor = colors.textSecondary
        )
    }

    if (showFileTransferInfoDialog) {
        AlertDialog(
            onDismissRequest = { showFileTransferInfoDialog = false },
            title = {
                Text(
                    text = "P2P File Transfer",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
            },
            text = {
                Text(
                    text = "To send files directly to your PC, open the VIRUX Web Dashboard, navigate to File Transfer, and click 'Connect Channel'. Once connected, tap 'Send Files' to stream files up to 500 MB over encrypted WebRTC DataChannels.",
                    style = MaterialTheme.typography.bodyMedium
                )
            },
            confirmButton = {
                TextButton(onClick = { showFileTransferInfoDialog = false }) {
                    Text("Understood", color = colors.primary)
                }
            },
            containerColor = colors.card,
            titleContentColor = colors.textPrimary,
            textContentColor = colors.textSecondary
        )
    }
}
