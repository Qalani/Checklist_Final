package com.zenworkspace.app.data

import android.content.Context
import android.net.Uri
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.zenworkspace.app.BuildConfig
import com.zenworkspace.app.util.TaskRecurrence
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** Android-owned account state, SQLite cache and ordered, durable offline writes. */
class NativeRepository(context: Context) {
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)
    private val auth = NativeAuth(context.applicationContext)
    private val store = NativeStore(context.applicationContext)
    private val lock = Mutex()
    private val accountGeneration = AtomicLong(0)
    @Volatile private var operationGeneration = 0L
    private val cleanupScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pushPrefs = context.getSharedPreferences("zen-native-push", Context.MODE_PRIVATE)
    private val configured = BuildConfig.SUPABASE_URL.startsWith("https://") &&
        BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank() &&
        !BuildConfig.SUPABASE_URL.contains("your-project")
    private val _state = MutableStateFlow(WorkspaceState(configured = configured))
    val state: StateFlow<WorkspaceState> = _state.asStateFlow()

    init { auth.session?.let { publish(it.userId, it.email) } }

    fun clearMessage() { _state.update { it.copy(message = null) } }

    suspend fun signIn(email: String, password: String) = operation {
        requireConfigured()
        val session = auth.signIn(email.trim(), password)
        publish(session.userId, session.email)
        refreshLocked()
    }

    suspend fun signUp(email: String, password: String) = operation {
        requireConfigured()
        val session = auth.signUp(email.trim(), password)
        if (session == null) updateState { it.copy(message = "Check your email to confirm your account, then sign in.") }
        else { publish(session.userId, session.email); refreshLocked() }
    }

    suspend fun resetPassword(email: String) = operation {
        requireConfigured()
        auth.resetPassword(email.trim())
        updateState { it.copy(message = "Check your email for the password reset link.") }
    }

    suspend fun updatePassword(password: String) = operation {
        auth.updatePassword(password)
        updateState { it.copy(passwordRecovery = false, message = "Your password has been updated.") }
    }

    suspend fun signOut() {
        // Bypass the operation mutex, including a stalled refresh. Epoch checks reject its results.
        accountGeneration.incrementAndGet()
        val previous = auth.clearLocalSession()
        _state.value = WorkspaceState(configured = configured)
        val token = previous?.userId?.let { actor ->
            pushPrefs.getString(actor, null).also { pushPrefs.edit().remove(actor).apply() }
        }
        if (previous != null) cleanupScope.launch { auth.revokeSession(previous, token) }
    }

    fun beginGoogleSignIn(): Uri { requireConfigured(); return auth.beginGoogleSignIn() }

    suspend fun handleCallback(uri: Uri) = operation {
        requireConfigured()
        val session = auth.handleCallback(uri)
        publish(session.userId, session.email)
        refreshLocked()
    }

    suspend fun refresh() = operation { refreshLocked() }

    suspend fun save(table: String, values: JSONObject) = operation {
        val actor = actor()
        if (table in memberTables) {
            val id = requireId(values.optString("id"))
            val role = values.optString("role")
            require(role in setOf("editor", "viewer")) { "Choose editor or viewer access." }
            auth.authorizedRequest("/rest/v1/$table?id=eq.$id", "PATCH", JSONObject().put("role", role), mapOf("Prefer" to "return=representation")).also(::requireChanged)
            return@operation
        }
        require(table in editableTables) { "This collection cannot be edited directly." }
        val submitted = JSONObject(values.toString())
        val importedMatch = if (table == "calendar_events" && submitted.optString("import_uid").isNotBlank() && submitted.optString("import_source").isNotBlank()) {
            store.rows(actor, table).firstOrNull { it.text("import_uid") == submitted.optString("import_uid") && it.text("import_source") == submitted.optString("import_source") }?.id
        } else null
        val id = submitted.optString("id").ifBlank { importedMatch ?: UUID.randomUUID().toString() }
        requireId(id)
        val old = store.row(actor, table, id)
        checkAccess(actor, table, old, deleting = false, submitted = submitted)
        val patch = sanitize(table, submitted, creating = old == null).put("id", id)
        if (old == null) defaults(actor, table, patch)
        if (table == "tasks" && old != null && patch.has("due_date") && !patch.has("task_recurrence_anchor_day")) {
            val zone = ZoneId.systemDefault()
            val previousDay = runCatching { Instant.parse(old.getString("due_date")).atZone(zone).toLocalDate() }.getOrNull()
            val nextDay = runCatching { Instant.parse(patch.getString("due_date")).atZone(zone).toLocalDate() }.getOrNull()
            if (previousDay != nextDay) patch.put("task_recurrence_anchor_day", JSONObject.NULL)
        }
        val merged = old?.let { JSONObject(it.toString()) } ?: JSONObject()
        patch.keys().forEach { merged.put(it, patch.get(it)) }
        if (table == "tasks" || table == "lists") {
            if (old == null) merged.put("access_role", "owner")
        }
        normalizeAndValidate(table, merged, patch)
        val next = if (table == "tasks" && old != null && !old.optBoolean("completed") && merged.optBoolean("completed") && merged.optString("user_id") == actor) nextOccurrence(actor, merged) else null
        store.transaction {
            store.put(actor, table, merged)
            store.enqueue(actor, table, id, if (old == null) "INSERT" else "UPDATE", patch)
            if (next != null) {
                store.put(actor, "tasks", next)
                store.enqueue(actor, "tasks", next.getString("id"), "INSERT", next)
            }
        }
        publish(actor)
        syncPendingLocked(actor)
    }

    suspend fun delete(table: String, id: String) = operation {
        requireId(id)
        val actor = actor()
        if (table in memberTables) {
            auth.authorizedRequest("/rest/v1/$table?id=eq.$id", "DELETE", headers = mapOf("Prefer" to "return=representation")).also(::requireChanged)
            return@operation
        }
        require(table in editableTables) { "This collection cannot be deleted directly." }
        val old = store.row(actor, table, id) ?: error("This item is no longer available.")
        checkAccess(actor, table, old, deleting = true)
        store.transaction {
            store.remove(actor, table, id)
            store.enqueue(actor, table, id, "DELETE", JSONObject().put("id", id))
        }
        publish(actor)
        syncPendingLocked(actor)
    }

    /** Collaboration actions require a live connection and retain the server's RLS checks. */
    suspend fun rpc(name: String, body: JSONObject): String = operation {
        actor(); require(name in allowedRpcs) { "Unsupported action." }
        val result = auth.authorizedRequest("/rest/v1/rpc/$name", "POST", body)
        if (name != "get_task_collaborators") refreshLocked()
        result
    }

    suspend fun select(table: String, query: String): String = operation {
        actor(); require(table in readableTables + memberTables) { "Unsupported collection." }
        require(!query.contains('#') && !query.contains('?') && !query.contains('\n')) { "Invalid query." }
        auth.authorizedRequest("/rest/v1/$table?$query")
    }

    suspend fun registerPushToken(token: String) = operation {
        val actor = actor()
        require(token.isNotBlank())
        auth.authorizedRequest("/rest/v1/push_tokens?on_conflict=user_id,token", "POST", JSONObject()
            .put("user_id", actor).put("token", token).put("platform", "android").put("updated_at", Instant.now().toString()),
            mapOf("Prefer" to "resolution=merge-duplicates,return=minimal"))
        pushPrefs.edit().putString(actor, token).apply()
    }

    suspend fun unregisterPushToken(token: String) = operation { unregisterPushTokenLocked(token) }

    /** User-reviewable recovery export; never includes session credentials. */
    suspend fun exportPending(): String = withContext(Dispatchers.IO) { lock.withLock {
        val actor = actor()
        JSONArray().apply { store.pending(actor).forEach { put(JSONObject().put("table", it.table).put("operation", it.operation).put("values", it.payload)) } }.toString(2)
    } }

    /** Called only after the user explicitly confirms losing this account's unsynced edits. */
    suspend fun discardPending() = operation {
        val actor = actor()
        check(isOnline()) { "Reconnect before discarding pending edits so the server workspace can be reloaded." }
        // Validate a live session before removing local recovery data.
        auth.authorizedRequest("/auth/v1/user")
        check(auth.session?.userId == actor) { "The account changed. Please try again." }
        store.discardPending(actor)
        publish(actor)
        refreshLocked()
    }

    private suspend fun unregisterPushTokenLocked(token: String) {
        val actor = actor()
        auth.authorizedRequest("/rest/v1/push_tokens?user_id=eq.$actor&token=eq.${Uri.encode(token)}", "DELETE")
        pushPrefs.edit().remove(actor).apply()
    }

    private suspend fun refreshLocked() {
        val actor = auth.session?.userId ?: return
        if (!configured) return
        if (!isOnline()) {
            publish(actor)
            updateState { it.copy(message = "You're offline. Changes are saved on this device and will sync when connected.") }
            return
        }
        val syncError = syncPendingLocked(actor)
        var loadError: String? = null
        suspend fun load(table: String, fetch: suspend () -> List<JSONObject>) {
            if (auth.session?.userId != actor) return
            try {
                val records = fetch()
                if (auth.session?.userId == actor) store.reconcile(actor, table, records)
            } catch (failure: Exception) {
                if (failure is CancellationException) throw failure
                loadError = readableFailure(failure)
            }
        }
        load("tasks") {
            pages("/rest/v1/rpc/get_tasks_with_access?order=id.asc", "POST", JSONObject()).onEach {
                if (it.optString("user_id") == actor) it.put("access_role", "owner")
            }.sortedBy { it.optInt("order") }
        }
        load("lists") {
            val memberships = pages("/rest/v1/list_members?user_id=eq.$actor&select=id,role,list_id,list:lists(*,public_share:list_public_shares(token))&order=id.asc")
            memberships.mapNotNull { membership -> membership.optJSONObject("list")?.let { list ->
                JSONObject(list.toString()).apply {
                    put("access_role", membership.optString("role", "viewer"))
                    put("owner_id", optString("user_id"))
                    put("public_share_token", list.optJSONArray("public_share")?.optJSONObject(0)?.opt("token") ?: JSONObject.NULL)
                    remove("public_share")
                }
            } }
        }
        load("list_items") {
            val ids = store.rows(actor, "lists").map { it.id }
            ids.chunked(50).flatMap { group -> pages("/rest/v1/list_items?list_id=in.(${group.joinToString(",")})&select=*&order=position.asc,id.asc") }
        }
        for (table in listOf("categories", "notes", "calendar_events", "zen_reminders", "friends")) {
            load(table) { pages("/rest/v1/$table?user_id=eq.$actor&select=*&order=created_at.asc,id.asc") }
        }
        load("friend_requests") { pages("/rest/v1/friend_requests?or=(requester_id.eq.$actor,target_id.eq.$actor)&select=*&order=created_at.asc,id.asc") }
        publish(actor)
        updateState { it.copy(message = syncError ?: loadError) }
    }

    /** Stop on the first failed write, keeping it and every dependent edit durable. */
    private suspend fun syncPendingLocked(actor: String): String? {
        if (!configured) return "This build has no Supabase configuration. Changes are saved on this device."
        if (!isOnline()) {
            val message = "Saved on this device. Sync will retry when connected."
            updateState { it.copy(message = message) }
            return message
        }
        while (true) {
            val change = store.pending(actor).firstOrNull() ?: break
            if (auth.session?.userId != actor) return null
            try {
                val path = "/rest/v1/${change.table}"
                val response = when (change.operation) {
                    "INSERT" -> auth.authorizedRequest("$path?on_conflict=id", "POST", sanitize(change.table, change.payload, true), mapOf("Prefer" to "resolution=merge-duplicates,return=representation"))
                    "UPDATE" -> auth.authorizedRequest("$path?id=eq.${change.id}", "PATCH", sanitize(change.table, change.payload, false).apply { remove("id") }, mapOf("Prefer" to "return=representation"))
                    "DELETE" -> auth.authorizedRequest("$path?id=eq.${change.id}", "DELETE", headers = mapOf("Prefer" to "return=representation"))
                    else -> error("Unsupported queued edit")
                }
                if (change.operation == "UPDATE") requireChanged(response)
                if (auth.session?.userId != actor) return null
                // The local snapshot already contains newer queued edits; only acknowledge here.
                store.acknowledge(actor, change.sequence)
            } catch (failure: Exception) {
                if (failure is CancellationException) throw failure
                // A previous import may have succeeded before its response was lost, or another
                // device imported the same UID. Reattach the entire queued chain to that row.
                if (failure is AuthException && failure.status == 409 && change.operation == "INSERT" && change.table == "calendar_events") {
                    val source = change.payload.optString("import_source")
                    val uid = change.payload.optString("import_uid")
                    if (source.isNotBlank() && uid.isNotBlank()) {
                        val existing = runCatching {
                            JSONArray(auth.authorizedRequest("/rest/v1/calendar_events?user_id=eq.$actor&import_source=eq.${Uri.encode(source)}&import_uid=eq.${Uri.encode(uid)}&select=id&limit=1"))
                                .optJSONObject(0)?.optString("id")
                        }.getOrNull()
                        if (!existing.isNullOrBlank() && existing != change.id) {
                            store.remapImportedEvent(actor, change.id, existing)
                            continue
                        }
                    }
                }
                val detail = if (failure is AuthException && failure.status in 400..499) "Sync paused: ${failure.message}. Your edits remain saved on this device." else "Saved on this device. Sync will retry when connected."
                publish(actor)
                updateState { it.copy(message = detail) }
                return detail
            }
        }
        publish(actor)
        return null
    }

    private suspend fun pages(path: String, method: String = "GET", body: JSONObject? = null): List<JSONObject> {
        val result = mutableListOf<JSONObject>()
        var offset = 0
        while (true) {
            val response = auth.authorizedRequest(path, method, body, mapOf("Range-Unit" to "items", "Range" to "$offset-${offset + 199}"))
            val page = JSONArray(response)
            for (index in 0 until page.length()) result += page.getJSONObject(index)
            if (page.length() < 200) return result
            offset += 200
        }
    }

    private fun defaults(actor: String, table: String, row: JSONObject) {
        if (table != "list_items") row.put("user_id", actor)
        row.put("created_at", Instant.now().toString())
        when (table) {
            "tasks" -> {
                if (!row.has("completed")) row.put("completed", false)
                if (!row.has("priority")) row.put("priority", "medium")
                if (!row.has("category")) row.put("category", "Personal")
                if (!row.has("category_color")) row.put("category_color", "#587b74")
                if (!row.has("order")) row.put("order", store.rows(actor, "tasks").maxOfOrNull { it.number("order") }?.plus(1) ?: 0)
                if (!row.has("task_recurrence_interval")) row.put("task_recurrence_interval", 1)
            }
            "list_items" -> {
                if (!row.has("completed")) row.put("completed", false)
                if (!row.has("position")) row.put("position", store.rows(actor, "list_items").filter { it.text("list_id") == row.optString("list_id") }.maxOfOrNull { it.number("position") }?.plus(1) ?: 0)
            }
            "lists" -> if (!row.has("archived")) row.put("archived", false)
            "notes" -> if (!row.has("content")) row.put("content", "")
            "calendar_events" -> if (!row.has("all_day")) row.put("all_day", false)
            "zen_reminders" -> if (!row.has("timezone")) row.put("timezone", ZoneId.systemDefault().id)
        }
    }

    private fun normalizeAndValidate(table: String, row: JSONObject, patch: JSONObject) {
        val titleKey = when (table) { "lists", "categories" -> "name"; "list_items" -> "content"; else -> "title" }
        require(row.optString(titleKey).isNotBlank()) { "Enter ${if (titleKey == "content") "an item" else "a $titleKey"}." }
        if (patch.has(titleKey)) { row.put(titleKey, row.getString(titleKey).trim()); patch.put(titleKey, row.getString(titleKey)) }
        if (table == "list_items") requireId(row.optString("list_id"))
        if (table == "tasks") {
            require(row.optString("priority") in setOf("low", "medium", "high")) { "Choose a valid priority." }
            val recurrence = row.optString("task_recurrence", "").takeUnless { it == "null" }
            require(recurrence.isNullOrBlank() || recurrence in setOf("daily", "weekly", "monthly")) { "Choose a valid recurrence." }
            require(row.optInt("task_recurrence_interval", 1) >= 1) { "The recurrence interval must be positive." }
            val due = row.optString("due_date").takeUnless { row.isNull("due_date") || it.isBlank() }
            if (due != null) Instant.parse(due)
            if (recurrence == "monthly" && due != null) {
                val anchor = TaskRecurrence.monthlyAnchor(due, row.optInt("task_recurrence_anchor_day").takeIf { it in 1..31 })
                row.put("task_recurrence_anchor_day", anchor); patch.put("task_recurrence_anchor_day", anchor)
            } else if (patch.has("task_recurrence") || patch.has("due_date")) {
                row.put("task_recurrence_anchor_day", JSONObject.NULL); patch.put("task_recurrence_anchor_day", JSONObject.NULL)
            }
            if (!row.isNull("reminder_minutes_before")) {
                require(due != null && row.optInt("reminder_minutes_before", -1) >= 0) { "A reminder needs a due date and a non-negative lead time." }
                if (patch.has("due_date") || patch.has("reminder_minutes_before")) {
                    val trigger = Instant.parse(due).minusSeconds(row.optLong("reminder_minutes_before") * 60).toString()
                    row.put("reminder_next_trigger_at", trigger); patch.put("reminder_next_trigger_at", trigger)
                    row.put("reminder_timezone", ZoneId.systemDefault().id); patch.put("reminder_timezone", ZoneId.systemDefault().id)
                }
            } else if (patch.has("reminder_minutes_before")) {
                row.put("reminder_next_trigger_at", JSONObject.NULL); patch.put("reminder_next_trigger_at", JSONObject.NULL)
                row.put("reminder_snoozed_until", JSONObject.NULL); patch.put("reminder_snoozed_until", JSONObject.NULL)
            }
        }
        if (table == "notes") {
            val words = row.optString("content").trim().split(Regex("\\s+")).count { it.isNotEmpty() }
            row.put("word_count", words); patch.put("word_count", words)
        }
        if (table == "zen_reminders") Instant.parse(row.getString("remind_at"))
        if (table == "calendar_events") require(!Instant.parse(row.getString("end_time")).isBefore(Instant.parse(row.getString("start_time")))) { "The event must end after it starts." }
    }

    private fun checkAccess(actor: String, table: String, old: JSONObject?, deleting: Boolean, submitted: JSONObject = JSONObject()) {
        if (table == "list_items") {
            val listId = old?.optString("list_id") ?: submitted.optString("list_id")
            val list = store.row(actor, "lists", listId) ?: error("This list is no longer available.")
            require(effectiveAccessRole(list, actor) in setOf("owner", "editor")) { "This list is read-only." }
            return
        }
        if (old == null) return
        val owner = old.optString("user_id") == actor
        if (table in setOf("tasks", "lists")) {
            val role = effectiveAccessRole(old, actor)
            require(role == "owner" || (!deleting && role == "editor")) { "You do not have permission to change this item." }
            if (table == "lists" && submitted.has("archived")) require(role == "owner") { "Only the owner can archive a list." }
        } else require(owner) { "You do not have permission to change this item." }
    }

    private fun nextOccurrence(actor: String, completed: JSONObject): JSONObject? {
        val recurrence = completed.optString("task_recurrence").takeIf { it in setOf("daily", "weekly", "monthly") } ?: return null
        val due = completed.optString("due_date").takeUnless { completed.isNull("due_date") || it.isBlank() } ?: return null
        val nextDue = TaskRecurrence.nextDue(due, recurrence, completed.optInt("task_recurrence_interval", 1), completed.optInt("task_recurrence_anchor_day").takeIf { it in 1..31 })
        return sanitize("tasks", completed, true).apply {
            put("id", UUID.randomUUID().toString()); put("user_id", actor); put("completed", false)
            put("created_at", Instant.now().toString()); remove("updated_at")
            put("due_date", nextDue); put("reminder_snoozed_until", JSONObject.NULL); put("reminder_last_trigger_at", JSONObject.NULL)
            put("order", store.rows(actor, "tasks").maxOfOrNull { it.number("order") }?.plus(1) ?: 0)
            if (!isNull("reminder_minutes_before")) put("reminder_next_trigger_at", Instant.parse(nextDue).minusSeconds(optLong("reminder_minutes_before") * 60).toString())
            put("access_role", "owner")
        }
    }

    private fun sanitize(table: String, input: JSONObject, creating: Boolean): JSONObject {
        val allowed = fields.getValue(table) + if (creating) setOf("id", "user_id", "created_at") else setOf("id")
        return JSONObject().apply { input.keys().forEach { key -> if (key in allowed && !(table == "list_items" && key == "user_id")) put(key, input.get(key)) } }
    }

    private fun publish(actor: String, email: String = auth.session?.email.orEmpty()) {
        if (auth.session?.userId != actor) return
        updateState { it.copy(userId = actor, email = email, rows = readableTables.associateWith { table ->
            store.rows(actor, table).map { row ->
                if (table in setOf("tasks", "lists")) Row(JSONObject(row.values.toString()).put("access_role", effectiveAccessRole(row.values, actor))) else row
            }
        }, pending = store.pending(actor).size, passwordRecovery = auth.passwordRecovery) }
    }

    private fun actor(): String = auth.session?.userId ?: error("Sign in to continue.")
    private fun isOnline(): Boolean {
        val active = connectivity?.activeNetwork ?: return false
        val capabilities = connectivity.getNetworkCapabilities(active) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
    private fun requireConfigured() { check(configured) { "This APK needs a Supabase URL and publishable key at build time." } }
    private fun requireId(id: String): String { require(runCatching { UUID.fromString(id) }.isSuccess) { "Invalid item identifier." }; return id }
    private fun requireChanged(response: String) { if (response.trim() == "[]") throw AuthException(403, "This item was removed or your access changed") }
    private fun readableFailure(failure: Exception): String = if (failure is IOException && failure !is AuthException) "You're offline. Your saved workspace is available on this device." else failure.message ?: "Unable to sync your workspace."

    private suspend fun <T> operation(block: suspend () -> T): T = withContext(Dispatchers.IO) { lock.withLock {
        operationGeneration = accountGeneration.get()
        updateState { it.copy(busy = true, message = null) }
        try { block() } catch (failure: Exception) {
            if (failure is CancellationException) throw failure
            updateState { it.copy(message = readableFailure(failure)) }
            throw failure
        } finally { updateState { it.copy(busy = false) } }
    } }

    private fun updateState(transform: (WorkspaceState) -> WorkspaceState) {
        val expected = operationGeneration
        _state.update { current -> if (accountGeneration.get() == expected) transform(current) else current }
    }

    companion object {
        private val memberTables = setOf("list_members", "task_collaborators")
        private val editableTables = setOf("tasks", "categories", "lists", "list_items", "notes", "calendar_events", "zen_reminders")
        private val readableTables = editableTables + setOf("friends", "friend_requests")
        private val allowedRpcs = setOf("get_task_collaborators", "invite_task_collaborator", "invite_list_member", "enable_list_public_share", "rotate_list_public_share", "disable_list_public_share", "add_friend_by_email", "remove_friend", "respond_to_friend_request", "reorder_list_items")
        private val fields = mapOf(
            "tasks" to setOf("title", "description", "completed", "priority", "category", "category_color", "order", "due_date", "reminder_minutes_before", "reminder_recurrence", "reminder_next_trigger_at", "reminder_last_trigger_at", "reminder_snoozed_until", "reminder_timezone", "task_recurrence", "task_recurrence_interval", "task_recurrence_anchor_day"),
            "categories" to setOf("name", "color"),
            "lists" to setOf("name", "description", "archived"),
            "list_items" to setOf("list_id", "content", "completed", "position"),
            "notes" to setOf("title", "content", "summary", "word_count"),
            "calendar_events" to setOf("title", "description", "location", "start_time", "end_time", "all_day", "import_source", "import_uid"),
            "zen_reminders" to setOf("title", "description", "remind_at", "timezone"),
        )
    }
}
