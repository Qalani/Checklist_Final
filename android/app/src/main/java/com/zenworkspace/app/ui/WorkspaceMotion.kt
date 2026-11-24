package com.zenworkspace.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
internal fun WorkspaceProgressHero(
    title: String,
    detail: String,
    complete: Int,
    total: Int,
    onOpenTasks: (() -> Unit)? = null,
) {
    val progress = if (total == 0) 0f else (complete.toFloat() / total).coerceIn(0f, 1f)
    val ring = remember { Animatable(0f) }
    LaunchedEffect(progress) {
        ring.animateTo(progress, tween(durationMillis = 660, easing = FastOutSlowInEasing))
    }
    val action = if (onOpenTasks == null) Modifier else Modifier
        .clip(MaterialTheme.shapes.extraLarge)
        .clickable(onClickLabel = "Open tasks", role = Role.Button, onClick = onOpenTasks)
    WorkspaceBanner(Modifier.fillMaxWidth().then(action)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 116.dp).padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.headlineSmall, color = Color.White)
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.88f))
            }
            Box(
                Modifier.size(78.dp).semantics {
                    progressBarRangeInfo = ProgressBarRangeInfo(progress, 0f..1f)
                },
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    val stroke = 6.dp.toPx()
                    val diameter = size.minDimension - stroke
                    val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
                    val arcSize = Size(diameter, diameter)
                    val style = Stroke(stroke, cap = StrokeCap.Round)
                    drawArc(Color.White.copy(alpha = 0.24f), -90f, 360f, false, topLeft, arcSize, style = style)
                    if (ring.value > 0f) {
                        drawArc(Color(0xFFF5DDFF), -90f, 360f * ring.value, false, topLeft, arcSize, style = style)
                    }
                }
                Text(
                    "${(progress * 100f).roundToInt()}%",
                    modifier = Modifier.clearAndSetSemantics {},
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                )
            }
        }
    }
}

@Composable
internal fun WorkspaceCompletionToggle(
    checked: Boolean,
    enabled: Boolean,
    tone: WorkspaceTone,
    onCheckedChange: (Boolean) -> Unit,
) {
    val progress by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        animationSpec = tween(durationMillis = 340),
        label = "completion halo",
    )
    Checkbox(
        checked = checked,
        onCheckedChange = onCheckedChange,
        enabled = enabled,
        colors = CheckboxDefaults.colors(checkedColor = tone.ink, checkmarkColor = tone.onInk),
        modifier = Modifier.size(48.dp).drawBehind {
            val pulse = (1f - abs(2f * progress - 1f)) * 0.62f
            if (pulse > 0.01f) {
                drawCircle(tone.accent.copy(alpha = pulse), 10.dp.toPx() + progress * 10.dp.toPx(),
                    style = Stroke(2.dp.toPx()))
            }
        },
    )
}
