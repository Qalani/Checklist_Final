package com.zenworkspace.app.util

import org.junit.Assert.*
import org.junit.Test
import java.time.ZoneId
import java.util.TimeZone

class CalendarImportTest {
    private fun calendar(vararg events: String): String = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
        events.joinToString("\r\n") { "BEGIN:VEVENT\r\n$it\r\nEND:VEVENT" } + "\r\nEND:VCALENDAR\r\n"

    @Test fun `imports UTC times and unfolds escaped text`() {
        val result = CalendarImport.parse(calendar("UID:one\r\nSUMMARY:Planning\\, work\r\nDESCRIPTION:First\\nSecond\\; \\p\r\n continuation\r\nLOCATION:Room\\, 1\r\nDTSTART:20261031T090000Z\r\nDTEND:20261031T103000Z"), "team.ics").single()
        assertEquals("Planning, work", result.getString("title"))
        assertEquals("First\nSecond; \\pcontinuation", result.getString("description"))
        assertEquals("Room, 1", result.getString("location"))
        assertEquals("2026-10-31T09:00:00Z", result.getString("start_time"))
        assertEquals("2026-10-31T10:30:00Z", result.getString("end_time"))
        assertEquals("team.ics", result.getString("import_source"))
        assertFalse(result.getBoolean("all_day"))
    }

    @Test fun `all day end is exclusive UTC midnight`() {
        val result = CalendarImport.parse(calendar("SUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261103")).single()
        assertTrue(result.getBoolean("all_day"))
        assertEquals("2026-10-31T00:00:00Z", result.getString("start_time"))
        assertEquals("2026-11-03T00:00:00Z", result.getString("end_time"))
    }

    @Test fun `all day and timed missing ends use documented defaults`() {
        val result = CalendarImport.parse(calendar("DTSTART;VALUE=DATE:20261031", "DTSTART:20261031T090000Z"))
        assertEquals("2026-11-01T00:00:00Z", result[0].getString("end_time"))
        assertEquals("2026-10-31T10:00:00Z", result[1].getString("end_time"))
    }

    @Test fun `quoted IANA timezone respects daylight saving`() {
        val result = CalendarImport.parse(calendar("DTSTART;TZID=\"Europe/London\":20260701T090000\r\nDTEND;TZID=Europe/London:20260701T100000")).single()
        assertEquals("2026-07-01T08:00:00Z", result.getString("start_time"))
        assertEquals("2026-07-01T09:00:00Z", result.getString("end_time"))
    }

    @Test fun `floating date time uses local zone and restores test default`() {
        val previous = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"))
            assertEquals(ZoneId.of("America/New_York"), ZoneId.systemDefault())
            val result = CalendarImport.parse(calendar("DTSTART:20261031T090000")).single()
            assertEquals("2026-10-31T13:00:00Z", result.getString("start_time"))
        } finally { TimeZone.setDefault(previous) }
    }

    @Test fun `UID-less event identifiers are stable`() {
        val source = calendar("SUMMARY:Focus\r\nDTSTART:20261031T090000Z")
        val first = CalendarImport.parse(source).single().getString("import_uid")
        assertEquals(first, CalendarImport.parse(source).single().getString("import_uid"))
        assertNotEquals(first, CalendarImport.parse(source.replace("Focus", "Read")).single().getString("import_uid"))
    }

    @Test fun `duration is respected and nested alarms are ignored`() {
        val result = CalendarImport.parse(calendar("DTSTART:20261031T090000Z\r\nDURATION:PT90M\r\nBEGIN:VALARM\r\nDESCRIPTION:Alarm\r\nTRIGGER:-PT15M\r\nEND:VALARM")).single()
        assertEquals("2026-10-31T10:30:00Z", result.getString("end_time"))
        assertTrue(result.isNull("description"))
    }

    @Test fun `multiple attendees are allowed without treating them as duplicate fields`() {
        val result = CalendarImport.parse(calendar("UID:meeting@example.com\r\nDTSTART:20261031T090000Z\r\nATTENDEE:mailto:a@example.com\r\nATTENDEE:mailto:b@example.com")).single()
        assertEquals("Imported event", result.getString("title"))
        assertEquals(64, result.getString("import_uid").length)
    }

    @Test fun `duplicate UIDs fail without partial import`() {
        expectFailure("duplicate") { CalendarImport.parse(calendar("UID:x\r\nDTSTART:20261031T090000Z", "UID:x\r\nDTSTART:20261101T090000Z")) }
    }

    @Test fun `invalid dates timezone recurrence and incomplete calendars are rejected`() {
        expectFailure("invalid") { CalendarImport.parse(calendar("DTSTART:20260230T090000Z")) }
        expectFailure("timezone") { CalendarImport.parse(calendar("DTSTART;TZID=Unknown/Zone:20261031T090000")) }
        expectFailure("Recurring") { CalendarImport.parse(calendar("DTSTART:20261031T090000Z\r\nRRULE:FREQ=DAILY")) }
        expectFailure("after") { CalendarImport.parse(calendar("DTSTART:20261031T090000Z\r\nDTEND:20261030T090000Z")) }
        expectFailure("incomplete") { CalendarImport.parse("BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261031T090000Z") }
    }

    @Test fun `resource limits reject oversized and overfull imports`() {
        expectFailure("1 MiB") { CalendarImport.parse("x".repeat(1024 * 1024 + 1)) }
        expectFailure("1 MiB") { CalendarImport.parse("é".repeat(600000)) }
        expectFailure("1,000") { CalendarImport.parse(calendar(*Array(1001) { "UID:$it\r\nDTSTART:20261031T090000Z" })) }
    }

    private fun expectFailure(message: String, block: () -> Unit) {
        try { block(); fail("Expected an import error containing $message") }
        catch (error: IllegalArgumentException) { assertTrue(error.message.orEmpty(), error.message.orEmpty().contains(message, ignoreCase = true)) }
    }
}
