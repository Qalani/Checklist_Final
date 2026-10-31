package com.zenworkspace.app.util

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReminderTimeTest {
    private val utc = ZoneId.of("UTC")
    private fun instant(value: String) = Instant.parse(value)

    @Test fun overdueOneShotDoesNotNotifyOnEveryRefresh() {
        assertNull(ReminderTime.next(instant("2026-10-01T09:00:00Z"), instant("2026-10-02T09:00:00Z")))
    }

    @Test fun snoozedOneShotSchedulesAtSnoozeTime() {
        assertEquals(instant("2026-10-02T10:00:00Z"), ReminderTime.next(instant("2026-10-02T09:00:00Z"), instant("2026-10-02T09:15:00Z"), snoozedUntil = instant("2026-10-02T10:00:00Z")))
    }

    @Test fun dailyScheduleCanAdvanceYearsWithoutIterationLimit() {
        assertEquals(instant("2026-10-31T09:00:00Z"), ReminderTime.next(instant("2020-01-01T09:00:00Z"), instant("2026-10-31T08:00:00Z"), ReminderTime.Recurrence("daily"), zone = utc))
    }

    @Test fun weeklySelectedDaysRespectTwoWeekInterval() {
        assertEquals(instant("2026-11-09T09:00:00Z"), ReminderTime.next(instant("2026-10-26T09:00:00Z"), instant("2026-10-29T09:00:00Z"), ReminderTime.Recurrence("weekly", 2, weekdays = listOf(1, 3)), zone = utc))
    }

    @Test fun monthly31ClampsAndRestoresAnchor() {
        val rule = ReminderTime.Recurrence("monthly", monthdays = listOf(31))
        assertEquals(instant("2027-02-28T09:00:00Z"), ReminderTime.next(instant("2027-01-31T09:00:00Z"), instant("2027-02-01T09:00:00Z"), rule, zone = utc))
        assertEquals(instant("2027-03-31T09:00:00Z"), ReminderTime.next(instant("2027-01-31T09:00:00Z"), instant("2027-03-01T09:00:00Z"), rule, zone = utc))
    }

    @Test fun recurrenceEndIsEnforcedEvenBeforeFirstOccurrence() {
        assertNull(ReminderTime.next(instant("2027-01-31T09:00:00Z"), instant("2027-01-01T09:00:00Z"), ReminderTime.Recurrence("daily", endAt = instant("2027-01-30T09:00:00Z")), zone = utc))
    }

    @Test fun recurringReminderPreservesLocalWallTimeAcrossDst() {
        assertEquals(instant("2026-03-29T08:00:00Z"), ReminderTime.next(instant("2026-03-28T09:00:00Z"), instant("2026-03-29T07:00:00Z"), ReminderTime.Recurrence("daily"), zone = ZoneId.of("Europe/London")))
    }
}
