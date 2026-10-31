package com.zenworkspace.app.util

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/** Pure scheduling logic shared by the alarm receiver and foreground refresh. */
object ReminderTime {
    data class Recurrence(
        val frequency: String = "once",
        val interval: Int = 1,
        val weekdays: List<Int> = emptyList(), // Sunday = 0
        val monthdays: List<Int> = emptyList(),
        val endAt: Instant? = null,
    )

    fun next(
        anchor: Instant,
        from: Instant,
        recurrence: Recurrence? = null,
        snoozedUntil: Instant? = null,
        zone: ZoneId = ZoneId.systemDefault(),
    ): Instant? {
        val limit = recurrence?.endAt
        if (snoozedUntil != null && snoozedUntil >= from && (limit == null || snoozedUntil <= limit)) return snoozedUntil
        if (anchor >= from) return anchor.takeIf { limit == null || it <= limit }
        val rule = recurrence ?: return null
        val interval = rule.interval.coerceAtLeast(1).toLong()
        val start = anchor.atZone(zone)
        val reference = from.atZone(zone)
        val next = when (rule.frequency) {
            "daily" -> {
                val elapsed = ChronoUnit.DAYS.between(start.toLocalDate(), reference.toLocalDate()).coerceAtLeast(0)
                var candidate = start.plusDays(elapsed / interval * interval)
                if (candidate.toInstant() < from) candidate = candidate.plusDays(interval)
                candidate
            }
            "weekly" -> nextWeekly(start, reference, interval, rule.weekdays)
            "monthly" -> nextMonthly(start, reference, interval, rule.monthdays)
            else -> return null
        }.toInstant()
        return next.takeIf { limit == null || it <= limit }
    }

    private fun nextWeekly(start: ZonedDateTime, reference: ZonedDateTime, interval: Long, weekdays: List<Int>): ZonedDateTime {
        val days = weekdays.filter { it in 0..6 }.distinct().sorted().ifEmpty { listOf(start.dayOfWeek.value % 7) }
        val weekStart = start.toLocalDate().minusDays((start.dayOfWeek.value % 7).toLong())
        val elapsedWeeks = (ChronoUnit.DAYS.between(weekStart, reference.toLocalDate()) / 7).coerceAtLeast(0)
        var cycle = elapsedWeeks / interval * interval
        while (true) {
            for (day in days) {
                val candidate = weekStart.plusWeeks(cycle).plusDays(day.toLong()).atTime(start.toLocalTime()).atZone(start.zone)
                if (candidate >= start && candidate >= reference) return candidate
            }
            cycle += interval
        }
    }

    private fun nextMonthly(start: ZonedDateTime, reference: ZonedDateTime, interval: Long, monthdays: List<Int>): ZonedDateTime {
        val days = monthdays.filter { it in 1..31 }.distinct().sorted().ifEmpty { listOf(start.dayOfMonth) }
        val startMonth = java.time.YearMonth.from(start)
        val elapsedMonths = ChronoUnit.MONTHS.between(startMonth, java.time.YearMonth.from(reference)).coerceAtLeast(0)
        var cycle = elapsedMonths / interval * interval
        while (true) {
            val month = startMonth.plusMonths(cycle)
            for (day in days) {
                val candidate = month.atDay(day.coerceAtMost(month.lengthOfMonth())).atTime(start.toLocalTime()).atZone(start.zone)
                if (candidate >= start && candidate >= reference) return candidate
            }
            cycle += interval
        }
    }
}
