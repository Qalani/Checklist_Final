package com.zenworkspace.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
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
    var menu by remember { mutableStateOf(false) }
    val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                expandedHeight = 56.dp,
                title = {
                    Text(
                        if (state.userId == null) "Zen Workspace" else WorkspaceDestinations.find(section)?.label ?: "Workspace",
                        style = MaterialTheme.typography.titleLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                actions = {
                    if (state.userId != null) {
                        IconButton(onClick = onRefresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, "Sync workspace") }
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Default.Menu, "Workspace sections") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                WorkspaceDestinations.all.forEach { destination ->
                                    DropdownMenuItem(
                                        text = { Text(destination.label) },
                                        leadingIcon = { Icon(destination.icon, null) },
                                        onClick = { onSection(destination.id); menu = false },
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
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.pending > 0) {
                Text(
                    "${state.pending} change${if (state.pending == 1) "" else "s"} waiting to sync",
                    Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            content()
        }
    }
}

@Composable
internal fun WorkspaceBottomBar(items: List<String>, section: String, onSection: (String) -> Unit) {
    val density = LocalDensity.current
    val barHeight = if (density.fontScale > 1.2f) 80.dp else 64.dp
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    NavigationBar(
        modifier = Modifier.fillMaxWidth().height(barHeight + bottomInset).testTag("workspace-bottom-bar"),
    ) {
        items.mapNotNull(WorkspaceDestinations::find).forEach { item ->
            NavigationBarItem(
                modifier = Modifier.testTag("bottom-item-${item.id}"),
                selected = section == item.id,
                onClick = { onSection(item.id) },
                icon = { Icon(item.icon, item.label) },
                label = { Text(item.label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                alwaysShowLabel = true,
            )
        }
    }
}
