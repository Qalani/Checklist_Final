package com.zenworkspace.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.zenworkspace.app.BuildConfig
import com.zenworkspace.app.data.WorkspaceState

@Composable
internal fun HomeScreen(state: WorkspaceState, navigate: (String) -> Unit) {
    val tasks = state.table("tasks")
    LazyVerticalGrid(
        columns = GridCells.Adaptive(280.dp),
        modifier = Modifier.fillMaxSize().testTag("home-grid"),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text(
                "${tasks.count { !it.bool("completed") }} tasks left · ${tasks.count { it.bool("completed") }} complete",
                modifier = Modifier.padding(horizontal = 2.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        items(WorkspaceDestinations.all.filter { it.id !in listOf("home", "settings", "categories") }, key = { it.id }) { destination ->
            val count = when (destination.id) {
                "tasks" -> tasks.count { !it.bool("completed") }
                "insights" -> tasks.count { it.bool("completed") }
                else -> state.table(destination.id).size
            }
            ElevatedCard(onClick = { navigate(destination.id) }, modifier = Modifier.fillMaxWidth().testTag("home-card-${destination.id}")) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(destination.icon, null, tint = MaterialTheme.colorScheme.primary)
                    Text(destination.label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    Text(count.toString(), color = MaterialTheme.colorScheme.primary)
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
            Column(Modifier.fillMaxWidth().padding(2.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("$complete of ${tasks.size} tasks complete", style = MaterialTheme.typography.titleMedium)
                LinearProgressIndicator(
                    progress = { if (tasks.isEmpty()) 0f else complete.toFloat() / tasks.size },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        items(tasks.groupBy { it.text("category").ifBlank { "Uncategorised" } }.toList(), key = { it.first }) { (category, rows) ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(category, style = MaterialTheme.typography.titleMedium)
                    Text("${rows.count { it.bool("completed") }} / ${rows.size} complete")
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
            Text(email, Modifier.padding(horizontal = 2.dp, vertical = 4.dp), style = MaterialTheme.typography.bodyMedium)
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            OutlinedCard(onClick = actions.editNavigation, modifier = Modifier.fillMaxWidth().testTag("edit-bottom-bar")) {
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Tune, null)
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
                OutlinedButton(onClick = { themeMenu = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Appearance: ${themes.firstOrNull { it.first == theme }?.second ?: "Use device theme"}", Modifier.weight(1f))
                    Icon(Icons.Default.ExpandMore, null)
                }
                DropdownMenu(expanded = themeMenu, onDismissRequest = { themeMenu = false }) {
                    themes.forEach { (id, name) ->
                        DropdownMenuItem(text = { Text(name) }, onClick = { setTheme(id); themeMenu = false })
                    }
                }
            }
        }
        item { SettingsButton("Enable notifications", actions.notifications) }
        item { SettingsButton("Export workspace backup", actions.exportBackup) }
        item { SettingsButton("Import workspace backup", actions.importBackup) }
        item { SettingsButton("Import calendar (.ics)", actions.importCalendar) }
        if (pending > 0) {
            item { SettingsButton("Export pending changes", actions.exportPending) }
            item { SettingsButton("Discard pending changes", actions.discardPending) }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text("Backups contain personal workspace data. Store them somewhere private. Imports create new copies.",
                Modifier.padding(horizontal = 2.dp, vertical = 2.dp), style = MaterialTheme.typography.bodySmall)
        }
        item { SettingsButton("Sign out", actions.signOut) }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text("Zen Workspace ${BuildConfig.VERSION_NAME}", Modifier.padding(2.dp), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun SettingsButton(label: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(label) }
}
