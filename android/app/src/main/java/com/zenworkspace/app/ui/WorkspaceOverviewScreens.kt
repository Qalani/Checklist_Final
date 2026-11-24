package com.zenworkspace.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.zenworkspace.app.BuildConfig
import com.zenworkspace.app.data.WorkspaceState

@Composable
internal fun HomeScreen(state: WorkspaceState, navigate: (String) -> Unit) {
    val tasks = state.table("tasks")
    val completed = tasks.count { it.bool("completed") }
    val remaining = tasks.size - completed
    LazyVerticalGrid(
        columns = GridCells.Adaptive(280.dp),
        modifier = Modifier.fillMaxSize().testTag("home-grid"),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            WorkspaceProgressHero(
                title = if (remaining == 1) "1 task left" else "$remaining tasks left",
                detail = "$completed of ${tasks.size} complete",
                complete = completed,
                total = tasks.size,
                onOpenTasks = { navigate("tasks") },
            )
        }
        items(WorkspaceDestinations.all.filter { it.id !in listOf("home", "settings", "categories") }, key = { it.id }) { destination ->
            val count = when (destination.id) {
                "tasks" -> remaining
                "insights" -> completed
                else -> state.table(destination.id).size
            }
            val tone = workspaceTone(destination.id)
            Card(
                onClick = { navigate(destination.id) },
                modifier = Modifier.fillMaxWidth().animateItem().testTag("home-card-${destination.id}"),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = tone.fill, contentColor = tone.ink),
            ) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AccentIcon(destination.icon, tone.copy(fill = MaterialTheme.colorScheme.surface), size = 36.dp)
                    Text(destination.label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    Text(count.toString(), style = MaterialTheme.typography.titleLarge)
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, null, modifier = Modifier.size(17.dp))
                }
            }
        }
    }
}

@Composable
internal fun InsightsScreen(state: WorkspaceState) {
    val tasks = state.table("tasks")
    val complete = tasks.count { it.bool("completed") }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(240.dp),
        modifier = Modifier.fillMaxSize().testTag("insights-grid"),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            WorkspaceProgressHero(
                title = "$complete of ${tasks.size} tasks complete",
                detail = "${tasks.size - complete} remaining",
                complete = complete,
                total = tasks.size,
            )
        }
        items(tasks.groupBy { it.text("category").ifBlank { "Uncategorised" } }.toList(), key = { it.first }) { (category, rows) ->
            val tone = workspaceTone("insights")
            val categoryComplete = rows.count { it.bool("completed") }
            val progress by animateFloatAsState(
                targetValue = categoryComplete.toFloat() / rows.size,
                animationSpec = tween(durationMillis = 360),
                label = "category progress",
            )
            OutlinedCard(
                modifier = Modifier.fillMaxWidth().animateItem(),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(category, style = MaterialTheme.typography.titleMedium)
                    Text("$categoryComplete / ${rows.size} complete", color = tone.ink, style = MaterialTheme.typography.labelLarge)
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth().height(5.dp),
                        color = tone.ink,
                        trackColor = tone.fill,
                    )
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text("${state.table("notes").size} notes · ${state.table("lists").size} lists · ${state.table("zen_reminders").size} reminders",
                Modifier.padding(2.dp), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

internal data class SettingsActions(
    val editNavigation: () -> Unit,
    val notifications: () -> Unit,
    val exportBackup: () -> Unit,
    val importBackup: () -> Unit,
    val importCalendar: () -> Unit,
    val exportPending: () -> Unit,
    val discardPending: () -> Unit,
    val signOut: () -> Unit,
)

@Composable
internal fun SettingsContent(
    email: String,
    theme: String,
    setTheme: (String) -> Unit,
    bottomItems: List<String>,
    pending: Int,
    actions: SettingsActions,
) {
    var themeMenu by remember { mutableStateOf(false) }
    val themes = listOf("system" to "Use device theme", "zen" to "Zen Light", "dawn" to "Dawn Light",
        "midnight" to "Midnight Dark", "forest" to "Forest Dark")
    LazyVerticalGrid(
        columns = GridCells.Adaptive(300.dp),
        modifier = Modifier.fillMaxSize().testTag("settings-grid"),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            val tone = workspaceTone("settings")
            Surface(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large, color = tone.fill, contentColor = tone.ink) {
                Row(
                    Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AccentIcon(Icons.Default.Person, tone.copy(fill = MaterialTheme.colorScheme.surface), size = 38.dp)
                    Text(email, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            val tone = workspaceTone("home")
            OutlinedCard(
                onClick = actions.editNavigation,
                modifier = Modifier.fillMaxWidth().testTag("edit-bottom-bar"),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    AccentIcon(Icons.Default.Tune, tone)
                    Column(Modifier.weight(1f)) {
                        Text("Bottom bar", style = MaterialTheme.typography.titleSmall)
                        Text(bottomItems.mapNotNull { WorkspaceDestinations.find(it)?.label }.joinToString(" · ").ifBlank { "Hidden · use the menu to switch pages" },
                            style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    Text("Edit", color = MaterialTheme.colorScheme.primary)
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Box {
                val tone = workspaceTone("notes")
                OutlinedCard(
                    onClick = { themeMenu = true },
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.large,
                    colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AccentIcon(Icons.Default.Palette, tone)
                        Text("Appearance: ${themes.firstOrNull { it.first == theme }?.second ?: "Use device theme"}",
                            Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                        Icon(Icons.Default.ExpandMore, null, tint = tone.ink)
                    }
                }
                DropdownMenu(expanded = themeMenu, onDismissRequest = { themeMenu = false }) {
                    themes.forEach { (id, name) ->
                        DropdownMenuItem(text = { Text(name) }, onClick = { setTheme(id); themeMenu = false })
                    }
                }
            }
        }
        item { SettingsButton("Enable notifications", Icons.Default.Notifications, "zen_reminders", actions.notifications) }
        item { SettingsButton("Export workspace backup", Icons.Default.Download, "lists", actions.exportBackup) }
        item { SettingsButton("Import workspace backup", Icons.Default.FileUpload, "lists", actions.importBackup) }
        item { SettingsButton("Import calendar (.ics)", Icons.Default.CalendarMonth, "calendar_events", actions.importCalendar) }
        if (pending > 0) {
            item { SettingsButton("Export pending changes", Icons.Default.Restore, "lists", actions.exportPending) }
            item { SettingsButton("Discard pending changes", Icons.Default.DeleteOutline, "notes", actions.discardPending) }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text("Backups contain personal workspace data. Store them somewhere private. Imports create new copies.",
                Modifier.padding(horizontal = 2.dp, vertical = 2.dp), style = MaterialTheme.typography.bodySmall)
        }
        item { SettingsButton("Sign out", Icons.AutoMirrored.Filled.ExitToApp, "friends", actions.signOut) }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text("Zen Workspace ${BuildConfig.VERSION_NAME}", Modifier.padding(2.dp), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun SettingsButton(label: String, icon: ImageVector, section: String, onClick: () -> Unit) {
    val tone = workspaceTone(section)
    OutlinedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AccentIcon(icon, tone, size = 34.dp)
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
        }
    }
}
