package com.zenworkspace.app.util

import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId

/** Calendar arithmetic retains the user's local due time across DST changes. */
object TaskRecurrence {
    fun monthlyAnchor(dueDate: String, storedAnchor: Int? = null, zone: ZoneId = ZoneId.systemDefault()): Int {
        return storedAnchor?.takeIf { it in 1..31 } ?: Instant.parse(dueDate).atZone(zone).dayOfMonth
    }

    fun nextDue(
        currentDueDate: String,
        recurrence: String,
        interval: Int = 1,
        anchorDay: Int? = null,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        require(interval > 0) { "Task recurrence requires a positive interval." }
        val current = Instant.parse(currentDueDate).atZone(zone)
        val next = when (recurrence) {
            "daily" -> current.plusDays(interval.toLong())
            "weekly" -> current.plusWeeks(interval.toLong())
            "monthly" -> {
                val targetMonth = YearMonth.from(current).plusMonths(interval.toLong())
                val day = monthlyAnchor(currentDueDate, anchorDay, zone).coerceAtMost(targetMonth.lengthOfMonth())
                targetMonth.atDay(day).atTime(current.toLocalTime()).atZone(zone)
            }
            else -> throw IllegalArgumentException("Unsupported task recurrence: $recurrence")
        }
        return next.toInstant().toString()
    }
}
