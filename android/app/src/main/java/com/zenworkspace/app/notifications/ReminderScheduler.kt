package com.zenworkspace.app.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.AtomicFile
import com.zenworkspace.app.util.ReminderTime
import java.io.File
import java.time.Instant
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject

/** Device-local reminders survive process death and are rebuilt after reboot. */
object ReminderScheduler {
    private val lock = Any()
    private const val FILE_NAME = "native-reminder-alarms.json"

    fun schedule(context: Context, tasks: List<JSONObject>, reminders: List<JSONObject>, accountId: String) = synchronized(lock) {
        val app = context.applicationContext
        val previous = read(app)
        val entries = JSONArray()
        val now = Instant.now()
        tasks.filterNot { it.optBoolean("completed") }.forEach { task ->
            taskEntry(task, now)?.let { entries.put(it) }
        }
        reminders.forEach { reminder ->
            val at = parseInstant(reminder.optString("remind_at"))
            if (at != null && at >= now && reminder.optString("id").isNotBlank()) {
                entries.put(JSONObject().put("id", "reminder:${reminder.getString("id")}")
                    .put("title", reminder.optString("title", "Zen reminder"))
                    .put("body", reminder.textOrNull("description") ?: "Time for your Zen reminder")
                    .put("at", at.toEpochMilli()))
            }
        }
        val updated = JSONObject().put("account_id", accountId).put("entries", entries)
        if (updated.toString() == previous.toString()) return@synchronized
        // Persist before installing alarms: a process death may miss an alarm,
        // but cannot expose a previous account's reminder after account changes.
        write(app, updated)
        if (previous.optString("account_id").isNotBlank() && previous.optString("account_id") != accountId) {
            app.getSystemService(android.app.NotificationManager::class.java).cancelAll()
        }
        previous.entries().forEach { cancel(app, previous.optString("account_id"), it.getString("id")) }
        entries.objects().forEach { install(app, accountId, it) }
    }

    fun cancelAll(context: Context) = synchronized(lock) {
        val app = context.applicationContext
        val previous = read(app)
        write(app, JSONObject())
        previous.entries().forEach { cancel(app, previous.optString("account_id"), it.getString("id")) }
        app.getSystemService(android.app.NotificationManager::class.java).cancelAll()
    }

    fun restore(context: Context) = synchronized(lock) {
        val saved = read(context)
        val account = saved.optString("account_id")
        if (account.isBlank()) return@synchronized
        val now = Instant.now()
        val entries = JSONArray()
        saved.entries().forEach { entry ->
            val task = entry.optJSONObject("task")
            val refreshed = if (task == null) entry.takeIf { it.optLong("at") >= now.toEpochMilli() } else taskEntry(task, now)
            refreshed?.let { entries.put(it) }
        }
        saved.put("entries", entries)
        write(context, saved)
        entries.objects().forEach { install(context, account, it) }
    }

    fun deliver(context: Context, intent: Intent) = synchronized(lock) {
        val saved = read(context)
        val account = intent.getStringExtra("account_id") ?: return@synchronized
        if (saved.optString("account_id") != account) return@synchronized
        val id = intent.getStringExtra("reminder_id") ?: return@synchronized
        val expectedAt = intent.getLongExtra("at", -1)
        val entry = saved.entries().find { it.optString("id") == id && it.optLong("at") == expectedAt } ?: return@synchronized
        PushNotifications.show(context, entry.optString("title"), entry.optString("body"), id)
        val future = entry.optJSONObject("task")?.let { taskEntry(it, Instant.ofEpochMilli(maxOf(System.currentTimeMillis(), expectedAt) + 1)) }
        val entries = JSONArray()
        saved.entries().filterNot { it.optString("id") == id }.forEach { entries.put(it) }
        future?.let { entries.put(it) }
        saved.put("entries", entries)
        write(context, saved)
        future?.let { install(context, account, it) }
    }

    private fun taskEntry(task: JSONObject, now: Instant): JSONObject? {
        val id = task.optString("id").takeIf { it.isNotBlank() } ?: return null
        val rule = task.optJSONObject("reminder_recurrence")
        val due = parseInstant(task.optString("due_date"))
        val minutes = if (task.has("reminder_minutes_before") && !task.isNull("reminder_minutes_before")) task.optInt("reminder_minutes_before").takeIf { it >= 0 } else null
        val anchor = parseInstant(rule?.optString("start_at"))
            ?: parseInstant(task.optString("reminder_next_trigger_at"))
            ?: (if (due != null && minutes != null) due.minusSeconds(minutes.toLong() * 60) else null)
            ?: return null
        val zone = runCatching { ZoneId.of(task.optString("reminder_timezone")) }.getOrDefault(ZoneId.systemDefault())
        val recurrence = rule?.let {
            ReminderTime.Recurrence(it.optString("frequency", "once"), it.optInt("interval", 1),
                it.optJSONArray("weekdays").numbers(), it.optJSONArray("monthdays").numbers(), parseInstant(it.optString("end_at")))
        }
        val at = ReminderTime.next(anchor, now, recurrence, parseInstant(task.optString("reminder_snoozed_until")), zone) ?: return null
        return JSONObject().put("id", "task:$id").put("title", task.optString("title", "Task reminder"))
            .put("body", task.textOrNull("description") ?: "Your task is due soon")
            .put("at", at.toEpochMilli()).put("task", JSONObject(task.toString()))
    }

    private fun install(context: Context, account: String, entry: JSONObject) {
        val pending = alarmIntent(context, account, entry.getString("id"), PendingIntent.FLAG_UPDATE_CURRENT, entry.getLong("at"))
            ?: return
        val alarm = context.getSystemService(AlarmManager::class.java)
        // These alarms are intentionally inexact; Android may defer them in Doze.
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.getLong("at"), pending)
    }

    private fun cancel(context: Context, account: String, id: String) {
        val pending = alarmIntent(context, account, id, PendingIntent.FLAG_NO_CREATE) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
    }

    private fun alarmIntent(context: Context, account: String, id: String, flags: Int, at: Long = -1): PendingIntent? {
        val intent = Intent(context, ReminderReceiver::class.java)
            .setData(Uri.Builder().scheme("zen-reminder").authority("alarm").appendPath(account).appendPath(id).build())
            .putExtra("account_id", account).putExtra("reminder_id", id).putExtra("at", at)
        return PendingIntent.getBroadcast(context, 0, intent, flags or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun read(context: Context): JSONObject = runCatching {
        JSONObject(AtomicFile(File(context.noBackupFilesDir, FILE_NAME)).openRead().bufferedReader().use { it.readText() })
    }.getOrDefault(JSONObject())

    private fun write(context: Context, value: JSONObject) {
        val file = AtomicFile(File(context.noBackupFilesDir, FILE_NAME))
        val stream = file.startWrite()
        try {
            stream.write(value.toString().toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
    }

    private fun JSONObject.entries() = optJSONArray("entries").objects()
    private fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
    private fun JSONArray?.numbers(): List<Int> = if (this == null) emptyList() else (0 until length()).map { optInt(it, -1) }
    private fun JSONObject.textOrNull(key: String): String? = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
    private fun parseInstant(value: String?): Instant? = value?.takeIf { it.isNotBlank() && it != "null" }?.let { runCatching { Instant.parse(it) }.getOrNull() }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { ReminderScheduler.deliver(context, intent) }
}

class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) {
            ReminderScheduler.restore(context)
        }
    }
}
