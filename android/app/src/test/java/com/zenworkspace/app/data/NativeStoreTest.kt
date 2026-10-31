package com.zenworkspace.app.data

import android.content.Context
import android.content.ContextWrapper
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteDatabase
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.util.UUID

/** Exercises Android's real SQLite transactions, rather than an in-memory queue substitute. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NativeStoreTest {
    private lateinit var databaseContext: IsolatedDatabaseContext
    private lateinit var store: NativeStore

    @Before fun setUp() {
        databaseContext = IsolatedDatabaseContext(RuntimeEnvironment.getApplication())
        store = NativeStore(databaseContext)
    }

    @After fun tearDown() {
        store.close()
        databaseContext.directory.deleteRecursively()
    }

    @Test fun failedTransactionRollsBackTheOptimisticRowAndQueueTogether() {
        store.put(ALICE, "tasks", record("task", "Original"))

        try {
            store.transaction {
                store.put(ALICE, "tasks", record("task", "Unsaved edit"))
                store.enqueue(ALICE, "tasks", "task", "UPDATE", JSONObject().put("title", "Unsaved edit"))
                throw DeliberateRollback()
            }
        } catch (_: DeliberateRollback) {
            // Simulate a failure after both writes, before the transaction commits.
        }

        assertEquals("Original", store.row(ALICE, "tasks", "task")?.getString("title"))
        assertTrue(store.pending(ALICE).isEmpty())
        reopen()
        assertEquals("Original", store.row(ALICE, "tasks", "task")?.getString("title"))
        assertTrue(store.pending(ALICE).isEmpty())
    }

    @Test fun committedWritesSurviveReopeningAndReplayInTheirOriginalOrder() {
        store.transaction {
            store.put(ALICE, "notes", record("note", "First draft"))
            store.enqueue(ALICE, "notes", "note", "INSERT", record("note", "First draft"))
        }
        store.transaction {
            store.put(ALICE, "notes", record("note", "Second draft"))
            store.enqueue(ALICE, "notes", "note", "UPDATE", JSONObject().put("title", "Second draft"))
        }
        store.transaction {
            store.remove(ALICE, "notes", "note")
            store.enqueue(ALICE, "notes", "note", "DELETE", JSONObject())
        }

        reopen()

        val pending = store.pending(ALICE)
        assertEquals(listOf("INSERT", "UPDATE", "DELETE"), pending.map { it.operation })
        assertTrue(pending.zipWithNext().all { (before, after) -> before.sequence < after.sequence })
        assertEquals("First draft", pending[0].payload.getString("title"))
        assertEquals("Second draft", pending[1].payload.getString("title"))
        assertNull(store.row(ALICE, "notes", "note"))
        store.acknowledge(ALICE, pending.first().sequence)
        reopen()
        assertEquals(listOf("UPDATE", "DELETE"), store.pending(ALICE).map { it.operation })
    }

    @Test fun identicalRecordIdsAndAcknowledgementsAreIsolatedByAccount() {
        store.put(ALICE, "tasks", record("same-id", "Alice's task"))
        store.put(BOB, "tasks", record("same-id", "Bob's task"))
        store.enqueue(ALICE, "tasks", "same-id", "UPDATE", JSONObject().put("title", "Alice's edit"))
        store.enqueue(BOB, "tasks", "same-id", "UPDATE", JSONObject().put("title", "Bob's edit"))
        val bobsSequence = store.pending(BOB).single().sequence

        store.acknowledge(ALICE, bobsSequence)
        store.reconcile(ALICE, "tasks", listOf(record("same-id", "Alice from server")))
        reopen()

        assertEquals("Alice's edit", store.rows(ALICE, "tasks").single().text("title"))
        assertEquals("Bob's task", store.rows(BOB, "tasks").single().text("title"))
        assertEquals(1, store.pending(ALICE).size)
        assertEquals(bobsSequence, store.pending(BOB).single().sequence)
    }

    @Test fun authoritativeRefreshRemovesDeletedAndRevokedRecordsAndReplaysPendingChanges() {
        store.put(ALICE, "tasks", record("stale", "Deleted on another device"))
        store.put(ALICE, "tasks", record("revoked", "Shared task before access revocation"))
        store.enqueue(ALICE, "tasks", "revoked", "UPDATE", JSONObject().put("title", "Pending revoked edit"))
        store.enqueue(ALICE, "tasks", "kept", "UPDATE", JSONObject().put("title", "Pending edit"))
        store.enqueue(ALICE, "tasks", "new", "INSERT", record("new", "Created offline"))
        store.enqueue(ALICE, "tasks", "removed", "DELETE", JSONObject())

        store.reconcile(ALICE, "tasks", listOf(
            record("kept", "Server title").put("priority", "high"),
            record("removed", "Present on server, deleted offline"),
        ))
        reopen()

        assertEquals(setOf("kept", "new"), store.rows(ALICE, "tasks").map { it.id }.toSet())
        assertEquals("Pending edit", store.row(ALICE, "tasks", "kept")?.getString("title"))
        assertEquals("high", store.row(ALICE, "tasks", "kept")?.getString("priority"))
        assertEquals("Created offline", store.row(ALICE, "tasks", "new")?.getString("title"))
        assertNull(store.row(ALICE, "tasks", "revoked"))
        assertNull(store.row(ALICE, "tasks", "stale"))
        assertNull(store.row(ALICE, "tasks", "removed"))
        // A revoked target stays out of the UI; its failed edit remains available for recovery.
        assertEquals(4, store.pending(ALICE).size)
        assertTrue(store.pending(ALICE).any { it.id == "revoked" && it.operation == "UPDATE" })
    }

    @Test fun deletingAListCascadesItsCachedItemsWithinOnlyThatAccount() {
        store.put(ALICE, "lists", record("list", "List"))
        store.put(ALICE, "list_items", record("item", "Item").put("list_id", "list"))
        store.put(ALICE, "list_items", record("other-item", "Another list's item").put("list_id", "other-list"))
        store.put(BOB, "list_items", record("item", "Bob's item").put("list_id", "list"))

        store.transaction { store.remove(ALICE, "lists", "list") }

        assertFalse(store.rows(ALICE, "list_items").any { it.id == "item" })
        assertEquals("other-item", store.rows(ALICE, "list_items").single().id)
        assertEquals("item", store.rows(BOB, "list_items").single().id)
    }

    @Test fun importConflictRemapsTheFullPendingChainWithoutChangingSequenceOrOtherAccounts() {
        store.put(ALICE, "calendar_events", record("local-id", "Offline imported event"))
        store.put(BOB, "calendar_events", record("local-id", "Bob's imported event"))
        store.enqueue(ALICE, "calendar_events", "local-id", "INSERT", record("local-id", "Import"))
        store.enqueue(ALICE, "calendar_events", "local-id", "UPDATE", JSONObject().put("title", "Edited offline"))
        store.enqueue(ALICE, "calendar_events", "local-id", "DELETE", JSONObject())
        store.enqueue(ALICE, "notes", "local-id", "INSERT", record("local-id", "Unrelated note"))
        store.enqueue(BOB, "calendar_events", "local-id", "INSERT", record("local-id", "Bob's import"))
        val originalSequences = store.pending(ALICE).map { it.sequence }

        store.remapImportedEvent(ALICE, "local-id", "server-id")
        reopen()

        val pending = store.pending(ALICE)
        assertEquals(originalSequences, pending.map { it.sequence })
        assertEquals(listOf("UPDATE", "UPDATE", "DELETE", "INSERT"), pending.map { it.operation })
        assertEquals(listOf("server-id", "server-id", "server-id", "local-id"), pending.map { it.id })
        assertTrue(pending.take(3).all { it.payload.getString("id") == "server-id" })
        assertEquals("Edited offline", pending[1].payload.getString("title"))
        assertNull(store.row(ALICE, "calendar_events", "local-id"))
        assertEquals("Offline imported event", store.row(ALICE, "calendar_events", "server-id")?.getString("title"))
        assertEquals("Bob's imported event", store.row(BOB, "calendar_events", "local-id")?.getString("title"))
        assertEquals("INSERT", store.pending(BOB).single().operation)
        assertEquals("local-id", store.pending(BOB).single().id)
    }

    @Test fun explicitDiscardClearsOnlyTheSelectedAccountsQueueAndOptimisticSnapshot() {
        store.put(ALICE, "notes", record("same-id", "Alice's local note"))
        store.put(BOB, "notes", record("same-id", "Bob's local note"))
        store.enqueue(ALICE, "notes", "same-id", "INSERT", record("same-id", "Alice's local note"))
        store.enqueue(BOB, "notes", "same-id", "INSERT", record("same-id", "Bob's local note"))

        store.discardPending(ALICE)
        reopen()

        assertTrue(store.pending(ALICE).isEmpty())
        assertTrue(store.rows(ALICE, "notes").isEmpty())
        assertEquals("Bob's local note", store.row(BOB, "notes", "same-id")?.getString("title"))
        assertEquals(1, store.pending(BOB).size)
    }

    @Test fun pendingInsertedListRemainsEditableWhenAnEarlierWriteBlocksTheQueue() {
        // Server-only columns are deliberately omitted from durable INSERT payloads.
        store.enqueue(ALICE, "tasks", "blocked-task", "UPDATE", JSONObject().put("title", "Blocked edit"))
        store.enqueue(ALICE, "lists", "new-list", "INSERT", JSONObject()
            .put("id", "new-list").put("user_id", ALICE).put("name", "Created offline"))

        store.reconcile(ALICE, "lists", emptyList())
        reopen()

        val list = store.row(ALICE, "lists", "new-list")!!
        assertFalse(list.has("access_role"))
        assertEquals("owner", effectiveAccessRole(list, ALICE))
        assertEquals("viewer", effectiveAccessRole(list, BOB))
        assertEquals(listOf("UPDATE", "INSERT"), store.pending(ALICE).map { it.operation })
    }

    private fun reopen() {
        store.close()
        store = NativeStore(databaseContext)
    }

    private fun record(id: String, title: String) = JSONObject().put("id", id).put("title", title)
    private class DeliberateRollback : RuntimeException()

    /** Keep tests away from the installed app's actual account cache. */
    private class IsolatedDatabaseContext(base: Context) : ContextWrapper(base) {
        val directory = File(base.cacheDir, "native-store-test-${UUID.randomUUID()}").apply { mkdirs() }
        override fun getDatabasePath(name: String): File = File(directory, name)
        override fun deleteDatabase(name: String): Boolean = SQLiteDatabase.deleteDatabase(getDatabasePath(name))
        override fun openOrCreateDatabase(name: String, mode: Int, factory: SQLiteDatabase.CursorFactory?): SQLiteDatabase =
            SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name), factory)
        override fun openOrCreateDatabase(
            name: String, mode: Int, factory: SQLiteDatabase.CursorFactory?, errorHandler: DatabaseErrorHandler?,
        ): SQLiteDatabase = SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name).path, factory, errorHandler)
    }

    companion object {
        private const val ALICE = "actor-alice"
        private const val BOB = "actor-bob"
    }
}
