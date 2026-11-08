package com.virux.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.virux.app.ui.screens.auth.AuthViewModel
import com.virux.app.ui.screens.auth.ForgotPasswordScreen
import com.virux.app.ui.screens.auth.LoginScreen
import com.virux.app.ui.screens.auth.RegisterScreen
import com.virux.app.ui.screens.home.HomeScreen
import com.virux.app.ui.screens.onboarding.OnboardingScreen
import com.virux.app.ui.screens.pairing.PairingScreen
import com.virux.app.ui.screens.permissions.PermissionCenterScreen
import com.virux.app.ui.screens.settings.SettingsScreen
import com.virux.app.ui.screens.splash.SplashScreen

/**
 * VIRUX — Android Navigation Host
 *
 * Phase 3: Complete Navigation Graph with Authentication Gates:
 * - Splash (Session Persistence Check)
 * - Onboarding
 * - Login
 * - Register
 * - Forgot Password
 * - Home (Protected)
 * - Pairing (Protected)
 * - Permission Center (Protected)
 * - Settings (Protected)
 */
@Composable
fun ViruxNavHost(
    authViewModel: AuthViewModel = remember { AuthViewModel() }
) {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = ViruxRoute.Splash.route,
    ) {
        // ─── Splash Screen ────────────────────────────────────────
        composable(route = ViruxRoute.Splash.route) {
            SplashScreen(
                onSplashComplete = {
                    if (authViewModel.isUserAuthenticated()) {
                        // User already signed in: route straight to Home
                        navController.navigate(ViruxRoute.Home.route) {
                            popUpTo(ViruxRoute.Splash.route) { inclusive = true }
                        }
                    } else {
                        // First-time / unauthenticated: route to Onboarding
                        navController.navigate(ViruxRoute.Onboarding.route) {
                            popUpTo(ViruxRoute.Splash.route) { inclusive = true }
                        }
                    }
                }
            )
        }

        // ─── Onboarding Screen ────────────────────────────────────
        composable(route = ViruxRoute.Onboarding.route) {
            OnboardingScreen(
                onContinue = {
                    navController.navigate(ViruxRoute.Login.route) {
                        popUpTo(ViruxRoute.Onboarding.route) { inclusive = true }
                    }
                }
            )
        }

        // ─── Authentication Destinations ──────────────────────────
        composable(route = ViruxRoute.Login.route) {
            LoginScreen(
                viewModel = authViewModel,
                onLoginSuccess = {
                    navController.navigate(ViruxRoute.Home.route) {
                        popUpTo(ViruxRoute.Login.route) { inclusive = true }
                    }
                },
                onNavigateToRegister = {
                    navController.navigate(ViruxRoute.Register.route)
                },
                onNavigateToForgotPassword = {
                    navController.navigate(ViruxRoute.ForgotPassword.route)
                }
            )
        }

        composable(route = ViruxRoute.Register.route) {
            RegisterScreen(
                viewModel = authViewModel,
                onRegisterSuccess = {
                    navController.navigate(ViruxRoute.Home.route) {
                        popUpTo(ViruxRoute.Login.route) { inclusive = true }
                    }
                },
                onNavigateToLogin = {
                    navController.popBackStack()
                }
            )
        }

        composable(route = ViruxRoute.ForgotPassword.route) {
            ForgotPasswordScreen(
                viewModel = authViewModel,
                onNavigateToLogin = {
                    navController.popBackStack()
                }
            )
        }

        // ─── Protected Dashboard Destinations ─────────────────────
        composable(route = ViruxRoute.Home.route) {
            HomeScreen(
                onNavigate = { route ->
                    if (route != ViruxRoute.Home.route) {
                        navController.navigate(route)
                    }
                }
            )
        }

        composable(route = ViruxRoute.Pairing.route) {
            PairingScreen(
                onNavigate = { route ->
                    navController.navigate(route) {
                        popUpTo(ViruxRoute.Home.route) { inclusive = false }
                        launchSingleTop = true
                    }
                }
            )
        }

        composable(route = ViruxRoute.Permissions.route) {
            PermissionCenterScreen(
                onNavigate = { route ->
                    navController.navigate(route) {
                        popUpTo(ViruxRoute.Home.route) { inclusive = false }
                        launchSingleTop = true
                    }
                }
            )
        }

        composable(route = ViruxRoute.Settings.route) {
            SettingsScreen(
                viewModel = authViewModel,
                onNavigate = { route ->
                    navController.navigate(route) {
                        popUpTo(ViruxRoute.Home.route) { inclusive = false }
                        launchSingleTop = true
                    }
                },
                onSignOut = {
                    navController.navigate(ViruxRoute.Login.route) {
                        popUpTo(ViruxRoute.Home.route) { inclusive = true }
                    }
                }
            )
        }
    }
}
