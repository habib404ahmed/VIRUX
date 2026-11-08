package com.virux.app.ui.screens.auth

import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException
import com.virux.app.R
import com.virux.app.ui.components.ViruxButton
import com.virux.app.ui.components.ViruxButtonVariant
import com.virux.app.ui.components.ViruxCard
import com.virux.app.ui.theme.ViruxTheme

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onNavigateToForgotPassword: () -> Unit
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing
    val focusManager = LocalFocusManager.current
    val scrollState = rememberScrollState()
    val context = LocalContext.current

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    val uiState by viewModel.uiState.collectAsState()

    val googleSignInLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val idToken = account?.idToken
            if (!idToken.isNullOrBlank()) {
                Log.d("VIRUX_AUTH", "Google Sign-In account selected: ${account.email}, authenticating with Firebase...")
                viewModel.signInWithGoogle(idToken)
            } else {
                Log.e("VIRUX_AUTH", "Google Sign-In failed: idToken is null or blank.")
                viewModel.setAuthError("Google Sign-In failed: ID token not received.")
            }
        } catch (e: ApiException) {
            val statusCode = e.statusCode
            val statusString = GoogleSignInStatusCodes.getStatusCodeString(statusCode)
            Log.e("VIRUX_AUTH", "Google Sign-In ApiException: code=$statusCode ($statusString), msg=${e.message}")
            if (statusCode == GoogleSignInStatusCodes.SIGN_IN_CANCELLED) {
                Log.i("VIRUX_AUTH", "Google Sign-In was cancelled by user.")
            } else {
                val errorMessage = when (statusCode) {
                    10 -> "Google Sign-In Developer Error (10): Verify SHA-1 fingerprint registration."
                    12500 -> "Google Sign-In configuration error (12500). Please check Google Play Services."
                    7 -> "Network error during Google Sign-In. Please check your connection."
                    else -> "Google Sign-In failed (${statusCode}: $statusString)"
                }
                viewModel.setAuthError(errorMessage)
            }
        } catch (e: Exception) {
            Log.e("VIRUX_AUTH", "Unexpected error during Google Sign-In", e)
            viewModel.setAuthError("Unexpected error during Google Sign-In: ${e.message}")
        }
    }

    val gso = remember {
        val webClientId = try {
            context.getString(R.string.default_web_client_id)
        } catch (e: Exception) {
            "1000533612172-io7kq6sqkaip3s17hmc41ti6bgopu37e.apps.googleusercontent.com"
        }
        GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(webClientId)
            .requestEmail()
            .build()
    }
    val googleSignInClient = remember {
        GoogleSignIn.getClient(context, gso)
    }

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Success) {
            viewModel.resetState()
            onLoginSuccess()
        }
    }

    Scaffold(
        containerColor = colors.background
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(horizontal = spacing.lg, vertical = spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // ─── Header Logo & Brand ──────────────────────────────
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(colors.primary.copy(alpha = 0.2f))
                        .border(1.dp, colors.primary.copy(alpha = 0.5f), RoundedCornerShape(18.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "V",
                        color = colors.accent,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }

                Spacer(modifier = Modifier.height(spacing.md))

                Text(
                    text = "Sign In to VIRUX",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = colors.textPrimary
                    )
                )

                Text(
                    text = "Your Devices. One Ecosystem.",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = colors.textSecondary
                    ),
                    modifier = Modifier.padding(top = 4.dp, bottom = spacing.xl)
                )

                // ─── Main Input Card ──────────────────────────────────
                ViruxCard {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(spacing.md)
                    ) {
                        // Error Alert Banner
                        if (uiState is AuthUiState.Error) {
                            val errorMessage = (uiState as AuthUiState.Error).message
                            Surface(
                                color = colors.error.copy(alpha = 0.12f),
                                shape = RoundedCornerShape(12.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, colors.error.copy(alpha = 0.3f)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(spacing.md),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(spacing.sm)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.ErrorOutline,
                                        contentDescription = null,
                                        tint = colors.error,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        text = errorMessage,
                                        color = colors.error,
                                        fontSize = 12.sp,
                                        lineHeight = 16.sp
                                    )
                                }
                            }
                        }

                        // Email Field
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Email Address", fontSize = 12.sp) },
                            placeholder = { Text("user@virux.app", fontSize = 12.sp, color = colors.textSecondary.copy(alpha = 0.5f)) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.Email,
                                    contentDescription = null,
                                    tint = colors.textSecondary,
                                    modifier = Modifier.size(18.dp)
                                )
                            },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                imeAction = ImeAction.Next
                            ),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = colors.primary,
                                unfocusedBorderColor = colors.border,
                                focusedTextColor = colors.textPrimary,
                                unfocusedTextColor = colors.textPrimary,
                                focusedLabelColor = colors.primary,
                                unfocusedLabelColor = colors.textSecondary,
                                focusedContainerColor = colors.background,
                                unfocusedContainerColor = colors.background
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        // Password Field
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Password", fontSize = 12.sp) },
                            placeholder = { Text("••••••••••••", fontSize = 12.sp, color = colors.textSecondary.copy(alpha = 0.5f)) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.Lock,
                                    contentDescription = null,
                                    tint = colors.textSecondary,
                                    modifier = Modifier.size(18.dp)
                                )
                            },
                            trailingIcon = {
                                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                    Icon(
                                        imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                        contentDescription = if (passwordVisible) "Hide password" else "Show password",
                                        tint = colors.textSecondary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            },
                            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    focusManager.clearFocus()
                                    viewModel.login(email, password)
                                }
                            ),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = colors.primary,
                                unfocusedBorderColor = colors.border,
                                focusedTextColor = colors.textPrimary,
                                unfocusedTextColor = colors.textPrimary,
                                focusedLabelColor = colors.primary,
                                unfocusedLabelColor = colors.textSecondary,
                                focusedContainerColor = colors.background,
                                unfocusedContainerColor = colors.background
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        // Forgot Password Link
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.CenterEnd
                        ) {
                            Text(
                                text = "Forgot password?",
                                fontSize = 12.sp,
                                color = colors.accent,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.clickable { onNavigateToForgotPassword() }
                            )
                        }

                        Spacer(modifier = Modifier.height(spacing.xs))

                        // Sign In CTA
                        ViruxButton(
                            text = if (uiState is AuthUiState.Loading) "Authenticating..." else "Sign In",
                            icon = Icons.AutoMirrored.Filled.Login,
                            variant = ViruxButtonVariant.Primary,
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.login(email, password)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = uiState !is AuthUiState.Loading
                        )

                        // Divider
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = spacing.xs),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            HorizontalDivider(
                                modifier = Modifier.weight(1f),
                                color = colors.border
                            )
                            Text(
                                text = "OR",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.textSecondary,
                                modifier = Modifier.padding(horizontal = spacing.sm)
                            )
                            HorizontalDivider(
                                modifier = Modifier.weight(1f),
                                color = colors.border
                            )
                        }

                        // Google Sign-In Button
                        val isAuthLoading = uiState is AuthUiState.Loading
                        Surface(
                            color = colors.background,
                            shape = RoundedCornerShape(12.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !isAuthLoading) {
                                    focusManager.clearFocus()
                                    Log.d("VIRUX_AUTH", "Continue with Google tapped. Launching Google Sign-In intent...")
                                    try {
                                        googleSignInClient.signOut().addOnCompleteListener {
                                            googleSignInLauncher.launch(googleSignInClient.signInIntent)
                                        }
                                    } catch (e: Exception) {
                                        Log.e("VIRUX_AUTH", "Failed to launch Google Sign-In intent", e)
                                        viewModel.setAuthError("Failed to launch Google Sign-In: ${e.message}")
                                    }
                                }
                        ) {
                            Row(
                                modifier = Modifier.padding(vertical = 12.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (isAuthLoading) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        color = colors.accent,
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Connecting with Google...",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = colors.textSecondary
                                    )
                                } else {
                                    Text(
                                        text = "Continue with Google",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = colors.textPrimary
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(spacing.lg))

                // ─── Registration Footer ──────────────────────────────
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "Don't have an account? ",
                        fontSize = 12.sp,
                        color = colors.textSecondary
                    )
                    Text(
                        text = "Create Account",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.accent,
                        modifier = Modifier.clickable { onNavigateToRegister() }
                    )
                }

                Spacer(modifier = Modifier.height(spacing.xl))

                Text(
                    text = "Firebase Spark · ID: virux-504a5",
                    fontSize = 10.sp,
                    color = colors.textSecondary.copy(alpha = 0.5f),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

