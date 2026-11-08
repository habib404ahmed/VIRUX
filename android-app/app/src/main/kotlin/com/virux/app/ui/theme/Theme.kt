package com.virux.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// ============================================================
// VIRUX Design System — Theme
//
// Wraps Material 3 with extended VIRUX-specific tokens.
// Always access brand tokens via ViruxTheme.colors / .spacing.
// ============================================================

// ─── Extended Color Tokens ───────────────────────────────────

@Immutable
data class ViruxColors(
    val background: Color,
    val secondaryBackground: Color,
    val card: Color,
    val surface: Color,
    val surfaceVariant: Color,
    val primary: Color,
    val primaryDark: Color,
    val accent: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val border: Color,
    val divider: Color,
    val overlay: Color,
    val success: Color,
    val warning: Color,
    val error: Color,
    val info: Color,
)

val LocalViruxColors = staticCompositionLocalOf {
    ViruxColors(
        background          = ViruxBackground,
        secondaryBackground = ViruxSecondaryBg,
        card                = ViruxCard,
        surface             = ViruxSurface,
        surfaceVariant      = Color(0xFF1A2235),
        primary             = ViruxPrimary,
        primaryDark         = ViruxPrimaryDark,
        accent              = ViruxAccent,
        textPrimary         = ViruxTextPrimary,
        textSecondary       = ViruxTextSecondary,
        border              = ViruxBorder,
        divider             = ViruxDivider,
        overlay             = ViruxOverlay,
        success             = ViruxSuccess,
        warning             = ViruxWarning,
        error               = ViruxError,
        info                = ViruxInfo,
    )
}

// ─── Extended Spacing Tokens ─────────────────────────────────

@Immutable
data class ViruxSpacing(
    val xs: Dp   = 4.dp,
    val sm: Dp   = 8.dp,
    val md: Dp   = 16.dp,
    val lg: Dp   = 24.dp,
    val xl: Dp   = 32.dp,
    val xxl: Dp  = 48.dp,
    val xxxl: Dp = 64.dp,
)

val LocalViruxSpacing = staticCompositionLocalOf { ViruxSpacing() }

// ─── Material 3 Color Scheme ─────────────────────────────────

private val ViruxDarkColorScheme = darkColorScheme(
    primary          = ViruxPrimary,
    onPrimary        = ViruxTextPrimary,
    primaryContainer = ViruxPrimaryDark,
    secondary        = ViruxAccent,
    onSecondary      = ViruxBackground,
    background       = ViruxBackground,
    onBackground     = ViruxTextPrimary,
    surface          = ViruxSurface,
    onSurface        = ViruxTextPrimary,
    surfaceVariant   = Color(0xFF1A2235),
    onSurfaceVariant = ViruxTextSecondary,
    error            = ViruxError,
    onError          = ViruxTextPrimary,
    outline          = ViruxBorder,
)

// ─── Theme Composable ────────────────────────────────────────

@Composable
fun ViruxTheme(
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(
        LocalViruxColors  provides LocalViruxColors.current,
        LocalViruxSpacing provides ViruxSpacing(),
    ) {
        MaterialTheme(
            colorScheme = ViruxDarkColorScheme,
            typography  = ViruxTypography,
            content     = content,
        )
    }
}

// ─── Convenience Accessors ───────────────────────────────────

/**
 * Access VIRUX extended design tokens in any Composable:
 *
 * ```kotlin
 * val bg = ViruxTheme.colors.background
 * val padding = ViruxTheme.spacing.md
 * ```
 */
object ViruxTheme {
    val colors: ViruxColors
        @Composable get() = LocalViruxColors.current

    val spacing: ViruxSpacing
        @Composable get() = LocalViruxSpacing.current
}

