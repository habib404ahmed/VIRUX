package com.virux.app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virux.app.ui.theme.ViruxTheme

@Composable
fun PermissionCard(
    title: String,
    purposeExplanation: String,
    icon: ImageVector,
    isGranted: Boolean,
    onConfigureClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing

    ViruxCard(
        modifier = modifier,
        backgroundColor = colors.card,
        borderColor = if (isGranted) colors.success.copy(alpha = 0.3f) else colors.border
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(spacing.md)
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .padding(top = 2.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = if (isGranted) colors.success else colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Column {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(spacing.xs)
                    ) {
                        Text(
                            text = title,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = colors.textPrimary
                        )
                        if (isGranted) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = "Granted",
                                tint = colors.success,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }

                    Text(
                        text = purposeExplanation,
                        fontSize = 12.sp,
                        color = colors.textSecondary,
                        lineHeight = 17.sp,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }

            Surface(
                color = if (isGranted) colors.success.copy(alpha = 0.15f) else colors.surfaceVariant,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.padding(start = spacing.sm)
            ) {
                Text(
                    text = if (isGranted) "Granted" else "Required",
                    color = if (isGranted) colors.success else colors.accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}

