package com.zenworkspace.app.ui

import android.app.DatePickerDialog
import android.graphics.Typeface
import android.text.Editable
import android.text.Html
import android.text.TextWatcher
import android.text.style.StyleSpan
import android.widget.EditText
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Row as LayoutRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Today
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.zenworkspace.app.data.Row
import com.zenworkspace.app.data.WorkspaceState
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val sectionNames = mapOf(
    "tasks" to "Tasks", "lists" to "Lists", "notes" to "Notes",
    "calendar_events" to "Calendar", "zen_reminders" to "Reminders", "categories" to "Categories"
)

/** Every screen is rendered by Android Compose controls; no web content is loaded. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CollectionScreen(
    section: String,
    state: WorkspaceState,
    onSave: (String, JSONObject) -> Unit,
    onDelete: (String, String) -> Unit,
    onRpc: (String, JSONObject) -> Unit,
    onShare: (String, Row) -> Unit,
) {
    var query by rememberSaveable(section) { mutableStateOf("") }
    var taskFilter by rememberSaveable { mutableStateOf("Active") }
    var archived by rememberSaveable { mutableStateOf(false) }
    var editorId by rememberSaveable(section) { mutableStateOf<String?>(null) }
    var editorTable by rememberSaveable(section) { mutableStateOf(section) }
    val editor = state.table(editorTable).firstOrNull { it.id == editorId }
    var creating by rememberSaveable(section) { mutableStateOf(false) }
    var selectedList by rememberSaveable(section) { mutableStateOf<String?>(null) }
    var deleting by remember(section) { mutableStateOf<Row?>(null) }
    var calendarDate by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    val title = sectionNames[section] ?: section
    val allRows = state.table(section)
    val filtered = allRows.filter { row ->
        val titleText = row.text(if (section == "lists" || section == "categories") "name" else "title")
        val searchText = "$titleText ${row.text("description")} ${plainNote(row.text("content"))}"
        searchText.contains(query, ignoreCase = true) &&
            (section != "tasks" || taskFilter == "All" || row.bool("completed") == (taskFilter == "Completed")) &&
            (section != "lists" || row.bool("archived") == archived)
    }.let { rows ->
        when (section) {
            "tasks" -> rows.sortedWith(compareBy<Row> { it.bool("completed") }.thenBy { it.number("order") })
            "notes" -> rows.sortedByDescending { it.text("updated_at") }
            "zen_reminders" -> rows.sortedBy { it.text("remind_at") }
            else -> rows
        }
    }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().testTag("collection-list"),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                LayoutRow(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        if (section == "tasks") "${allRows.count { !it.bool("completed") }} active · ${allRows.count { it.bool("completed") }} completed"
                        else "${allRows.size} ${if (section == "calendar_events") "events" else title.lowercase()}",
                        modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    FilledTonalButton(onClick = { editorTable = section; creating = true },
                        modifier = Modifier.heightIn(min = 48.dp).testTag("collection-add")) { Text("+ Add") }
                }
            }
            item {
                OutlinedTextField(query, { query = it }, label = { Text("Search $title") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("collection-search"))
            }
            if (section == "tasks") item {
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    listOf("Active", "Completed", "All").forEach { choice ->
                        FilterChip(selected = taskFilter == choice, onClick = { taskFilter = choice }, label = { Text(choice) }, modifier = Modifier.heightIn(min = 48.dp))
                    }
                }
            }
            if (section == "lists") item {
                LayoutRow(verticalAlignment = Alignment.CenterVertically) {
                    Switch(archived, { archived = it })
                    Text("Show archived lists", modifier = Modifier.weight(1f).padding(start = 8.dp))
                }
            }
            if (section == "calendar_events") {
                item { CalendarDaySelector(calendarDate) { calendarDate = it } }
                val dayRows = calendarAgenda(state, calendarDate).filter { entry ->
                    entry.second.text("title").contains(query, ignoreCase = true)
                }
                if (dayRows.isEmpty()) item { EmptyCollection("Nothing scheduled for this day", "Add an event or choose another date.") }
                items(dayRows, key = { "${it.first}:${it.second.id}" }) { (table, row) ->
                    RecordCard(table, row, state, onSave,
                        onEdit = { editorTable = table; editorId = row.id },
                        onDelete = { if (table == "calendar_events") deleting = row },
                        onShare = { }, canManage = table == "calendar_events")
                }
            } else {
                if (filtered.isEmpty()) item {
                    EmptyCollection(if (query.isNotBlank()) "No matches" else "A little space to begin",
                        if (query.isNotBlank()) "Try another search." else "Use Add to create your first ${singular(section).lowercase()}.")
                }
                items(filtered, key = { it.id }) { row ->
                    RecordCard(section, row, state, onSave,
                        onEdit = { if (section == "lists") selectedList = row.id else { editorTable = section; editorId = row.id } },
                        onDelete = { deleting = row }, onShare = { onShare(section, row) })
                }
            }
        }
    }
    if (creating || editor != null) {
        RecordEditor(editorTable, editor, state,
            onDismiss = { creating = false; editorId = null },
            onSave = { values -> onSave(editorTable, values); creating = false; editorId = null })
    }
    selectedList?.let { id ->
        val row = state.table("lists").firstOrNull { it.id == id }
        if (row != null) ListDetail(row, state, onSave, onDelete,
            onEdit = { editorTable = "lists"; editorId = row.id; selectedList = null },
            onShare = { onShare("lists", row) }, onDismiss = { selectedList = null })
    }
    deleting?.let { row ->
        AlertDialog(onDismissRequest = { deleting = null },
            title = { Text("Delete ${singular(section).lowercase()}?") },
            text = { Text("This removes it from your workspace and synced devices.") },
            confirmButton = { TextButton(onClick = { onDelete(section, row.id); deleting = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancel") } })
    }
}

@Composable
private fun EmptyCollection(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun RecordCard(
    section: String, row: Row, state: WorkspaceState,
    onSave: (String, JSONObject) -> Unit, onEdit: () -> Unit, onDelete: () -> Unit, onShare: () -> Unit,
    canManage: Boolean = true,
) {
    val editable = row.text("access_role") != "viewer" && canManage
    val owner = row.text("user_id").let { it.isBlank() || it == state.userId }
    val title = row.text(if (section == "lists" || section == "categories") "name" else "title").ifBlank { "Untitled" }
    var menu by remember(row.id) { mutableStateOf(false) }
    val description = if (section == "notes") plainNote(row.text("content")) else row.text("description")
    ElevatedCard(Modifier.fillMaxWidth().testTag("record:$section:${row.id}").clickable(onClick = onEdit)) {
        Column(Modifier.padding(horizontal = 6.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            LayoutRow(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                if (section == "tasks") Checkbox(row.bool("completed"), enabled = editable, modifier = Modifier.size(48.dp),
                    onCheckedChange = { onSave("tasks", JSONObject().put("id", row.id).put("completed", it)) })
                Column(Modifier.weight(1f).padding(start = if (section == "tasks") 0.dp else 4.dp, top = 4.dp, bottom = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    val summary = recordSummary(section, row, state)
                    if (summary.isNotBlank()) Text(summary, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (canManage) Box {
                    IconButton(onClick = { menu = true }, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.MoreVert, "Actions for $title") }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(text = { Text(if (section == "lists") "Open" else if (editable) "Edit" else "View") },
                            onClick = { menu = false; onEdit() })
                        if (owner && section in listOf("tasks", "lists")) DropdownMenuItem(text = { Text("Share") }, onClick = { menu = false; onShare() })
                        if (section == "tasks" && owner && editable) {
                            val peers = state.table("tasks").filter {
                                it.text("user_id") == state.userId && it.bool("completed") == row.bool("completed")
                            }.sortedWith(compareBy<Row> { it.number("order") }.thenBy { it.id })
                            val position = peers.indexOfFirst { it.id == row.id }
                            if (peers.size > 1 && position >= 0) {
                                DropdownMenuItem(text = { Text("Move up") }, enabled = position > 0,
                                    modifier = Modifier.semantics { contentDescription = "Move $title up" },
                                    onClick = { menu = false; moveTask(peers, position, position - 1, onSave) })
                                DropdownMenuItem(text = { Text("Move down") }, enabled = position < peers.lastIndex,
                                    modifier = Modifier.semantics { contentDescription = "Move $title down" },
                                    onClick = { menu = false; moveTask(peers, position, position + 1, onSave) })
                            }
                        }
                        if (editable && owner) DropdownMenuItem(text = { Text("Delete") }, onClick = { menu = false; onDelete() })
                    }
                }
            }
            if (description.isNotBlank()) Text(description, maxLines = 2, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = if (section == "tasks") 48.dp else 4.dp, end = 4.dp, bottom = 4.dp))
        }
    }
}

@Composable
private fun RecordEditor(section: String, row: Row?, state: WorkspaceState, onDismiss: () -> Unit, onSave: (JSONObject) -> Unit) {
    var draftText by rememberSaveable(row?.id, section) { mutableStateOf(initialDraft(section, row, state).toString()) }
    val draft = JSONObject(draftText)
    var dirty by rememberSaveable { mutableStateOf(false) }
    var confirmDiscard by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var noteTitleMode by rememberSaveable { mutableStateOf(false) }
    val editable = row?.text("access_role") != "viewer"
    val nameKey = if (section in listOf("lists", "categories")) "name" else "title"
    fun update(key: String, value: Any) {
        draftText = JSONObject(draft.toString()).put(key, value).toString()
        dirty = true
    }
    val close = { if (dirty && editable) confirmDiscard = true else onDismiss() }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing), contentAlignment = Alignment.TopCenter) {
            val compactNote = section == "notes" && maxHeight < 360.dp
            Column(Modifier.widthIn(max = 960.dp).fillMaxWidth().fillMaxHeight().testTag("record-editor")) {
                LayoutRow(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = close, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel") }
                    if (compactNote && editable) TextButton(onClick = { noteTitleMode = !noteTitleMode },
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("note-title-toggle")
                            .semantics { contentDescription = if (noteTitleMode) "Done editing note title" else "Edit note title" }) {
                        Text(if (noteTitleMode) "Done" else draft.field("title").ifBlank { "Add title" }, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    } else Text("${if (row == null) "New" else if (editable) "Edit" else "View"} ${singular(section).lowercase()}",
                        Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (editable) Button(modifier = Modifier.heightIn(min = 48.dp), onClick = {
                        val validation = validateDraft(section, draft)
                        if (validation != null) { error = validation; if (section == "notes" && draft.field("title").isBlank()) noteTitleMode = true }
                        else onSave(writablePatch(section, draft, row?.id))
                    }) { Text("Save") }
                }
                if (section == "notes") {
                    Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        if (!compactNote || noteTitleMode) OutlinedTextField(draft.field(nameKey), { update(nameKey, it) }, label = { Text("Title") },
                            enabled = editable, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("record-title"))
                        NativeNoteField(draft.field("content"), editable, Modifier.weight(1f).fillMaxWidth()) { update("content", it) }
                    }
                } else Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 6.dp).testTag("record-form"),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    OutlinedTextField(draft.field(nameKey), { update(nameKey, it) },
                        label = { Text(if (nameKey == "name") "Name" else "Title") },
                        enabled = editable, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("record-title"))
                    when (section) {
                        "tasks" -> if (editable) TaskFields(draft, { draftText = it.toString(); dirty = true }, state.table("categories")) else {
                            Text(draft.field("description"))
                            Text("Due ${displayDate(draft.field("due_date"))}")
                        }
                        "lists" -> DescriptionField(draft, editable) { update("description", it) }
                        "calendar_events" -> {
                            DescriptionField(draft, editable) { update("description", it) }
                            OutlinedTextField(draft.field("location"), { update("location", it) },
                                label = { Text("Location") }, modifier = Modifier.fillMaxWidth())
                            LayoutRow(verticalAlignment = Alignment.CenterVertically) {
                                Switch(draft.optBoolean("all_day"), { allDay ->
                                    val zone = ZoneId.systemDefault()
                                    val start = if (allDay) Instant.parse(draft.field("start_time")).atZone(zone).toLocalDate()
                                        else LocalDate.parse(draft.field("start_time").take(10))
                                    val proposedEnd = if (allDay) Instant.parse(draft.field("end_time")).atZone(zone).toLocalDate()
                                        else LocalDate.parse(draft.field("end_time").take(10))
                                    val end = if (proposedEnd <= start) start.plusDays(1) else proposedEnd
                                    val targetZone = if (allDay) ZoneOffset.UTC else zone
                                    draftText = JSONObject(draft.toString()).put("all_day", allDay)
                                        .put("start_time", start.atStartOfDay(targetZone).toInstant().toString())
                                        .put("end_time", end.atStartOfDay(targetZone).toInstant().toString()).toString()
                                    dirty = true
                                })
                                Text("All day", Modifier.padding(start = 12.dp))
                            }
                            if (draft.optBoolean("all_day")) {
                                CalendarDateField("Starts", draft.field("start_time")) { update("start_time", it) }
                                CalendarDateField("Last day", runCatching { Instant.parse(draft.field("end_time")).minusSeconds(86400).toString() }.getOrDefault(draft.field("end_time"))) {
                                    update("end_time", Instant.parse(it).plusSeconds(86400).toString())
                                }
                            } else {
                                NativeDateTimeField("Starts", draft.field("start_time"), { update("start_time", it) }, false)
                                NativeDateTimeField("Ends", draft.field("end_time"), { update("end_time", it) }, false)
                            }
                        }
                        "zen_reminders" -> {
                            DescriptionField(draft, editable) { update("description", it) }
                            NativeDateTimeField("Remind me", draft.field("remind_at"), { update("remind_at", it) }, false)
                            Text("Time zone: ${draft.field("timezone")}", style = MaterialTheme.typography.bodySmall)
                        }
                        "categories" -> {
                            OutlinedTextField(draft.field("color"), { update("color", it) },
                                label = { Text("Colour, e.g. #4F7971") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
            }
        }
    }
    if (confirmDiscard) AlertDialog(onDismissRequest = { confirmDiscard = false },
        title = { Text("Discard changes?") }, text = { Text("Your changes have not been saved yet.") },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Discard") } },
        dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text("Keep editing") } })
}

@Composable
private fun DescriptionField(draft: JSONObject, enabled: Boolean, onChange: (String) -> Unit) {
    OutlinedTextField(draft.field("description"), onChange, label = { Text("Description") }, enabled = enabled,
        minLines = 2, maxLines = 5, modifier = Modifier.fillMaxWidth())
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NativeNoteField(value: String, editable: Boolean, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    var editor by remember { mutableStateOf<EditText?>(null) }
    val textColor = MaterialTheme.colorScheme.onSurface.toArgb()
    val hintColor = MaterialTheme.colorScheme.onSurfaceVariant.toArgb()
    BoxWithConstraints(modifier) {
    val noteHeight = maxHeight
    val showFormatting = noteHeight >= 150.dp
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (editable && showFormatting) FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("Bold" to Typeface.BOLD, "Italic" to Typeface.ITALIC).forEach { (label, style) ->
                OutlinedButton(modifier = Modifier.heightIn(min = 48.dp), onClick = {
                    editor?.let { field ->
                        val start = field.selectionStart.coerceAtLeast(0)
                        val end = field.selectionEnd.coerceAtLeast(start)
                        if (end > start) {
                            val spans = field.text.getSpans(start, end, StyleSpan::class.java).filter { it.style == style }
                            if (spans.isNotEmpty()) spans.forEach { span ->
                                val spanStart = field.text.getSpanStart(span)
                                val spanEnd = field.text.getSpanEnd(span)
                                field.text.removeSpan(span)
                                if (spanStart < start) field.text.setSpan(StyleSpan(style), spanStart, start, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                                if (spanEnd > end) field.text.setSpan(StyleSpan(style), end, spanEnd, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            }
                            else field.text.setSpan(StyleSpan(style), start, end, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            onChange(Html.toHtml(field.text, Html.TO_HTML_PARAGRAPH_LINES_CONSECUTIVE))
                        }
                    }
                }) { Text(label) }
            }
        }
        if (editable && noteHeight >= 240.dp) Text("Select text to format.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        AndroidView(
            factory = { context ->
                EditText(context).apply {
                    setText(Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY))
                    setTextColor(textColor)
                    setHintTextColor(hintColor)
                    hint = "Start a composed note…"
                    textSize = 17f
                    minLines = 1
                    setHorizontallyScrolling(false)
                    isVerticalScrollBarEnabled = true
                    gravity = android.view.Gravity.TOP
                    setSingleLine(false)
                    inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                    contentDescription = "Note content"
                    isEnabled = editable
                    setPadding(8, 8, 8, 8)
                    addTextChangedListener(object : TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
                        override fun afterTextChanged(s: Editable?) {
                            if (s != null) onChange(Html.toHtml(s, Html.TO_HTML_PARAGRAPH_LINES_CONSECUTIVE))
                        }
                    })
                    editor = this
                }
            },
            update = { it.setTextColor(textColor); it.setHintTextColor(hintColor); it.isEnabled = editable },
            modifier = Modifier.fillMaxWidth().weight(1f).testTag("note-content")
        )
    }
    }
}

@Composable
private fun ListDetail(
    list: Row, state: WorkspaceState, onSave: (String, JSONObject) -> Unit,
    onDelete: (String, String) -> Unit, onEdit: () -> Unit, onShare: () -> Unit, onDismiss: () -> Unit,
) {
    var content by rememberSaveable(list.id) { mutableStateOf("") }
    var editingItemId by rememberSaveable(list.id) { mutableStateOf<String?>(null) }
    var deleteItem by remember { mutableStateOf<Row?>(null) }
    var listMenu by remember { mutableStateOf(false) }
    val editable = list.text("access_role") != "viewer"
    val owner = list.text("user_id") == state.userId
    val entries = state.table("list_items").filter { it.text("list_id") == list.id }.sortedWith(compareBy<Row> { it.number("position") }.thenBy { it.id })
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing), contentAlignment = Alignment.TopCenter) {
                val compactHeight = maxHeight < 400.dp
                Column(Modifier.widthIn(max = 1100.dp).fillMaxWidth().fillMaxHeight().testTag("list-detail-root")) {
                    LayoutRow(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Back") }
                        Text(list.text("name"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (owner) Box {
                            IconButton(onClick = { listMenu = true }, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.MoreVert, "List actions") }
                            DropdownMenu(listMenu, { listMenu = false }) {
                                DropdownMenuItem(text = { Text("Edit list") }, onClick = { listMenu = false; onEdit() })
                                DropdownMenuItem(text = { Text("Share list") }, onClick = { listMenu = false; onShare() })
                                DropdownMenuItem(text = { Text(if (list.bool("archived")) "Restore list" else "Archive list") }, onClick = {
                                    listMenu = false
                                    onSave("lists", JSONObject().put("id", list.id).put("archived", !list.bool("archived")))
                                })
                            }
                        }
                    }
                    LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("list-items"),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                if (list.text("description").isNotBlank()) Text(list.text("description"), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text("${entries.count { it.bool("completed") }} of ${entries.size} complete", color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        items(entries, key = { it.id }) { item ->
                            var itemMenu by remember(item.id) { mutableStateOf(false) }
                            ElevatedCard(Modifier.fillMaxWidth().testTag("list-item:${item.id}")
                                .clickable(enabled = editable) { editingItemId = item.id }) {
                                LayoutRow(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(item.bool("completed"), modifier = Modifier.size(48.dp), onCheckedChange = {
                                        onSave("list_items", JSONObject().put("id", item.id).put("completed", it))
                                    }, enabled = editable)
                                    Text(item.text("content").ifBlank { "Empty item" }, modifier = Modifier.weight(1f))
                                    if (editable) Box {
                                        IconButton(onClick = { itemMenu = true }, modifier = Modifier.size(48.dp).testTag("list-item-actions:${item.id}")) {
                                            Icon(Icons.Default.MoreVert, "Actions for ${item.text("content").ifBlank { "empty item" }}")
                                        }
                                        DropdownMenu(itemMenu, { itemMenu = false }) {
                                            val index = entries.indexOfFirst { it.id == item.id }
                                            DropdownMenuItem(text = { Text("Move up") }, enabled = index > 0, onClick = {
                                                itemMenu = false
                                                moveListItem(entries, index, index - 1, onSave)
                                            })
                                            DropdownMenuItem(text = { Text("Move down") }, enabled = index < entries.lastIndex, onClick = {
                                                itemMenu = false
                                                moveListItem(entries, index, index + 1, onSave)
                                            })
                                            DropdownMenuItem(text = { Text("Edit item") }, onClick = { itemMenu = false; editingItemId = item.id })
                                            DropdownMenuItem(text = { Text("Delete item") }, onClick = { itemMenu = false; deleteItem = item })
                                        }
                                    }
                                }
                            }
                        }
                        if (entries.isEmpty()) item { EmptyCollection("An empty list", if (editable) "Add your first item below." else "This list has no items yet.") }
                    }
                    if (editable) LayoutRow(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(content, { content = it }, label = { Text("New item") }, modifier = Modifier.weight(1f).testTag("list-add-field"),
                            singleLine = compactHeight, maxLines = if (compactHeight) 1 else 2)
                        Button(enabled = content.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp).testTag("list-add-button"), onClick = {
                            onSave("list_items", JSONObject().put("list_id", list.id).put("content", content.trim())
                                .put("completed", false).put("position", (entries.maxOfOrNull { it.number("position") } ?: -1) + 1))
                            content = ""
                        }) { Text("Add") }
                    }
                }
            }
        }
    }
    editingItemId?.let { id -> entries.firstOrNull { it.id == id }?.let { item ->
        ListItemEditor(item, onDismiss = { editingItemId = null }, onSave = { edited ->
            onSave("list_items", JSONObject().put("id", item.id).put("content", edited.trim())); editingItemId = null
        })
    } }
    deleteItem?.let { item ->
        AlertDialog(onDismissRequest = { deleteItem = null }, title = { Text("Delete item?") },
            text = { Text(item.text("content"), maxLines = 8, overflow = TextOverflow.Ellipsis) },
            confirmButton = { TextButton(onClick = { onDelete("list_items", item.id); deleteItem = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { deleteItem = null }) { Text("Cancel") } })
    }
}

@Composable
private fun ListItemEditor(item: Row, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var edited by rememberSaveable(item.id) { mutableStateOf(item.text("content")) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing), contentAlignment = Alignment.TopCenter) {
                Column(Modifier.widthIn(max = 960.dp).fillMaxWidth().fillMaxHeight().testTag("list-item-editor")) {
                    LayoutRow(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel") }
                        Text("Edit item", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Button(enabled = edited.isNotBlank(), onClick = { onSave(edited) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Save") }
                    }
                    OutlinedTextField(edited, { edited = it }, label = { Text("Content") },
                        modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp))
                }
            }
        }
    }
}


@Composable
private fun CalendarDateField(label: String, value: String, onChange: (String) -> Unit) {
    val context = LocalContext.current
    val selected = runCatching { LocalDate.parse(value.take(10)) }.getOrDefault(LocalDate.now())
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        OutlinedButton(modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), onClick = {
            DatePickerDialog(context, { _, year, month, day ->
                onChange(LocalDate.of(year, month + 1, day).atStartOfDay(ZoneOffset.UTC).toInstant().toString())
            }, selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
        }) { Text(selected.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))) }
    }
}

@Composable
private fun CalendarDaySelector(date: String, onChange: (String) -> Unit) {
    val context = LocalContext.current
    val selected = LocalDate.parse(date)
    LayoutRow(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        IconButton(onClick = { onChange(selected.minusDays(1).toString()) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.ChevronLeft, "Previous day") }
        OutlinedButton(modifier = Modifier.weight(1f).heightIn(min = 48.dp).semantics { contentDescription = "Choose calendar day" }, onClick = {
            DatePickerDialog(context, { _, year, month, day -> onChange(LocalDate.of(year, month + 1, day).toString()) },
                selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
        }, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 6.dp)) {
            Text(selected.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)))
        }
        IconButton(onClick = { onChange(selected.plusDays(1).toString()) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.ChevronRight, "Next day") }
        IconButton(onClick = { onChange(LocalDate.now().toString()) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.Today, "Today") }
    }
}

private fun calendarAgenda(state: WorkspaceState, date: String): List<Pair<String, Row>> {
    val day = LocalDate.parse(date)
    val zone = ZoneId.systemDefault()
    val start = day.atStartOfDay(zone).toInstant()
    val end = day.plusDays(1).atStartOfDay(zone).toInstant()
    fun at(value: String): Instant? = runCatching { Instant.parse(value) }.getOrNull()
    val events = state.table("calendar_events").filter { row ->
        if (row.bool("all_day")) {
            val first = runCatching { LocalDate.parse(row.text("start_time").take(10)) }.getOrNull()
            val last = runCatching { LocalDate.parse(row.text("end_time").take(10)) }.getOrNull()
            first != null && last != null && day >= first && day < last
        } else {
            val begins = at(row.text("start_time"))
            val ends = at(row.text("end_time"))
            begins != null && ends != null && begins < end && ends > start
        }
    }.map { "calendar_events" to it }
    val tasks = state.table("tasks").filter { row ->
        val due = at(row.text("due_date"))
        !row.bool("completed") && due != null && due >= start && due < end
    }.map { "tasks" to it }
    val reminders = state.table("zen_reminders").filter { row ->
        val time = at(row.text("remind_at"))
        time != null && time >= start && time < end
    }.map { "zen_reminders" to it }
    return (events + tasks + reminders).sortedBy { (table, row) -> row.text(when (table) {
        "tasks" -> "due_date"; "zen_reminders" -> "remind_at"; else -> "start_time"
    }) }
}

private fun initialDraft(section: String, row: Row?, state: WorkspaceState): JSONObject {
    if (row != null) return JSONObject(row.values.toString())
    val now = Instant.now()
    return JSONObject().apply {
        when (section) {
            "tasks" -> {
                put("title", ""); put("description", ""); put("completed", false)
                put("priority", "medium"); put("category", state.table("categories").firstOrNull()?.text("name") ?: "General")
                put("category_color", state.table("categories").firstOrNull()?.text("color") ?: "#4F7971")
                put("order", (state.table("tasks").maxOfOrNull { it.number("order") } ?: -1) + 1)
                put("due_date", JSONObject.NULL); put("reminder_minutes_before", JSONObject.NULL)
                put("task_recurrence", JSONObject.NULL); put("task_recurrence_interval", 1)
            }
            "lists" -> { put("name", ""); put("description", ""); put("archived", false) }
            "notes" -> { put("title", ""); put("content", "") }
            "calendar_events" -> {
                put("title", ""); put("description", ""); put("location", "")
                put("start_time", now.toString()); put("end_time", now.plusSeconds(3600).toString()); put("all_day", false)
            }
            "zen_reminders" -> {
                put("title", ""); put("description", ""); put("remind_at", now.plusSeconds(3600).toString())
                put("timezone", ZoneId.systemDefault().id)
            }
            "categories" -> { put("name", ""); put("color", "#4F7971") }
        }
    }
}

private fun writablePatch(section: String, draft: JSONObject, id: String?): JSONObject {
    val keys = when (section) {
        "tasks" -> listOf("title", "description", "completed", "priority", "category", "category_color", "order", "due_date",
            "reminder_minutes_before", "reminder_recurrence", "reminder_next_trigger_at", "reminder_snoozed_until", "reminder_timezone",
            "task_recurrence", "task_recurrence_interval", "task_recurrence_anchor_day")
        "lists" -> listOf("name", "description", "archived")
        "notes" -> listOf("title", "content")
        "calendar_events" -> listOf("title", "description", "location", "start_time", "end_time", "all_day")
        "zen_reminders" -> listOf("title", "description", "remind_at", "timezone")
        "categories" -> listOf("name", "color")
        else -> emptyList()
    }
    return JSONObject().apply {
        if (id != null) put("id", id)
        keys.filter { draft.has(it) }.forEach { put(it, draft.get(it)) }
        if (section == "notes") {
            val plain = plainNote(draft.field("content"))
            put("word_count", plain.trim().split(Regex("\\s+")).count { it.isNotBlank() })
            put("summary", plain.take(200))
        }
    }
}

private fun validateDraft(section: String, draft: JSONObject): String? {
    val name = draft.field(if (section in listOf("lists", "categories")) "name" else "title").trim()
    if (name.isBlank()) return "Enter a ${if (section in listOf("lists", "categories")) "name" else "title"}."
    if (section == "calendar_events") {
        val start = runCatching { Instant.parse(draft.field("start_time")) }.getOrNull()
        val end = runCatching { Instant.parse(draft.field("end_time")) }.getOrNull()
        if (start == null || end == null || end <= start) return "Choose an end time after the start."
    }
    if (section == "zen_reminders" && runCatching { Instant.parse(draft.field("remind_at")) }.isFailure) return "Choose a reminder date and time."
    if (section == "categories" && !draft.field("color").matches(Regex("#[0-9a-fA-F]{6}"))) return "Enter a six-digit colour such as #4F7971."
    if (section == "tasks" && !draft.isNull("task_recurrence") && draft.field("task_recurrence").isNotBlank() && draft.isNull("due_date")) return "Repeating tasks need a due date."
    if (section == "tasks") {
        val rule = draft.optJSONObject("reminder_recurrence")
        if (rule != null && rule.field("end_at").isNotBlank()) {
            val end = runCatching { Instant.parse(rule.field("end_at")) }.getOrNull()
            val start = runCatching { Instant.parse(rule.field("start_at")) }.getOrElse {
                runCatching { Instant.parse(draft.field("due_date")).minusSeconds(draft.optInt("reminder_minutes_before", 0).toLong() * 60) }.getOrNull()
            }
            if (end == null || start == null || end < start) return "The reminder stop date must be on or after the first reminder."
        }
    }
    return null
}

private fun singular(section: String): String = when (section) {
    "tasks" -> "Task"; "lists" -> "List"; "notes" -> "Note"; "calendar_events" -> "Event"
    "zen_reminders" -> "Reminder"; "categories" -> "Category"; else -> "Item"
}
private fun plainNote(value: String): String = Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY).toString().trim()
private fun displayDate(value: String): String = runCatching {
    Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT))
}.getOrDefault("")

private fun JSONObject.field(key: String): String = if (isNull(key)) "" else optString(key, "")

private fun moveTask(peers: List<Row>, from: Int, to: Int, onSave: (String, JSONObject) -> Unit) =
    moveOrderedRows(peers, from, to, "tasks", "order", onSave)

private fun moveListItem(peers: List<Row>, from: Int, to: Int, onSave: (String, JSONObject) -> Unit) =
    moveOrderedRows(peers, from, to, "list_items", "position", onSave)

/** Preserve persisted slots after deletions/imports; only normalize when slots are duplicated. */
private fun moveOrderedRows(peers: List<Row>, from: Int, to: Int, table: String, field: String, onSave: (String, JSONObject) -> Unit) {
    if (from !in peers.indices || to !in peers.indices) return
    val reordered = peers.toMutableList().apply { add(to, removeAt(from)) }
    val oldSlots = peers.map { it.number(field) }
    val slots = if (oldSlots.distinct().size == oldSlots.size) oldSlots else peers.indices.toList()
    reordered.forEachIndexed { index, row ->
        if (row.number(field) != slots[index]) {
            onSave(table, JSONObject().put("id", row.id).put(field, slots[index]))
        }
    }
}

private fun eventTimeLabel(row: Row): String {
    if (row.bool("all_day")) return "All day"
    return runCatching {
        val start = Instant.parse(row.text("start_time")).atZone(ZoneId.systemDefault())
        val end = Instant.parse(row.text("end_time")).atZone(ZoneId.systemDefault())
        val format = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
        if (start.toLocalDate() == end.toLocalDate()) "${start.format(format)} – ${end.format(format)}"
        else "${displayDate(row.text("start_time"))} – ${displayDate(row.text("end_time"))}"
    }.getOrDefault("")
}

private fun recordSummary(section: String, row: Row, state: WorkspaceState): String {
    val details = mutableListOf<String>()
    when (section) {
        "tasks" -> {
            row.text("priority").takeIf { it.isNotBlank() }?.let { details += "${it.replaceFirstChar { letter -> letter.uppercase() }} priority" }
            row.text("category").takeIf { it.isNotBlank() }?.let(details::add)
            row.text("due_date").takeIf { it.isNotBlank() }?.let { details += "Due ${compactDate(it)}" }
            row.text("task_recurrence").takeIf { it.isNotBlank() }?.let { details += "Repeats $it" }
        }
        "lists" -> {
            val entries = state.table("list_items").filter { it.text("list_id") == row.id }
            details += "${entries.count { it.bool("completed") }} of ${entries.size} done"
        }
        "notes" -> details += "${plainNote(row.text("content")).trim().split(Regex("\\s+")).count { it.isNotBlank() }} words"
        "calendar_events" -> { details += eventTimeLabel(row); row.text("location").takeIf { it.isNotBlank() }?.let(details::add) }
        "zen_reminders" -> details += displayDate(row.text("remind_at"))
        "categories" -> row.text("color").takeIf { it.isNotBlank() }?.let(details::add)
    }
    if (row.text("access_role") == "viewer") details += "Shared · view only"
    else if (row.text("user_id").let { it.isNotBlank() && it != state.userId } && section in listOf("tasks", "lists")) details += "Shared · editor"
    return details.filter { it.isNotBlank() }.joinToString(" · ")
}

private fun compactDate(value: String): String = runCatching {
    Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT))
}.getOrDefault("")
