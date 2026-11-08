package com.virux.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virux.app.ui.theme.ViruxTheme

enum class ViruxButtonVariant {
    Primary,
    Accent,
    Secondary,
    Danger,
    Ghost
}

@Composable
fun ViruxButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ViruxButtonVariant = ViruxButtonVariant.Primary,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    comingSoon: Boolean = false,
) {
    val colors = ViruxTheme.colors
    val spacing = ViruxTheme.spacing

    val containerColor = when (variant) {
        ViruxButtonVariant.Primary -> colors.primary
        ViruxButtonVariant.Accent -> colors.accent
        ViruxButtonVariant.Secondary -> colors.surfaceVariant
        ViruxButtonVariant.Danger -> colors.error.copy(alpha = 0.2f)
        ViruxButtonVariant.Ghost -> Color.Transparent
    }

    val contentColor = when (variant) {
        ViruxButtonVariant.Primary -> colors.textPrimary
        ViruxButtonVariant.Accent -> colors.background
        ViruxButtonVariant.Secondary -> colors.textPrimary
        ViruxButtonVariant.Danger -> colors.error
        ViruxButtonVariant.Ghost -> colors.textSecondary
    }

    val border = when (variant) {
        ViruxButtonVariant.Secondary -> BorderStroke(1.dp, colors.border)
        ViruxButtonVariant.Danger -> BorderStroke(1.dp, colors.error.copy(alpha = 0.4f))
        else -> null
    }

    Button(
        onClick = {
            if (!comingSoon) {
                onClick()
            }
        },
        enabled = enabled,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor.copy(alpha = 0.5f),
            disabledContentColor = contentColor.copy(alpha = 0.5f),
        ),
        border = border,
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
        modifier = modifier
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(spacing.sm))
        }

        Text(
            text = text,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            letterSpacing = 0.5.sp
        )

        if (comingSoon) {
            Spacer(modifier = Modifier.width(spacing.sm))
            Surface(
                color = Color.Black.copy(alpha = 0.35f),
                shape = RoundedCornerShape(4.dp),
                modifier = Modifier.padding(start = 2.dp)
            ) {
                Text(
                    text = "SOON",
                    color = colors.accent,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                )
            }
        }
    }
}

