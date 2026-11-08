package com.virux.app.ui.navigation

/**
 * VIRUX — Navigation Routes
 *
 * Defines all navigation destinations across VIRUX Android Application.
 */
sealed class ViruxRoute(val route: String) {
    data object Splash : ViruxRoute("splash")
    data object Onboarding : ViruxRoute("onboarding")
    data object Login : ViruxRoute("login")
    data object Register : ViruxRoute("register")
    data object ForgotPassword : ViruxRoute("forgot_password")
    data object Home : ViruxRoute("home")
    data object Pairing : ViruxRoute("pairing")
    data object Permissions : ViruxRoute("permissions")
    data object Settings : ViruxRoute("settings")
}
