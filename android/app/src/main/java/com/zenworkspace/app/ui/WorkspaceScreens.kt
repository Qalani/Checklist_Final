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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
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
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 100.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text(title, style = MaterialTheme.typography.headlineMedium)
                Text(
                    when (section) {
                        "tasks" -> "${allRows.count { !it.bool("completed") }} active · ${allRows.count { it.bool("completed") }} completed"
                        "lists" -> "Keep the little things in order."
                        "notes" -> "A quiet place for your thoughts."
                        "calendar_events" -> "Your events, due dates and reminders."
                        "zen_reminders" -> "Make room for what matters."
                        else -> "Give your tasks a little structure."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp, bottom = 4.dp)
                )
            }
            item {
                OutlinedTextField(query, { query = it }, label = { Text("Search $title") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
            }
            if (section == "tasks") item {
                LayoutRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Active", "Completed", "All").forEach { choice ->
                        FilterChip(selected = taskFilter == choice, onClick = { taskFilter = choice }, label = { Text(choice) })
                    }
                }
            }
            if (section == "lists") item {
                LayoutRow(verticalAlignment = Alignment.CenterVertically) {
                    Switch(archived, { archived = it })
                    Text("Show archived lists", modifier = Modifier.padding(start = 12.dp))
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
        FloatingActionButton(onClick = { editorTable = section; creating = true }, modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp)) {
            Text("+ Add", modifier = Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelLarge)
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
    Column(Modifier.fillMaxWidth().padding(vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
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
    val title = row.text(if (section == "lists" || section == "categories") "name" else "title")
    ElevatedCard(Modifier.fillMaxWidth().clickable(onClick = onEdit)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            LayoutRow(verticalAlignment = Alignment.CenterVertically) {
                if (section == "tasks") Checkbox(row.bool("completed"), enabled = editable,
                    onCheckedChange = { onSave("tasks", JSONObject().put("id", row.id).put("completed", it)) })
                Column(Modifier.weight(1f)) {
                    Text(title.ifBlank { "Untitled" }, style = MaterialTheme.typography.titleMedium,
                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (row.text("access_role") == "viewer") Text("Shared · view only", style = MaterialTheme.typography.labelMedium)
                    else if (!owner && section in listOf("tasks", "lists")) Text("Shared · editor", style = MaterialTheme.typography.labelMedium)
                }
            }
            val description = if (section == "notes") plainNote(row.text("content")) else row.text("description")
            if (description.isNotBlank()) Text(description, maxLines = 3, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            when (section) {
                "tasks" -> {
                    Text("${row.text("priority").replaceFirstChar { it.uppercase() }} priority · ${row.text("category")}",
                        style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    if (row.text("due_date").isNotBlank()) Text("Due ${displayDate(row.text("due_date"))}", style = MaterialTheme.typography.bodySmall)
                    if (row.text("task_recurrence").isNotBlank()) Text("Repeats ${row.text("task_recurrence")}", style = MaterialTheme.typography.bodySmall)
                }
                "lists" -> {
                    val items = state.table("list_items").filter { it.text("list_id") == row.id }
                    Text("${items.count { it.bool("completed") }} of ${items.size} done", style = MaterialTheme.typography.bodySmall)
                }
                "notes" -> Text("${plainNote(row.text("content")).trim().split(Regex("\\s+")).count { it.isNotBlank() }} words",
                    style = MaterialTheme.typography.bodySmall)
                "calendar_events" -> {
                    Text(if (row.bool("all_day")) "All day" else "${displayDate(row.text("start_time"))} – ${displayDate(row.text("end_time"))}", style = MaterialTheme.typography.bodySmall)
                    if (row.text("location").isNotBlank()) Text(row.text("location"), style = MaterialTheme.typography.bodySmall)
                }
                "zen_reminders" -> Text(displayDate(row.text("remind_at")), style = MaterialTheme.typography.bodySmall)
            }
            if (canManage) LayoutRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onEdit) { Text(if (section == "lists") "Open" else if (editable) "Edit" else "View") }
                if (owner && section in listOf("tasks", "lists")) TextButton(onClick = onShare) { Text("Share") }
                if (editable && owner) TextButton(onClick = onDelete) { Text("Delete") }
            }
            if (section == "tasks" && canManage && owner && editable) {
                val peers = state.table("tasks").filter {
                    it.text("user_id") == state.userId && it.bool("completed") == row.bool("completed")
                }.sortedWith(compareBy<Row> { it.number("order") }.thenBy { it.id })
                val position = peers.indexOfFirst { it.id == row.id }
                if (peers.size > 1 && position >= 0) LayoutRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(enabled = position > 0, onClick = { moveTask(peers, position, position - 1, onSave) },
                        modifier = Modifier.semantics { contentDescription = "Move $title up" }) { Text("Up") }
                    TextButton(enabled = position < peers.lastIndex, onClick = { moveTask(peers, position, position + 1, onSave) },
                        modifier = Modifier.semantics { contentDescription = "Move $title down" }) { Text("Down") }
                }
            }
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
    val editable = row?.text("access_role") != "viewer"
    val nameKey = if (section in listOf("lists", "categories")) "name" else "title"
    fun update(key: String, value: Any) {
        draftText = JSONObject(draft.toString()).put(key, value).toString()
        dirty = true
    }
    val close = { if (dirty && editable) confirmDiscard = true else onDismiss() }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
                LayoutRow(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = close) { Text("Cancel") }
                    Text("${if (row == null) "New" else if (editable) "Edit" else "View"} ${singular(section).lowercase()}",
                        Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    if (editable) Button(onClick = {
                        val validation = validateDraft(section, draft)
                        if (validation != null) error = validation else onSave(writablePatch(section, draft, row?.id))
                    }) { Text("Save") }
                }
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    OutlinedTextField(draft.field(nameKey), { update(nameKey, it) },
                        label = { Text(if (nameKey == "name") "Name" else "Title") },
                        enabled = editable, singleLine = true, modifier = Modifier.fillMaxWidth())
                    when (section) {
                        "tasks" -> if (editable) TaskFields(draft, { draftText = it.toString(); dirty = true }, state.table("categories")) else {
                            Text(draft.field("description"))
                            Text("Due ${displayDate(draft.field("due_date"))}")
                        }
                        "notes" -> NativeNoteField(draft.field("content"), editable) { update("content", it) }
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
                    Spacer(Modifier.height(16.dp))
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
        minLines = 3, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun NativeNoteField(value: String, editable: Boolean, onChange: (String) -> Unit) {
    var editor by remember { mutableStateOf<EditText?>(null) }
    val textColor = MaterialTheme.colorScheme.onSurface.toArgb()
    val hintColor = MaterialTheme.colorScheme.onSurfaceVariant.toArgb()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (editable) LayoutRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Bold" to Typeface.BOLD, "Italic" to Typeface.ITALIC).forEach { (label, style) ->
                OutlinedButton(onClick = {
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
        Text("Select text to format it. Notes are saved when you tap Save.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        AndroidView(
            factory = { context ->
                EditText(context).apply {
                    setText(Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY))
                    setTextColor(textColor)
                    setHintTextColor(hintColor)
                    hint = "Start a composed note…"
                    textSize = 17f
                    minLines = 12
                    gravity = android.view.Gravity.TOP
                    setSingleLine(false)
                    inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                    contentDescription = "Note content"
                    isEnabled = editable
                    setPadding(12, 16, 12, 16)
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
            modifier = Modifier.fillMaxWidth().heightIn(min = 300.dp)
        )
    }
}

@Composable
private fun ListDetail(
    list: Row, state: WorkspaceState, onSave: (String, JSONObject) -> Unit,
    onDelete: (String, String) -> Unit, onEdit: () -> Unit, onShare: () -> Unit, onDismiss: () -> Unit,
) {
    var content by rememberSaveable(list.id) { mutableStateOf("") }
    var editingItem by remember { mutableStateOf<Row?>(null) }
    var deleteItem by remember { mutableStateOf<Row?>(null) }
    val editable = list.text("access_role") != "viewer"
    val owner = list.text("user_id") == state.userId
    val entries = state.table("list_items").filter { it.text("list_id") == list.id }.sortedWith(compareBy<Row> { it.number("position") }.thenBy { it.id })
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
                LayoutRow(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onDismiss) { Text("Back") }
                    Text(list.text("name"), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (owner) TextButton(onClick = onEdit) { Text("Edit") }
                }
                LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        if (list.text("description").isNotBlank()) Text(list.text("description"), modifier = Modifier.padding(bottom = 12.dp))
                        Text("${entries.count { it.bool("completed") }} of ${entries.size} complete", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (owner) LayoutRow {
                            TextButton(onClick = onShare) { Text("Share") }
                            TextButton(onClick = { onSave("lists", JSONObject().put("id", list.id).put("archived", !list.bool("archived"))) }) {
                                Text(if (list.bool("archived")) "Restore" else "Archive")
                            }
                        }
                    }
                    items(entries, key = { it.id }) { item ->
                        ElevatedCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(8.dp)) {
                                LayoutRow(verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(item.bool("completed"), onCheckedChange = {
                                        onSave("list_items", JSONObject().put("id", item.id).put("completed", it))
                                    }, enabled = editable)
                                    Text(item.text("content").ifBlank { "Empty item" }, modifier = Modifier.weight(1f)
                                        .clickable(enabled = editable) { editingItem = item })
                                }
                                if (editable) LayoutRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                    val index = entries.indexOfFirst { it.id == item.id }
                                    TextButton(enabled = index > 0, onClick = {
                                        val before = entries[index - 1]
                                        onSave("list_items", JSONObject().put("id", before.id).put("position", index))
                                        onSave("list_items", JSONObject().put("id", item.id).put("position", index - 1))
                                    }) { Text("Up") }
                                    TextButton(enabled = index < entries.lastIndex, onClick = {
                                        val after = entries[index + 1]
                                        onSave("list_items", JSONObject().put("id", after.id).put("position", index))
                                        onSave("list_items", JSONObject().put("id", item.id).put("position", index + 1))
                                    }) { Text("Down") }
                                    TextButton(onClick = { editingItem = item }) { Text("Edit") }
                                    TextButton(onClick = { deleteItem = item }) { Text("Delete") }
                                }
                            }
                        }
                    }
                    if (entries.isEmpty()) item { EmptyCollection("An empty list", if (editable) "Add your first item below." else "This list has no items yet.") }
                }
                if (editable) LayoutRow(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(content, { content = it }, label = { Text("New item") }, modifier = Modifier.weight(1f), maxLines = 3)
                    Button(enabled = content.isNotBlank(), onClick = {
                        onSave("list_items", JSONObject().put("list_id", list.id).put("content", content.trim())
                            .put("completed", false).put("position", (entries.maxOfOrNull { it.number("position") } ?: -1) + 1))
                        content = ""
                    }) { Text("Add") }
                }
            }
        }
    }
    editingItem?.let { item ->
        var edited by remember(item.id) { mutableStateOf(item.text("content")) }
        AlertDialog(onDismissRequest = { editingItem = null }, title = { Text("Edit item") },
            text = { OutlinedTextField(edited, { edited = it }, label = { Text("Content") }, minLines = 2) },
            confirmButton = { TextButton(enabled = edited.isNotBlank(), onClick = {
                onSave("list_items", JSONObject().put("id", item.id).put("content", edited.trim())); editingItem = null
            }) { Text("Save") } }, dismissButton = { TextButton(onClick = { editingItem = null }) { Text("Cancel") } })
    }
    deleteItem?.let { item ->
        AlertDialog(onDismissRequest = { deleteItem = null }, title = { Text("Delete item?") },
            text = { Text(item.text("content")) },
            confirmButton = { TextButton(onClick = { onDelete("list_items", item.id); deleteItem = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { deleteItem = null }) { Text("Cancel") } })
    }
}


@Composable
private fun CalendarDateField(label: String, value: String, onChange: (String) -> Unit) {
    val context = LocalContext.current
    val selected = runCatching { LocalDate.parse(value.take(10)) }.getOrDefault(LocalDate.now())
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = {
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
    LayoutRow(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        IconButton(onClick = { onChange(selected.minusDays(1).toString()) }, modifier = Modifier.semantics { contentDescription = "Previous day" }) { Text("‹", style = MaterialTheme.typography.headlineSmall) }
        OutlinedButton(onClick = {
            DatePickerDialog(context, { _, year, month, day -> onChange(LocalDate.of(year, month + 1, day).toString()) },
                selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
        }) { Text(selected.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))) }
        IconButton(onClick = { onChange(selected.plusDays(1).toString()) }, modifier = Modifier.semantics { contentDescription = "Next day" }) { Text("›", style = MaterialTheme.typography.headlineSmall) }
    }
    TextButton(onClick = { onChange(LocalDate.now().toString()) }) { Text("Today") }
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

private fun moveTask(peers: List<Row>, from: Int, to: Int, onSave: (String, JSONObject) -> Unit) {
    if (from !in peers.indices || to !in peers.indices) return
    val reordered = peers.toMutableList().apply { add(to, removeAt(from)) }
    val oldSlots = peers.map { it.number("order") }
    val slots = if (oldSlots.distinct().size == oldSlots.size) oldSlots else peers.indices.toList()
    reordered.forEachIndexed { index, task ->
        if (task.number("order") != slots[index]) {
            onSave("tasks", JSONObject().put("id", task.id).put("order", slots[index]))
        }
    }
}
