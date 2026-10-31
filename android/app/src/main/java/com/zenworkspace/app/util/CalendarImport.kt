package com.zenworkspace.app.util

import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.DateTimeException
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import java.util.Locale

/** Bounded iCalendar importer. No HTML, scripts or remote calendar references are evaluated. */
object CalendarImport {
    private const val MAX_BYTES = 1024 * 1024
    private const val MAX_EVENTS = 1000
    private val dateFormat = DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT)
    private val timeFormat = DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss").withResolverStyle(ResolverStyle.STRICT)
    private val shortTimeFormat = DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmm").withResolverStyle(ResolverStyle.STRICT)
    private data class Property(val name: String, val params: Map<String, String>, val value: String)
    private data class CalendarTime(val instant: Instant, val allDay: Boolean)

    fun parse(source: String, importSource: String = "android-ics"): List<JSONObject> {
        require(source.length <= MAX_BYTES && source.toByteArray(StandardCharsets.UTF_8).size <= MAX_BYTES) {
            "Calendar files must be 1 MiB or smaller."
        }
        require(importSource.isNotBlank() && importSource.length <= 255) { "The calendar source name is invalid." }
        val unfolded = mutableListOf<StringBuilder>()
        source.removePrefix("\uFEFF").replace("\r\n", "\n").replace('\r', '\n').split('\n').forEach { line ->
            if (line.startsWith(' ') || line.startsWith('\t')) {
                require(unfolded.isNotEmpty()) { "The calendar starts with an invalid folded line." }
                unfolded.last().append(line, 1, line.length)
            } else if (line.isNotBlank()) {
                unfolded += StringBuilder(line)
            }
        }
        val stack = mutableListOf<String>()
        val events = mutableListOf<JSONObject>()
        val seenUids = mutableSetOf<String>()
        var calendarSeen = false
        var calendarEnded = false
        var properties: MutableMap<String, Property>? = null
        unfolded.forEachIndexed { lineIndex, line ->
            val property = property(line.toString(), lineIndex + 1)
            if (property.name == "BEGIN") {
                val component = property.value.uppercase(Locale.ROOT)
                require(!calendarEnded) { "Unexpected content after END:VCALENDAR." }
                if (component == "VCALENDAR") {
                    require(stack.isEmpty() && !calendarSeen) { "The file must contain one VCALENDAR." }
                    calendarSeen = true
                } else {
                    require(stack.isNotEmpty()) { "The calendar is missing BEGIN:VCALENDAR." }
                }
                if (component == "VEVENT") {
                    require(stack.lastOrNull() == "VCALENDAR") { "VEVENT must be inside VCALENDAR." }
                    require(events.size < MAX_EVENTS) { "Import at most 1,000 events at a time." }
                    properties = linkedMapOf()
                }
                stack += component
            } else if (property.name == "END") {
                val component = property.value.uppercase(Locale.ROOT)
                require(stack.lastOrNull() == component) { "Mismatched calendar component at line ${lineIndex + 1}." }
                if (component == "VEVENT") {
                    val record = event(requireNotNull(properties), importSource, events.size + 1)
                    require(seenUids.add(record.getString("import_uid"))) {
                        "The calendar contains duplicate event UIDs. Export unique events and try again."
                    }
                    events += record
                    properties = null
                }
                stack.removeAt(stack.lastIndex)
                if (component == "VCALENDAR") calendarEnded = true
            } else {
                require(stack.isNotEmpty()) { "Unexpected calendar property at line ${lineIndex + 1}." }
                if (stack.last() == "VEVENT") {
                    val target = requireNotNull(properties)
                    val relevant = setOf("UID", "SUMMARY", "DESCRIPTION", "LOCATION", "DTSTART", "DTEND", "DURATION", "RRULE", "RDATE", "RECURRENCE-ID", "EXDATE")
                    if (property.name in relevant) {
                        require(property.name !in target) { "Duplicate ${property.name} in calendar event ${events.size + 1}." }
                        target[property.name] = property
                    }
                }
            }
        }
        require(calendarSeen && calendarEnded && stack.isEmpty()) { "The calendar is incomplete; BEGIN/END:VCALENDAR is required." }
        require(events.isNotEmpty()) { "No events were found in this calendar file." }
        return events
    }

    private fun event(properties: Map<String, Property>, importSource: String, index: Int): JSONObject {
        require(listOf("RRULE", "RDATE", "RECURRENCE-ID", "EXDATE").none(properties::containsKey)) {
            "Recurring calendar events are not supported. Export individual occurrences before importing."
        }
        val startProperty = properties["DTSTART"] ?: throw IllegalArgumentException("Event $index is missing DTSTART.")
        val start = time(startProperty, index)
        val endProperty = properties["DTEND"]
        val durationProperty = properties["DURATION"]
        require(endProperty == null || durationProperty == null) { "Event $index has both DTEND and DURATION." }
        val end = when {
            endProperty != null -> time(endProperty, index).also {
                require(it.allDay == start.allDay) { "Event $index must use matching DTSTART and DTEND date types." }
            }.instant
            durationProperty != null -> {
                val duration = duration(durationProperty.value, start.allDay, index)
                runCatching { start.instant.plus(duration) }.getOrElse { throw IllegalArgumentException("Event $index has an invalid duration.") }
            }
            else -> start.instant.plusSeconds(if (start.allDay) 86400 else 3600)
        }
        require(end > start.instant) { "Event $index must end after it starts." }
        val title = properties["SUMMARY"]?.value?.let(::unescape)?.trim().orEmpty().ifBlank { "Imported event" }
        val description = properties["DESCRIPTION"]?.value?.let(::unescape)
        val location = properties["LOCATION"]?.value?.let(::unescape)
        val suppliedUid = properties["UID"]?.value?.let(::unescape)?.trim().orEmpty()
        // UID-less files remain idempotent across repeated imports and process restarts.
        val uid = if (suppliedUid.isNotBlank()) sha256(suppliedUid) else {
            "android-" + sha256(listOf(title, description.orEmpty(), location.orEmpty(), start.instant.toString(), end.toString()).joinToString("\u001F"))
        }
        return JSONObject().put("title", title)
            .put("description", description ?: JSONObject.NULL)
            .put("location", location ?: JSONObject.NULL)
            .put("start_time", start.instant.toString()).put("end_time", end.toString())
            .put("all_day", start.allDay).put("import_uid", uid).put("import_source", importSource)
    }

    private fun time(property: Property, index: Int): CalendarTime {
        val value = property.value.trim()
        val dateOnly = property.params["VALUE"]?.uppercase(Locale.ROOT) == "DATE" || value.matches(Regex("\\d{8}"))
        try {
            if (dateOnly) {
                require(value.matches(Regex("\\d{8}"))) { "Event $index has an invalid all-day date." }
                return CalendarTime(LocalDate.parse(value, dateFormat).atStartOfDay(ZoneOffset.UTC).toInstant(), true)
            }
            val isUtc = value.endsWith('Z', ignoreCase = true)
            val localValue = if (isUtc) value.dropLast(1) else value
            val formatter = if (localValue.length == 13) shortTimeFormat else timeFormat
            val local = LocalDateTime.parse(localValue, formatter)
            val zone = if (isUtc) ZoneOffset.UTC else property.params["TZID"]?.let { tzid ->
                try { ZoneId.of(tzid) } catch (_: DateTimeException) {
                    throw IllegalArgumentException("Unable to import timezone '$tzid'. Export the calendar with IANA timezone names or UTC times.")
                }
            } ?: ZoneId.systemDefault()
            return CalendarTime(local.atZone(zone).toInstant(), false)
        } catch (error: IllegalArgumentException) {
            throw error
        } catch (_: DateTimeException) {
            throw IllegalArgumentException("Event $index has an invalid ${property.name} date or time.")
        }
    }

    private fun duration(value: String, allDay: Boolean, index: Int): Duration {
        val result = runCatching {
            if (value.matches(Regex("P\\d+W"))) {
                Duration.ofDays(Math.multiplyExact(value.substring(1, value.length - 1).toLong(), 7))
            } else Duration.parse(value)
        }.getOrElse { throw IllegalArgumentException("Event $index has an invalid DURATION.") }
        require(!result.isNegative && !result.isZero) { "Event $index must have a positive duration." }
        require(!allDay || result.seconds % 86400L == 0L) { "All-day event $index must have a duration of whole days." }
        return result
    }

    private fun property(line: String, lineNumber: Int): Property {
        var quoted = false
        var separator = -1
        for (index in line.indices) {
            when (line[index]) {
                '"' -> quoted = !quoted
                ':' -> if (!quoted) { separator = index; break }
            }
        }
        require(separator > 0 && !quoted) { "Invalid calendar property at line $lineNumber." }
        val header = line.substring(0, separator)
        val parts = mutableListOf<String>()
        var start = 0
        quoted = false
        header.forEachIndexed { index, character ->
            if (character == '"') quoted = !quoted
            if (character == ';' && !quoted) {
                parts += header.substring(start, index)
                start = index + 1
            }
        }
        parts += header.substring(start)
        val params = linkedMapOf<String, String>()
        parts.drop(1).forEach { parameter ->
            val equals = parameter.indexOf('=')
            require(equals > 0) { "Invalid calendar parameter at line $lineNumber." }
            params[parameter.substring(0, equals).uppercase(Locale.ROOT)] = parameter.substring(equals + 1).removeSurrounding("\"")
        }
        return Property(parts[0].uppercase(Locale.ROOT), params, line.substring(separator + 1))
    }

    private fun unescape(value: String): String = buildString {
        var index = 0
        while (index < value.length) {
            val character = value[index++]
            if (character == '\\' && index < value.length) {
                when (val escaped = value[index++]) {
                    'n', 'N' -> append('\n')
                    ',', ';', '\\' -> append(escaped)
                    else -> { append('\\'); append(escaped) }
                }
            } else append(character)
        }
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
