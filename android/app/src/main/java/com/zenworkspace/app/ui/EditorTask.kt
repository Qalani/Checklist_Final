package com.zenworkspace.app.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.text.format.DateFormat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row as LayoutRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.zenworkspace.app.data.Row
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Android platform date and time dialogs keep scheduling accessible without a web surface. */
@Composable
fun NativeDateTimeField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    allowClear: Boolean = true,
) {
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    val selected = runCatching { Instant.parse(value).atZone(zone) }
        .recoverCatching { ZonedDateTime.parse(value).withZoneSameInstant(zone) }
        .getOrElse { ZonedDateTime.now(zone).withSecond(0).withNano(0) }
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, modifier = Modifier.fillMaxWidth(), style = MaterialTheme.typography.labelLarge)
        LayoutRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                onClick = {
                    DatePickerDialog(
                        context,
                        { _, year, month, day ->
                            TimePickerDialog(
                                context,
                                { _, hour, minute ->
                                    val date = LocalDate.of(year, month + 1, day)
                                    val time = LocalTime.of(hour, minute)
                                    onChange(ZonedDateTime.of(date, time, zone).toInstant().toString())
                                },
                                selected.hour,
                                selected.minute,
                                DateFormat.is24HourFormat(context),
                            ).show()
                        },
                        selected.year,
                        selected.monthValue - 1,
                        selected.dayOfMonth,
                    ).show()
                },
            ) {
                Text(if (value.isBlank()) "Choose date and time" else selected.format(
                    DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
                ))
            }
            if (allowClear && value.isNotBlank()) {
                TextButton(
                    modifier = Modifier.heightIn(min = 48.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
                    onClick = { onChange("") },
                ) { Text("Clear") }
            }
        }
        Text(zone.id, modifier = Modifier.fillMaxWidth(), style = MaterialTheme.typography.bodySmall)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TaskFields(
    values: JSONObject,
    onChange: (JSONObject) -> Unit,
    categories: List<Row>,
) {
    fun text(key: String): String = if (values.isNull(key)) "" else values.optString(key, "")
    fun change(key: String, value: Any?) {
        onChange(JSONObject(values.toString()).put(key, value ?: JSONObject.NULL))
    }
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = text("description"),
            onValueChange = { change("description", it) },
            label = { Text("Description") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
            maxLines = 5,
        )
        Text("Priority", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            listOf("low", "medium", "high").forEach { priority ->
                FilterChip(
                    modifier = Modifier.heightIn(min = 48.dp),
                    selected = text("priority").ifBlank { "medium" } == priority,
                    onClick = { change("priority", priority) },
                    label = { Text(priority.replaceFirstChar { it.uppercaseChar() }) },
                )
            }
        }
        Text("Category", style = MaterialTheme.typography.labelLarge)
        val categoryName = text("category")
        if (categories.isNotEmpty()) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                categories.forEach { category ->
                    FilterChip(
                        modifier = Modifier.heightIn(min = 48.dp),
                        selected = categoryName == category.text("name"),
                        onClick = {
                            onChange(JSONObject(values.toString())
                                .put("category", category.text("name"))
                                .put("category_color", category.text("color")))
                        },
                        label = { Text(category.text("name")) },
                    )
                }
            }
        }
        OutlinedTextField(
            value = categoryName,
            onValueChange = {
                onChange(JSONObject(values.toString()).put("category", it)
                    .put("category_color", text("category_color").ifBlank { "#5a7a5a" }))
            },
            label = { Text("Category name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        NativeDateTimeField(
            label = "Due date",
            value = text("due_date"),
            onChange = { due ->
                val changed = JSONObject(values.toString()).put("due_date", due.ifBlank { null } ?: JSONObject.NULL)
                if (due.isBlank()) {
                    changed.put("reminder_minutes_before", JSONObject.NULL)
                        .put("reminder_recurrence", JSONObject.NULL)
                        .put("reminder_next_trigger_at", JSONObject.NULL)
                        .put("reminder_snoozed_until", JSONObject.NULL)
                } else {
                    if (!values.isNull("reminder_minutes_before") || values.optJSONObject("reminder_recurrence") != null) {
                        reanchorReminder(changed)
                    }
                    if (text("task_recurrence") == "monthly") {
                        changed.put("task_recurrence_anchor_day", Instant.parse(due).atZone(ZoneId.systemDefault()).dayOfMonth)
                    }
                }
                onChange(changed)
            },
        )
        if (text("due_date").isNotBlank()) {
            Text("Reminder", style = MaterialTheme.typography.labelLarge)
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                val current = if (values.isNull("reminder_minutes_before") && values.optJSONObject("reminder_recurrence") == null) null else values.optInt("reminder_minutes_before")
                listOf("None" to null, "At due time" to 0, "15 min before" to 15, "1 hour before" to 60, "1 day before" to 1440).forEach { (label, minutes) ->
                    FilterChip(
                        modifier = Modifier.heightIn(min = 48.dp),
                        selected = current == minutes,
                        onClick = {
                            val changed = JSONObject(values.toString())
                                .put("reminder_minutes_before", minutes ?: JSONObject.NULL)
                            if (minutes == null) {
                                changed.put("reminder_recurrence", JSONObject.NULL)
                                    .put("reminder_next_trigger_at", JSONObject.NULL)
                                    .put("reminder_snoozed_until", JSONObject.NULL)
                            } else {
                                reanchorReminder(changed)
                            }
                            onChange(changed)
                        },
                        label = { Text(label) },
                    )
                }
            }
            if (!values.isNull("reminder_minutes_before") || values.optJSONObject("reminder_recurrence") != null) {
                OutlinedTextField(
                    value = if (values.isNull("reminder_minutes_before")) "0" else values.optInt("reminder_minutes_before").toString(),
                    onValueChange = { input ->
                        input.toIntOrNull()?.takeIf { it >= 0 }?.let { minutes ->
                            onChange(reanchorReminder(JSONObject(values.toString()).put("reminder_minutes_before", minutes)))
                        }
                    },
                    label = { Text("Minutes before due time") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                ReminderRecurrenceFields(values, onChange)
            }
        }
        Text("Repeat task after completion", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            listOf("Never" to "", "Daily" to "daily", "Weekly" to "weekly", "Monthly" to "monthly").forEach { (label, recurrence) ->
                FilterChip(
                    modifier = Modifier.heightIn(min = 48.dp),
                    selected = text("task_recurrence") == recurrence,
                    onClick = {
                        val changed = JSONObject(values.toString())
                            .put("task_recurrence", recurrence.ifBlank { null } ?: JSONObject.NULL)
                            .put("task_recurrence_interval", if (recurrence.isBlank()) 1 else values.optInt("task_recurrence_interval", 1).coerceAtLeast(1))
                        if (recurrence == "monthly") {
                            val anchor = runCatching { Instant.parse(text("due_date")).atZone(ZoneId.systemDefault()).dayOfMonth }.getOrDefault(LocalDate.now().dayOfMonth)
                            changed.put("task_recurrence_anchor_day", anchor)
                        } else {
                            changed.put("task_recurrence_anchor_day", JSONObject.NULL)
                        }
                        onChange(changed)
                    },
                    label = { Text(label) },
                )
            }
        }
        if (text("task_recurrence").isNotBlank()) {
            val interval = values.optInt("task_recurrence_interval", 1).coerceAtLeast(1)
            OutlinedTextField(
                value = interval.toString(),
                onValueChange = { value ->
                    value.toIntOrNull()?.takeIf { it >= 1 }?.let { change("task_recurrence_interval", it) }
                },
                label = { Text("Repeat interval") },
                supportingText = { Text("Number of ${when (text("task_recurrence")) { "daily" -> "days"; "weekly" -> "weeks"; else -> "months" }} between tasks") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}


/** Recompute only scheduling fields after an explicit date, lead, or repeat-rule edit. */
private fun reanchorReminder(values: JSONObject): JSONObject {
    val due = if (values.isNull("due_date")) "" else values.optString("due_date")
    val lead = if (values.isNull("reminder_minutes_before")) 0 else values.optInt("reminder_minutes_before").coerceAtLeast(0)
    val anchor = runCatching { Instant.parse(due).minusSeconds(lead.toLong() * 60).toString() }.getOrNull()
    val recurrence = values.optJSONObject("reminder_recurrence")?.let { JSONObject(it.toString()) }
    if (recurrence != null && anchor != null) {
        recurrence.put("start_at", anchor)
        values.put("reminder_recurrence", recurrence)
    }
    return values.put("reminder_next_trigger_at", anchor ?: JSONObject.NULL)
        .put("reminder_timezone", ZoneId.systemDefault().id)
        .put("reminder_snoozed_until", JSONObject.NULL)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReminderRecurrenceFields(values: JSONObject, onChange: (JSONObject) -> Unit) {
    val recurrence = values.optJSONObject("reminder_recurrence")
    val frequency = recurrence?.optString("frequency", "once") ?: "once"
    var scheduleError by remember { mutableStateOf<String?>(null) }
    fun editRule(change: (JSONObject) -> Unit) {
        val rule = recurrence?.let { JSONObject(it.toString()) } ?: JSONObject().put("frequency", "once").put("interval", 1)
        change(rule)
        val changed = JSONObject(values.toString()).put("reminder_recurrence", rule)
        if (changed.isNull("reminder_minutes_before")) changed.put("reminder_minutes_before", 0)
        onChange(reanchorReminder(changed))
    }
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Repeat reminder", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            listOf("Once" to "once", "Daily" to "daily", "Weekly" to "weekly", "Monthly" to "monthly").forEach { (label, nextFrequency) ->
                FilterChip(
                    modifier = Modifier.heightIn(min = 48.dp),
                    selected = frequency == nextFrequency,
                    onClick = {
                        scheduleError = null
                        editRule { rule ->
                            rule.put("frequency", nextFrequency).put("interval", rule.optInt("interval", 1).coerceAtLeast(1))
                            if (nextFrequency == "once") rule.put("end_at", JSONObject.NULL)
                        }
                    },
                    label = { Text(label) },
                )
            }
        }
        if (frequency != "once") {
            OutlinedTextField(
                value = (recurrence?.optInt("interval", 1) ?: 1).coerceAtLeast(1).toString(),
                onValueChange = { input ->
                    input.toIntOrNull()?.takeIf { it >= 1 }?.let { interval ->
                        editRule { it.put("interval", interval) }
                    }
                },
                label = { Text("Reminder repeat interval") },
                supportingText = { Text("Number of ${when (frequency) { "daily" -> "days"; "weekly" -> "weeks"; else -> "months" }} between reminders") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            if (frequency == "weekly") {
                val daysArray = recurrence?.optJSONArray("weekdays")
                val weekdays = (0 until (daysArray?.length() ?: 0)).mapNotNull { index -> daysArray?.optInt(index)?.takeIf { it in 0..6 } }.toSet()
                Text("Weekdays (optional)", style = MaterialTheme.typography.labelLarge)
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat").forEachIndexed { day, label ->
                        FilterChip(
                            modifier = Modifier.heightIn(min = 48.dp),
                            selected = day in weekdays,
                            onClick = {
                                val next = if (day in weekdays) weekdays - day else weekdays + day
                                editRule { it.put("weekdays", JSONArray(next.sorted())) }
                            },
                            label = { Text(label) },
                        )
                    }
                }
                if (weekdays.isEmpty()) Text("Uses the weekday of the first reminder.", style = MaterialTheme.typography.bodySmall)
            }
            val endAt = if (recurrence == null || recurrence.isNull("end_at")) "" else recurrence.optString("end_at")
            NativeDateTimeField(
                label = "Stop repeating (optional)",
                value = endAt,
                onChange = { end ->
                    val anchor = runCatching {
                        val lead = if (values.isNull("reminder_minutes_before")) 0 else values.optInt("reminder_minutes_before")
                        Instant.parse(values.optString("due_date")).minusSeconds(lead.toLong() * 60)
                    }.getOrNull()
                    if (end.isNotBlank() && anchor != null && runCatching { Instant.parse(end) < anchor }.getOrDefault(false)) {
                        scheduleError = "The stop date must be on or after the first reminder."
                    } else {
                        scheduleError = null
                        editRule { it.put("end_at", end.ifBlank { null } ?: JSONObject.NULL) }
                    }
                },
            )
        }
        val existingEnd = recurrence?.optString("end_at")?.takeUnless { it.isBlank() || it == "null" }
        val invalidExistingEnd = runCatching {
            val anchor = Instant.parse(recurrence?.optString("start_at"))
            existingEnd != null && Instant.parse(existingEnd) < anchor
        }.getOrDefault(false)
        val error = scheduleError ?: if (invalidExistingEnd) "The stop date is before the first reminder. Choose a later stop date or clear it." else null
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
