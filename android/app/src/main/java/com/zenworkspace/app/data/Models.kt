package com.zenworkspace.app.data

import org.json.JSONObject

/** Immutable snapshots are published by NativeRepository; callers submit copies when editing. */
data class Row(val values: JSONObject) {
    val id: String get() = text("id")
    fun text(key: String): String = if (values.isNull(key)) "" else values.optString(key, "")
    fun bool(key: String): Boolean = values.optBoolean(key, false)
    fun number(key: String): Int = values.optInt(key, 0)
}

/** Pending INSERT payloads contain database fields, so ownership also supplies display access. */
internal fun effectiveAccessRole(row: JSONObject, actor: String): String =
    if (row.optString("user_id") == actor) "owner"
    else row.optString("access_role", "viewer").takeIf { it in setOf("owner", "editor", "viewer") } ?: "viewer"

data class WorkspaceState(
    val userId: String? = null,
    val email: String = "",
    val rows: Map<String, List<Row>> = emptyMap(),
    val busy: Boolean = false,
    val pending: Int = 0,
    val message: String? = null,
    val configured: Boolean = true,
    val passwordRecovery: Boolean = false,
) {
    fun table(name: String): List<Row> = rows[name].orEmpty()
}
