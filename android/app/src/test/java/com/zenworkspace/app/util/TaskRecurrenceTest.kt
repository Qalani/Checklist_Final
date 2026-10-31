package com.zenworkspace.app.util

import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class TaskRecurrenceTest {
    private val utc = ZoneId.of("UTC")

    @Test fun january31ClampsInFebruaryAndRestoresMarchAnchor() {
        val february = TaskRecurrence.nextDue("2025-01-31T09:30:00Z", "monthly", anchorDay = 31, zone = utc)
        assertEquals("2025-02-28T09:30:00Z", february)
        assertEquals("2025-03-31T09:30:00Z", TaskRecurrence.nextDue(february, "monthly", anchorDay = 31, zone = utc))
    }

    @Test fun leapYearFebruaryHas29Days() {
        assertEquals("2024-02-29T09:30:00Z", TaskRecurrence.nextDue("2024-01-31T09:30:00Z", "monthly", zone = utc))
    }

    @Test fun dailyPreservesLocalTimeAcrossSpringDst() {
        assertEquals("2026-03-29T08:30:00Z", TaskRecurrence.nextDue("2026-03-28T09:30:00Z", "daily", zone = ZoneId.of("Europe/London")))
    }

    @Test fun weeklyPreservesLocalTimeAcrossAutumnDst() {
        assertEquals("2026-11-01T09:30:00Z", TaskRecurrence.nextDue("2026-10-25T09:30:00Z", "weekly", zone = ZoneId.of("Europe/London")))
        assertEquals("2026-10-25T09:30:00Z", TaskRecurrence.nextDue("2026-10-18T08:30:00Z", "weekly", zone = ZoneId.of("Europe/London")))
    }

    @Test fun monthlyIntervalCrossesYearBoundary() {
        assertEquals("2027-01-31T18:15:00Z", TaskRecurrence.nextDue("2026-11-30T18:15:00Z", "monthly", 2, 31, utc))
    }

    @Test fun invalidStoredAnchorFallsBackToDueDate() {
        assertEquals(12, TaskRecurrence.monthlyAnchor("2026-06-12T10:00:00Z", 32, utc))
    }

    @Test(expected = IllegalArgumentException::class) fun zeroIntervalIsRejected() {
        TaskRecurrence.nextDue("2026-06-12T10:00:00Z", "daily", 0, zone = utc)
    }

    @Test(expected = IllegalArgumentException::class) fun unknownFrequencyIsRejected() {
        TaskRecurrence.nextDue("2026-06-12T10:00:00Z", "hourly", zone = utc)
    }
}
