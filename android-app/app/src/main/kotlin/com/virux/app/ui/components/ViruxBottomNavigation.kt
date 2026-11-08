package com.virux.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.virux.app.ui.navigation.ViruxRoute
import com.virux.app.ui.theme.ViruxTheme

sealed class BottomNavItem(
    val route: String,
    val title: String,
    val icon: ImageVector
) {
    data object Home : BottomNavItem(ViruxRoute.Home.route, "Home", Icons.Default.Home)
    data object Pairing : BottomNavItem(ViruxRoute.Pairing.route, "Pairing", Icons.Default.QrCodeScanner)
    data object Permissions : BottomNavItem(ViruxRoute.Permissions.route, "Security", Icons.Default.Security)
    data object Settings : BottomNavItem(ViruxRoute.Settings.route, "Settings", Icons.Default.Settings)
}

@Composable
fun ViruxBottomNavigation(
    currentRoute: String?,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = ViruxTheme.colors
    val items = listOf(
        BottomNavItem.Home,
        BottomNavItem.Pairing,
        BottomNavItem.Permissions,
        BottomNavItem.Settings
    )

    NavigationBar(
        containerColor = colors.secondaryBackground,
        contentColor = colors.textSecondary,
        tonalElevation = 8.dp,
        modifier = modifier
    ) {
        items.forEach { item ->
            val isSelected = currentRoute == item.route

            NavigationBarItem(
                selected = isSelected,
                onClick = { onNavigate(item.route) },
                icon = {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.title
                    )
                },
                label = {
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.labelSmall
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = colors.textPrimary,
                    selectedTextColor = colors.accent,
                    indicatorColor = colors.primary,
                    unselectedIconColor = colors.textSecondary,
                    unselectedTextColor = colors.textSecondary
                )
            )
        }
    }
}

