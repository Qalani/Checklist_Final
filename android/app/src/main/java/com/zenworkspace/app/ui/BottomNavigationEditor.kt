package com.zenworkspace.app.ui

import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** Changes apply immediately; every destination also remains available in the menu. */
@Composable
fun BottomNavigationEditor(
    selectedIds: List<String>,
    onChange: (List<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    val selected = BottomNavigationPreferences.normalize(selectedIds)
    val currentSelection by rememberUpdatedState(selected)
    val change by rememberUpdatedState(onChange)
    var feedback by remember { mutableStateOf<String?>(null) }
    val atLimit = selected.size >= BottomNavigationPreferences.MAX_ITEMS

    fun move(id: String, offset: Int) {
        val current = currentSelection
        val from = current.indexOf(id)
        val to = from + offset
        if (from in current.indices && to in current.indices) {
            change(BottomNavigationPreferences.move(current, from, to))
            feedback = "${WorkspaceDestinations.find(id)?.label} moved to position ${to + 1}."
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(
            modifier = Modifier.safeDrawingPadding().imePadding().padding(horizontal = 8.dp)
                .widthIn(max = 600.dp).fillMaxWidth().fillMaxHeight().testTag("bottom-nav-editor-panel"),
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column {
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = 12.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Bottom bar", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") }
                }
                LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("bottom-nav-editor-content"), contentPadding = PaddingValues(bottom = 8.dp)) {
                    item(key = "help") {
                        Text("Choose up to 5 shortcuts. Drag a handle to reorder, or use the arrows. Changes save automatically.",
                            Modifier.padding(horizontal = 12.dp, vertical = 4.dp), style = MaterialTheme.typography.bodySmall)
                    }
                    item {
                        Text("Selected (${selected.size}/5)", Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            style = MaterialTheme.typography.titleSmall)
                    }
                    if (selected.isEmpty()) item {
                        Text("Bottom bar hidden. Every page is still available from the workspace menu.",
                            Modifier.padding(horizontal = 12.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                    itemsIndexed(selected, key = { _, id -> "selected:$id" }) { index, id ->
                        val destination = WorkspaceDestinations.find(id)!!
                        var height by remember(id) { mutableFloatStateOf(56f) }
                        var distance by remember(id) { mutableFloatStateOf(0f) }
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 56.dp).onSizeChanged { height = it.height.toFloat() }
                                .padding(horizontal = 8.dp).testTag("bottom-nav-selected:$id"),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.size(48.dp).semantics {
                                contentDescription = "Drag to reorder ${destination.label}"
                                customActions = buildList {
                                    if (index > 0) add(CustomAccessibilityAction("Move ${destination.label} up") { move(id, -1); true })
                                    if (index < selected.lastIndex) add(CustomAccessibilityAction("Move ${destination.label} down") { move(id, 1); true })
                                }
                            }.pointerInput(id) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { distance = 0f },
                                    onDragEnd = { distance = 0f },
                                    onDragCancel = { distance = 0f },
                                    onDrag = { event, amount ->
                                        event.consume()
                                        distance += amount.y
                                        val threshold = height.coerceAtLeast(1f) * 0.55f
                                        if (distance > threshold || distance < -threshold) {
                                            val offset = if (distance > 0) 1 else -1
                                            val current = currentSelection
                                            val from = current.indexOf(id)
                                            if (from + offset in current.indices) {
                                                move(id, offset)
                                                distance -= height * offset
                                            } else distance = 0f
                                        }
                                    },
                                )
                            }, contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.DragHandle, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(destination.label, Modifier.weight(1f).testTag("bottom-nav-label:$id"), style = MaterialTheme.typography.bodyMedium,
                                maxLines = 2, overflow = TextOverflow.Ellipsis)
                            IconButton(onClick = { move(id, -1) }, enabled = index > 0, modifier = Modifier.size(48.dp)) {
                                Icon(Icons.Default.ArrowUpward, "Move ${destination.label} up")
                            }
                            IconButton(onClick = { move(id, 1) }, enabled = index < selected.lastIndex, modifier = Modifier.size(48.dp)) {
                                Icon(Icons.Default.ArrowDownward, "Move ${destination.label} down")
                            }
                            IconButton(onClick = {
                                change(currentSelection.filterNot { it == id })
                                feedback = "${destination.label} removed from the bottom bar."
                            }, modifier = Modifier.size(48.dp)) {
                                Icon(Icons.Default.RemoveCircleOutline, "Remove ${destination.label} from bottom bar")
                            }
                        }
                    }
                    feedback?.let { message -> item(key = "feedback") {
                        Text(message, Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                            .semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall)
                    } }
                    item {
                        HorizontalDivider(Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                        Text("Available pages", Modifier.padding(horizontal = 12.dp, vertical = 8.dp), style = MaterialTheme.typography.titleSmall)
                        if (atLimit) Text("Maximum of 5 shortcuts selected. Remove one to add another.",
                            Modifier.padding(horizontal = 12.dp, vertical = 4.dp).semantics { liveRegion = LiveRegionMode.Polite },
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                    items(WorkspaceDestinations.all.filter { it.id !in selected }, key = { "available:${it.id}" }) { destination ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = 12.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(destination.icon, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(12.dp))
                            Text(destination.label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                            IconButton(onClick = {
                                if (currentSelection.size < BottomNavigationPreferences.MAX_ITEMS) {
                                    change(currentSelection + destination.id)
                                    feedback = "${destination.label} added to the bottom bar."
                                }
                            }, enabled = !atLimit, modifier = Modifier.size(48.dp)) {
                                Icon(Icons.Default.Add, "Add ${destination.label} to bottom bar")
                            }
                        }
                    }
                }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = {
                        change(BottomNavigationPreferences.DEFAULT_ITEMS.toList())
                        feedback = "Default shortcuts restored."
                    }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Reset defaults") }
                    TextButton(onClick = { change(emptyList()); feedback = "Bottom bar hidden. Use the workspace menu to open any page." },
                        enabled = selected.isNotEmpty(), modifier = Modifier.heightIn(min = 48.dp)) { Text("Hide bar") }
                }
            }
        }
    }
}
