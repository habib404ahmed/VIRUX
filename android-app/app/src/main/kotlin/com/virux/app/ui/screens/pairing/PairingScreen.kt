package com.virux.app.ui.screens.pairing

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.concurrent.futures.await
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.virux.app.ui.components.*
import com.virux.app.ui.navigation.ViruxRoute
import com.virux.app.ui.theme.ViruxTheme
import java.util.concurrent.Executors

@Composable
fun PairingScreen(
    onNavigate: (String) -> Unit,
    viewModel: PairingViewModel = viewModel()
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing
    val scrollState = rememberScrollState()

    val uiState by viewModel.uiState.collectAsState()
    val pinCode by viewModel.pinCode.collectAsState()

    var activeTab by remember { mutableIntStateOf(0) } // 0: QR Scan, 1: Pairing PIN Code
    var showManualPayloadDialog by remember { mutableStateOf(false) }
    var manualPayloadInput by remember { mutableStateOf("") }

    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    Scaffold(
        topBar = {
            ViruxTopBar(
                title = "Device Pairing",
                subtitle = "Connect PC Web Dashboard",
                showBackButton = true,
                onBackClick = { onNavigate(ViruxRoute.Home.route) }
            )
        },
        bottomBar = {
            ViruxBottomNavigation(
                currentRoute = ViruxRoute.Pairing.route,
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
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.lg)
        ) {
            // ─── Mode Selector Tabs ────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.card, RoundedCornerShape(12.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                TabButton(
                    title = "QR Scanner",
                    isSelected = activeTab == 0,
                    onClick = {
                        activeTab = 0
                        viewModel.resetState()
                    },
                    modifier = Modifier.weight(1f)
                )
                TabButton(
                    title = "Pairing PIN",
                    isSelected = activeTab == 1,
                    onClick = {
                        activeTab = 1
                        viewModel.resetState()
                    },
                    modifier = Modifier.weight(1f)
                )
            }

            // ─── State Machine View ────────────────────────────────
            when (val state = uiState) {
                is PairingUiState.Processing -> {
                    ViruxCard {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = spacing.xl),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(spacing.md)
                        ) {
                            CircularProgressIndicator(
                                color = colors.accent,
                                modifier = Modifier.size(48.dp)
                            )
                            Text(
                                text = "Establishing Cryptographic Handshake",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = colors.textPrimary
                            )
                            Text(
                                text = "Signing challenge buffer with Android Keystore & registering hardware...",
                                fontSize = 12.sp,
                                color = colors.textSecondary,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                is PairingUiState.Success -> {
                    ViruxCard {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = spacing.lg),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(spacing.md)
                        ) {
                            Surface(
                                color = colors.success.copy(alpha = 0.15f),
                                shape = CircleShape,
                                modifier = Modifier.size(64.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = colors.success,
                                        modifier = Modifier.size(36.dp)
                                    )
                                }
                            }

                            Text(
                                text = "Device Paired Successfully!",
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp,
                                color = colors.textPrimary
                            )

                            Text(
                                text = "${state.device.deviceName} is now cryptographically linked to your VIRUX mesh.",
                                fontSize = 12.sp,
                                color = colors.textSecondary,
                                textAlign = TextAlign.Center
                            )

                            ViruxButton(
                                text = "Return to Dashboard",
                                variant = ViruxButtonVariant.Accent,
                                onClick = { onNavigate(ViruxRoute.Home.route) },
                                modifier = Modifier.fillMaxWidth().padding(top = spacing.sm)
                            )
                        }
                    }
                }

                is PairingUiState.Error -> {
                    ViruxCard {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = spacing.md),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(spacing.sm)
                        ) {
                            Icon(
                                imageVector = Icons.Default.ErrorOutline,
                                contentDescription = null,
                                tint = colors.error,
                                modifier = Modifier.size(40.dp)
                            )
                            Text(
                                text = "Pairing Failed",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = colors.error
                            )
                            Text(
                                text = state.message,
                                fontSize = 12.sp,
                                color = colors.textSecondary,
                                textAlign = TextAlign.Center
                            )

                            ViruxButton(
                                text = "Try Again",
                                variant = ViruxButtonVariant.Secondary,
                                onClick = { viewModel.resetState() },
                                modifier = Modifier.padding(top = spacing.sm)
                            )
                        }
                    }
                }

                is PairingUiState.Idle -> {
                    if (activeTab == 0) {
                        // ─── Mode 0: CameraX QR Scanner ───────────────────
                        ViruxCard {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "Scan Dashboard QR Code",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = colors.textPrimary
                                )

                                Text(
                                    text = "Point camera at the pairing QR code on the PC Web Dashboard.",
                                    fontSize = 12.sp,
                                    color = colors.textSecondary,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(top = spacing.xs, bottom = spacing.md)
                                )

                                if (hasCameraPermission) {
                                    Box(
                                        modifier = Modifier
                                            .size(240.dp)
                                            .clip(RoundedCornerShape(20.dp))
                                            .border(BorderStroke(2.dp, colors.accent), RoundedCornerShape(20.dp)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        CameraScannerPreview(
                                            onBarcodeDetected = { qrString ->
                                                viewModel.onQrScanned(qrString)
                                            }
                                        )

                                        // Reticle overlay
                                        Box(
                                            modifier = Modifier
                                                .size(180.dp)
                                                .border(BorderStroke(2.dp, colors.primary.copy(alpha = 0.8f)), RoundedCornerShape(12.dp))
                                        )
                                    }
                                } else {
                                    // Camera permission request fallback
                                    Box(
                                        modifier = Modifier
                                            .size(240.dp)
                                            .clip(RoundedCornerShape(20.dp))
                                            .background(colors.background)
                                            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(20.dp)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Column(
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.spacedBy(spacing.sm),
                                            modifier = Modifier.padding(spacing.md)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.CameraAlt,
                                                contentDescription = null,
                                                tint = colors.accent,
                                                modifier = Modifier.size(40.dp)
                                            )
                                            Text(
                                                text = "Camera Permission Required",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = colors.textPrimary,
                                                textAlign = TextAlign.Center
                                            )
                                            Button(
                                                onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                                                colors = ButtonDefaults.buttonColors(containerColor = colors.primary)
                                            ) {
                                                Text("Grant Access", fontSize = 11.sp)
                                            }
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(spacing.md))

                                TextButton(
                                    onClick = { showManualPayloadDialog = true }
                                ) {
                                    Text(
                                        text = "Paste QR Payload Manually (Emulator / Testing)",
                                        fontSize = 11.sp,
                                        color = colors.accent
                                    )
                                }
                            }
                        }
                    } else {
                        // ─── Mode 1: Manual 6-Digit PIN Code ──────────────
                        ViruxCard {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "Enter Dashboard 6-Digit PIN",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = colors.textPrimary
                                )

                                Text(
                                    text = "Enter the 6-digit numeric PIN code generated on your Web Dashboard.",
                                    fontSize = 12.sp,
                                    color = colors.textSecondary,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(top = spacing.xs, bottom = spacing.md)
                                )

                                OutlinedTextField(
                                    value = pinCode,
                                    onValueChange = { viewModel.onPinChange(it) },
                                    modifier = Modifier.width(200.dp),
                                    textStyle = MaterialTheme.typography.headlineMedium.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = FontFamily.Monospace,
                                        textAlign = TextAlign.Center,
                                        color = colors.accent
                                    ),
                                    placeholder = {
                                        Text(
                                            "000000",
                                            modifier = Modifier.fillMaxWidth(),
                                            textAlign = TextAlign.Center,
                                            color = colors.textSecondary.copy(alpha = 0.5f),
                                            fontFamily = FontFamily.Monospace,
                                            fontSize = 24.sp
                                        )
                                    },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = colors.accent,
                                        unfocusedBorderColor = colors.border,
                                        focusedContainerColor = colors.background,
                                        unfocusedContainerColor = colors.background
                                    )
                                )

                                Spacer(modifier = Modifier.height(spacing.lg))

                                ViruxButton(
                                    text = "Connect with PIN",
                                    icon = Icons.Default.Key,
                                    variant = ViruxButtonVariant.Accent,
                                    onClick = { viewModel.submitPin() },
                                    enabled = pinCode.length == 6,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    }
                }
            }

            // ─── Hardware Cryptographic Identity Card ──────────────
            ViruxCard {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(spacing.xs)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Security,
                            contentDescription = null,
                            tint = if (viewModel.securityLevel.isHardwareBacked) colors.success else colors.accent,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Key Security Level",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = colors.textPrimary
                        )
                    }

                    Text(
                        text = viewModel.securityLevel.label,
                        fontSize = 11.sp,
                        color = if (viewModel.securityLevel.isHardwareBacked) colors.success else colors.textSecondary,
                        fontWeight = FontWeight.Medium
                    )

                    HorizontalDivider(
                        color = colors.border.copy(alpha = 0.5f),
                        modifier = Modifier.padding(vertical = 4.dp)
                    )

                    Text(
                        text = "Device UUID: ${viewModel.deviceId}",
                        fontSize = 10.sp,
                        color = colors.textSecondary,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            // ─── Pairing Instructions ──────────────────────────────
            ViruxCard {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(spacing.xs)
                ) {
                    Text(
                        text = "Pairing Protocol",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = colors.textPrimary
                    )
                    Text(
                        text = "1. Sign in to the PC Web Dashboard with this same account.\n2. Click 'Pair Device' to generate an active challenge token.\n3. Scan the QR code or enter the 6-digit PIN.\n4. Device signs the 256-bit challenge with ECDSA P-256.",
                        fontSize = 11.sp,
                        color = colors.textSecondary,
                        lineHeight = 16.sp
                    )
                }
            }
        }
    }

    // Manual QR Payload Dialog for testing / emulators
    if (showManualPayloadDialog) {
        AlertDialog(
            onDismissRequest = { showManualPayloadDialog = false },
            title = { Text("Paste QR JSON Payload", fontSize = 16.sp, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Paste the JSON string encoded in the Web Dashboard QR code:",
                        fontSize = 12.sp,
                        color = colors.textSecondary
                    )
                    OutlinedTextField(
                        value = manualPayloadInput,
                        onValueChange = { manualPayloadInput = it },
                        modifier = Modifier.fillMaxWidth().height(120.dp),
                        placeholder = { Text("{\"v\":1,\"sid\":\"...\"}", fontSize = 11.sp) },
                        textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val input = manualPayloadInput.trim()
                        showManualPayloadDialog = false
                        if (input.isNotEmpty()) {
                            viewModel.onQrScanned(input)
                        }
                    }
                ) {
                    Text("Submit Payload", color = colors.accent)
                }
            },
            dismissButton = {
                TextButton(onClick = { showManualPayloadDialog = false }) {
                    Text("Cancel", color = colors.textSecondary)
                }
            },
            containerColor = colors.card
        )
    }
}

@Composable
fun CameraScannerPreview(
    onBarcodeDetected: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var detected by remember { mutableStateOf(false) }

    val cameraProvider = remember { mutableStateOf<ProcessCameraProvider?>(null) }

    LaunchedEffect(Unit) {
        try {
            val provider = ProcessCameraProvider.getInstance(context).await()
            cameraProvider.value = provider
        } catch (e: Exception) {
            Log.e("VIRUX_Scanner", "ProcessCameraProvider initialization failed", e)
        }
    }

    val provider = cameraProvider.value
    if (provider != null) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val preview = Preview.Builder().build().also {
                    it.surfaceProvider = previewView.surfaceProvider
                }

                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                imageAnalysis.setAnalyzer(Executors.newSingleThreadExecutor()) { imageProxy ->
                    if (!detected) {
                        try {
                            val scannedText = decodeQrFromImageProxy(imageProxy)
                            if (!scannedText.isNullOrBlank()) {
                                detected = true
                                ContextCompat.getMainExecutor(ctx).execute {
                                    onBarcodeDetected(scannedText)
                                }
                            }
                        } catch (e: Exception) {
                            Log.d("VIRUX_Scanner", "Frame decode error: ${e.message}")
                        } finally {
                            imageProxy.close()
                        }
                    } else {
                        imageProxy.close()
                    }
                }

                try {
                    provider.unbindAll()
                    provider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        imageAnalysis
                    )
                } catch (e: Exception) {
                    Log.e("VIRUX_Scanner", "Camera bind failure", e)
                }

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )
    } else {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = ViruxTheme.colors.accent)
        }
    }
}

@Composable
private fun TabButton(
    title: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = ViruxTheme.colors
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) colors.primary else Color.Transparent,
            contentColor = if (isSelected) Color.White else colors.textSecondary
        ),
        shape = RoundedCornerShape(8.dp),
        contentPadding = PaddingValues(vertical = 8.dp),
        modifier = modifier
    ) {
        Text(
            text = title,
            fontSize = 12.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
        )
    }
}

private fun decodeQrFromImageProxy(imageProxy: ImageProxy): String? {
    val buffer = imageProxy.planes[0].buffer
    val bytes = ByteArray(buffer.remaining())
    buffer.get(bytes)

    val width = imageProxy.width
    val height = imageProxy.height

    val source = PlanarYUVLuminanceSource(
        bytes,
        width,
        height,
        0,
        0,
        width,
        height,
        false
    )

    val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
    val reader = MultiFormatReader()
    return try {
        reader.decode(binaryBitmap)?.text
    } catch (_: Exception) {
        null
    }
}
