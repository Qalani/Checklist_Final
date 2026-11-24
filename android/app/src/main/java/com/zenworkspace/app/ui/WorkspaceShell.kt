package com.zenworkspace.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.zenworkspace.app.data.WorkspaceState

/** Own insets once, leaving page content the entire usable viewport. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun WorkspaceShell(
    state: WorkspaceState,
    section: String,
    bottomItems: List<String>,
    onSection: (String) -> Unit,
    onRefresh: () -> Unit,
    onEditNavigation: () -> Unit,
    snackbar: SnackbarHostState,
    content: @Composable ColumnScope.() -> Unit,
) {
    var menu by remember(state.userId) { mutableStateOf(false) }
    val destination = WorkspaceDestinations.find(section)
    val tone = workspaceTone(section)
    val scheme = MaterialTheme.colorScheme
    val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val entrance = remember(state.userId, section) { Animatable(0f) }
    LaunchedEffect(entrance) {
        entrance.animateTo(1f, tween(durationMillis = 240, easing = FastOutSlowInEasing))
    }
    Scaffold(
        containerColor = scheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                expandedHeight = 56.dp,
                colors = TopAppBarDefaults.topAppBarColors(containerColor = scheme.background),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (state.userId == null || section == "home" || destination == null) {
                            WorkspaceMark(Modifier.size(34.dp))
                        } else {
                            AccentIcon(destination.icon, tone, size = 34.dp)
                        }
                        Text(
                            if (state.userId == null) "Zen Workspace" else destination?.label ?: "Workspace",
                            style = MaterialTheme.typography.titleLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                actions = {
                    if (state.userId != null) {
                        IconButton(onClick = onRefresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, "Sync workspace") }
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Default.Menu, "Workspace sections") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                WorkspaceDestinations.all.forEach { item ->
                                    val itemTone = workspaceTone(item.id)
                                    DropdownMenuItem(
                                        text = { Text(item.label) },
                                        leadingIcon = { AccentIcon(item.icon, itemTone, size = 30.dp) },
                                        onClick = { onSection(item.id); menu = false },
                                    )
                                }
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text("Edit bottom bar") },
                                    leadingIcon = { Icon(Icons.Default.Tune, null) },
                                    onClick = { menu = false; onEditNavigation() },
                                )
                            }
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (state.userId != null && !imeVisible && bottomItems.isNotEmpty()) {
                WorkspaceBottomBar(bottomItems, section, onSection)
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding).imePadding()
                .testTag("workspace-content"),
        ) {
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp), color = tone.ink)
            if (state.pending > 0) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.CloudUpload, contentDescription = null, tint = tone.ink, modifier = Modifier.size(16.dp))
                    Text(
                        "${state.pending} change${if (state.pending == 1) "" else "s"} waiting to sync",
                        color = tone.ink,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth().clipToBounds()) {
                Column(Modifier.fillMaxSize().graphicsLayer {
                    alpha = 0.8f + entrance.value * 0.2f
                    translationY = (1f - entrance.value) * 6.dp.toPx()
                }, content = content)
            }
        }
    }
}

@Composable
internal fun WorkspaceBottomBar(items: List<String>, section: String, onSection: (String) -> Unit) {
    val density = LocalDensity.current
    val scheme = MaterialTheme.colorScheme
    val barHeight = if (density.fontScale > 1.2f) 80.dp else 64.dp
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    NavigationBar(
        modifier = Modifier.fillMaxWidth().height(barHeight + bottomInset).testTag("workspace-bottom-bar"),
        containerColor = scheme.surfaceContainer,
        tonalElevation = 0.dp,
    ) {
        items.mapNotNull(WorkspaceDestinations::find).forEach { item ->
            val selected = section == item.id
            val tone = workspaceTone(item.id)
            val iconScale by animateFloatAsState(
                targetValue = if (selected) 1.10f else 1f,
                animationSpec = spring(dampingRatio = 0.65f, stiffness = 650f),
                label = "navigation selection",
            )
            NavigationBarItem(
                modifier = Modifier.testTag("bottom-item-${item.id}"),
                selected = selected,
                onClick = { onSection(item.id) },
                icon = { Icon(item.icon, item.label, Modifier.graphicsLayer { scaleX = iconScale; scaleY = iconScale }) },
                label = { Text(item.label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                alwaysShowLabel = true,
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = tone.ink,
                    indicatorColor = tone.fill,
                    selectedTextColor = tone.ink,
                    unselectedIconColor = scheme.onSurfaceVariant,
                    unselectedTextColor = scheme.onSurfaceVariant,
                ),
            )
        }
    }
}
