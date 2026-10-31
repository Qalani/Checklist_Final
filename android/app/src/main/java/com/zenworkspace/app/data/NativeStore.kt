package com.zenworkspace.app.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

internal data class PendingWrite(
    val sequence: Long,
    val table: String,
    val id: String,
    val operation: String,
    val payload: JSONObject,
)

/** Both an optimistic edit and its durable queue entry commit in one SQLite transaction. */
internal class NativeStore(context: Context) : SQLiteOpenHelper(context, "zen-native.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE records(actor TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,collection,id))")
        db.execSQL("CREATE TABLE pending(sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL)")
        db.execSQL("CREATE INDEX pending_actor_sequence ON pending(actor,sequence)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun <T> transaction(block: () -> T): T {
        val db = writableDatabase
        db.beginTransaction()
        return try { block().also { db.setTransactionSuccessful() } } finally { db.endTransaction() }
    }

    fun rows(actor: String, table: String): List<Row> {
        readableDatabase.query("records", arrayOf("data"), "actor=? AND collection=?", arrayOf(actor, table), null, null, "rowid ASC").use { cursor ->
            return buildList { while (cursor.moveToNext()) add(Row(JSONObject(cursor.getString(0)))) }
        }
    }

    fun row(actor: String, table: String, id: String): JSONObject? {
        readableDatabase.query("records", arrayOf("data"), "actor=? AND collection=? AND id=?", arrayOf(actor, table, id), null, null, null).use {
            return if (it.moveToFirst()) JSONObject(it.getString(0)) else null
        }
    }

    fun put(actor: String, table: String, row: JSONObject) {
        writableDatabase.insertWithOnConflict("records", null, ContentValues().apply {
            put("actor", actor); put("collection", table); put("id", row.getString("id")); put("data", row.toString())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun remove(actor: String, table: String, id: String) {
        writableDatabase.delete("records", "actor=? AND collection=? AND id=?", arrayOf(actor, table, id))
        if (table == "lists") {
            rows(actor, "list_items").filter { it.text("list_id") == id }.forEach { remove(actor, "list_items", it.id) }
        }
    }

    fun enqueue(actor: String, table: String, id: String, operation: String, payload: JSONObject) {
        writableDatabase.insertOrThrow("pending", null, ContentValues().apply {
            put("actor", actor); put("collection", table); put("id", id); put("operation", operation); put("payload", payload.toString())
        })
    }

    fun pending(actor: String): List<PendingWrite> {
        readableDatabase.query("pending", arrayOf("sequence", "collection", "id", "operation", "payload"), "actor=?", arrayOf(actor), null, null, "sequence ASC").use { cursor ->
            return buildList { while (cursor.moveToNext()) add(PendingWrite(cursor.getLong(0), cursor.getString(1), cursor.getString(2), cursor.getString(3), JSONObject(cursor.getString(4)))) }
        }
    }

    fun acknowledge(actor: String, sequence: Long) { writableDatabase.delete("pending", "actor=? AND sequence=?", arrayOf(actor, sequence.toString())) }

    fun discardPending(actor: String) {
        transaction {
            writableDatabase.delete("pending", "actor=?", arrayOf(actor))
            // An optimistic snapshot is no longer authoritative after its writes are discarded.
            writableDatabase.delete("records", "actor=?", arrayOf(actor))
        }
    }

    /** Match a retried calendar import to its existing server row, keeping later edits attached. */
    fun remapImportedEvent(actor: String, fromId: String, toId: String) {
        transaction {
            row(actor, "calendar_events", fromId)?.let { local ->
                remove(actor, "calendar_events", fromId)
                put(actor, "calendar_events", local.put("id", toId))
            }
            pending(actor).filter { it.table == "calendar_events" && it.id == fromId }.forEach { change ->
                writableDatabase.update("pending", ContentValues().apply {
                    put("id", toId)
                    put("payload", JSONObject(change.payload.toString()).put("id", toId).toString())
                    if (change.operation == "INSERT") put("operation", "UPDATE")
                }, "actor=? AND sequence=?", arrayOf(actor, change.sequence.toString()))
            }
        }
    }

    /** Replace authoritative records, then replay every still-pending local edit. */
    fun reconcile(actor: String, table: String, remote: List<JSONObject>) {
        transaction {
            writableDatabase.delete("records", "actor=? AND collection=?", arrayOf(actor, table))
            remote.forEach { put(actor, table, it) }
            pending(actor).filter { it.table == table }.forEach { change ->
                if (change.operation == "DELETE") remove(actor, table, change.id)
                else {
                    // A missing UPDATE target may have been deleted or had access revoked.
                    // Retain its queue entry for recovery, but never restore it into the UI.
                    val merged = row(actor, table, change.id)
                        ?: if (change.operation == "INSERT") JSONObject().put("id", change.id) else return@forEach
                    change.payload.keys().forEach { key -> merged.put(key, change.payload.get(key)) }
                    put(actor, table, merged)
                }
            }
        }
    }
}
