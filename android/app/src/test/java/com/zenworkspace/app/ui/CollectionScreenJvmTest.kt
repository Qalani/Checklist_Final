package com.zenworkspace.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollToNode
import java.time.Instant
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.zenworkspace.app.data.Row
import com.zenworkspace.app.data.WorkspaceState
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

/** Executes native Compose controls on a local Android runtime without backend credentials. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CollectionScreenJvmTest {
    @get:Rule val compose = createComposeRule()

    @Test fun sharedViewerCannotCompleteOrEditTask() {
        var writes = 0
        val task = Row(JSONObject().put("id", "shared-task").put("title", "Shared task")
            .put("access_role", "viewer").put("user_id", "another-user").put("completed", false)
            .put("priority", "medium").put("category", "Work"))
        compose.setContent {
            MaterialTheme {
                CollectionScreen("tasks", WorkspaceState(userId = "viewer", rows = mapOf("tasks" to listOf(task))),
                    onSave = { _, _ -> writes++ }, onDelete = { _, _ -> writes++ }, onRpc = { _, _ -> writes++ },
                    onShare = { _, _ -> })
            }
        }
        compose.onNode(isToggleable()).assertIsNotEnabled()
        compose.onNodeWithContentDescription("Actions for Shared task").performClick()
        compose.onNodeWithText("View").performClick()
        compose.onNodeWithText("View task").assertExists()
        compose.onNodeWithText("Save").assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, writes) }
    }

    @Test fun completingTaskSubmitsOnlyIdAndCompletionPatch() {
        val writes = mutableListOf<Pair<String, JSONObject>>()
        val task = Row(JSONObject().put("id", "owned-task").put("title", "Read a chapter")
            .put("access_role", "owner").put("user_id", "me").put("completed", false)
            .put("priority", "low").put("category", "Personal"))
        compose.setContent {
            MaterialTheme {
                CollectionScreen("tasks", WorkspaceState(userId = "me", rows = mapOf("tasks" to listOf(task))),
                    onSave = { table, values -> writes += table to values }, onDelete = { _, _ -> },
                    onRpc = { _, _ -> }, onShare = { _, _ -> })
            }
        }
        compose.onNode(isToggleable()).performClick()
        compose.runOnIdle {
            assertEquals(1, writes.size)
            assertEquals("tasks", writes.single().first)
            assertEquals("owned-task", writes.single().second.getString("id"))
            assertTrue(writes.single().second.getBoolean("completed"))
            assertEquals(2, writes.single().second.length())
        }
    }

    @Test fun taskReorderingPreservesExistingOrderSlots() {
        val writes = mutableListOf<JSONObject>()
        fun task(id: String, title: String, order: Int) = Row(JSONObject().put("id", id).put("title", title)
            .put("user_id", "me").put("completed", false).put("order", order).put("priority", "medium").put("category", "Work"))
        compose.setContent {
            MaterialTheme {
                CollectionScreen("tasks", WorkspaceState(userId = "me", rows = mapOf("tasks" to listOf(
                    task("first", "First task", 5), task("second", "Second task", 9)))),
                    onSave = { _, values -> writes += values }, onDelete = { _, _ -> },
                    onRpc = { _, _ -> }, onShare = { _, _ -> })
            }
        }
        compose.onNode(hasScrollToIndexAction()).performScrollToIndex(4)
        compose.onNodeWithContentDescription("Actions for Second task").performClick()
        compose.onNodeWithContentDescription("Move Second task up").performClick()
        compose.runOnIdle {
            assertEquals(2, writes.size)
            assertEquals(5, writes.first { it.getString("id") == "second" }.getInt("order"))
            assertEquals(9, writes.first { it.getString("id") == "first" }.getInt("order"))
        }
    }

    @Test fun listReorderingPreservesGappedSlotsAndDoesNotChangeUnrelatedItems() {
        val writes = mutableListOf<Pair<String, JSONObject>>()
        val list = Row(JSONObject().put("id", "list").put("name", "Ordered list").put("user_id", "me"))
        fun item(id: String, position: Int) = Row(JSONObject().put("id", id).put("list_id", "list")
            .put("content", "Item $id").put("position", position))
        val rows = listOf(item("A", 2), item("B", 3), item("C", 4))
        compose.setContent {
            MaterialTheme {
                CollectionScreen("lists", WorkspaceState(userId = "me", rows = mapOf("lists" to listOf(list), "list_items" to rows)),
                    onSave = { table, values -> writes += table to values }, onDelete = { _, _ -> },
                    onRpc = { _, _ -> }, onShare = { _, _ -> })
            }
        }
        compose.onNodeWithTag("collection-list").performScrollToNode(hasTestTag("record:lists:list"))
        compose.onNodeWithTag("record:lists:list").performClick()
        compose.onNodeWithTag("list-items").performScrollToNode(hasTestTag("list-item:B"))
        compose.onNodeWithTag("list-item-actions:B").performClick()
        compose.onNodeWithText("Move down").performClick()
        compose.runOnIdle {
            assertEquals(2, writes.size)
            assertTrue(writes.all { it.first == "list_items" && it.second.length() == 2 })
            val positions = writes.associate { it.second.getString("id") to it.second.getInt("position") }
            assertEquals(mapOf("B" to 4, "C" to 3), positions)
            assertTrue("Moving B below C must preserve A's existing slot", "A" !in positions)
            writes.clear()
        }
        // The fixture remains unchanged so the opposite action is checked from the original order.
        compose.onNodeWithTag("list-item-actions:B").performClick()
        compose.onNodeWithText("Move up").performClick()
        compose.runOnIdle {
            assertEquals(2, writes.size)
            assertTrue(writes.all { it.first == "list_items" && it.second.length() == 2 })
            val positions = writes.associate { it.second.getString("id") to it.second.getInt("position") }
            assertEquals(mapOf("B" to 2, "A" to 3), positions)
            assertTrue("Moving B above A must preserve C's existing slot", "C" !in positions)
        }
    }

    @Test fun newTaskRequiresTitleAndSavesNativeForm() {
        val writes = mutableListOf<JSONObject>()
        compose.setContent {
            MaterialTheme {
                CollectionScreen("tasks", WorkspaceState(userId = "me"),
                    onSave = { _, values -> writes += values }, onDelete = { _, _ -> },
                    onRpc = { _, _ -> }, onShare = { _, _ -> })
            }
        }
        compose.onNodeWithText("+ Add").performClick()
        compose.onNodeWithText("Save").performClick()
        compose.onNodeWithText("Enter a title.").assertExists()
        compose.runOnIdle { assertTrue(writes.isEmpty()) }
        compose.onNodeWithText("Title").performTextInput("Plan the weekend")
        compose.onNodeWithText("Save").performClick()
        compose.runOnIdle {
            assertEquals(1, writes.size)
            assertEquals("Plan the weekend", writes.single().getString("title"))
            assertEquals("medium", writes.single().getString("priority"))
            assertEquals(false, writes.single().getBoolean("completed"))
        }
    }
    @Test
    @Config(qualifiers = "w320dp-h640dp-mdpi")
    fun everyCollectionUsesCompactWidthWithLargeTextAndAccessibleActions() {
        val section = mutableStateOf("tasks")
        val now = Instant.now()
        fun row(id: String, title: String) = JSONObject().put("id", id).put("title", title).put("name", title).put("user_id", "me")
        val rows = mapOf(
            "tasks" to listOf(Row(row("task", "Review plans").put("priority", "medium").put("category", "Work").put("completed", false))),
            "lists" to listOf(Row(row("list", "Shopping").put("archived", false))),
            "notes" to listOf(Row(row("note", "Ideas").put("content", "<p>Room for a new thought.</p>"))),
            "calendar_events" to listOf(Row(row("event", "Planning").put("start_time", now.toString()).put("end_time", now.plusSeconds(3600).toString()))),
            "zen_reminders" to listOf(Row(row("reminder", "Stretch").put("remind_at", now.plusSeconds(600).toString()))),
            "categories" to listOf(Row(row("category", "Personal").put("color", "#4F7971")))
        )
        compose.setContent {
            LargeControls {
                MaterialTheme {
                    CollectionScreen(section.value, WorkspaceState(userId = "me", rows = rows),
                        onSave = { _, _ -> }, onDelete = { _, _ -> }, onRpc = { _, _ -> }, onShare = { _, _ -> })
                }
            }
        }
        rows.forEach { (table, records) ->
            compose.runOnIdle { section.value = table }
            compose.onNodeWithTag("collection-list").performScrollToIndex(0)
            compose.onNodeWithTag("collection-add").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
            compose.onNodeWithTag("collection-search").assertIsDisplayed()
            val viewport = compose.onNodeWithTag("collection-list").fetchSemanticsNode().boundsInRoot
            val search = compose.onNodeWithTag("collection-search").fetchSemanticsNode().boundsInRoot
            assertTrue("$table search should use the available width", search.width >= viewport.width * .92f)
            assertTrue("$table search must stay inside the viewport", search.left >= viewport.left && search.right <= viewport.right)
            if (table == "calendar_events") {
                listOf("Previous day", "Choose calendar day", "Next day", "Today").forEach { control ->
                    val bounds = compose.onNodeWithContentDescription(control).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
                    assertTrue("$control must remain in the compact calendar", bounds.left >= viewport.left && bounds.right <= viewport.right)
                }
            }
            val record = "record:$table:${records.single().id}"
            compose.onNodeWithTag("collection-list").performScrollToNode(hasTestTag(record))
            val card = compose.onNodeWithTag(record).fetchSemanticsNode().boundsInRoot
            assertTrue("$table card should use the available width", card.width >= viewport.width * .92f)
            compose.onNodeWithContentDescription("Actions for ${records.single().text("title")}")
                .assertIsDisplayed().assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    @Config(qualifiers = "w640dp-h240dp-land-mdpi")
    fun shortLandscapeNoteViewportKeepsTypingAndSaveAvailable() {
        val note = Row(JSONObject().put("id", "note").put("title", "A landscape note").put("content", "<p>Keep writing.</p>").put("user_id", "me"))
        compose.setContent {
            LargeControls {
                MaterialTheme {
                    CollectionScreen("notes", WorkspaceState(userId = "me", rows = mapOf("notes" to listOf(note))),
                        onSave = { _, _ -> }, onDelete = { _, _ -> }, onRpc = { _, _ -> }, onShare = { _, _ -> })
                }
            }
        }
        compose.onNodeWithTag("collection-list").performScrollToNode(hasTestTag("record:notes:note"))
        compose.onNodeWithTag("record:notes:note").performClick()
        val dialog = compose.onNodeWithTag("record-editor").fetchSemanticsNode().boundsInRoot
        val editor = compose.onNodeWithTag("note-content").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("Native note should fill the dialog width", editor.width >= dialog.width * .94f)
        assertTrue("Native note must retain usable typing height in a short viewport", editor.height >= 48f)
        compose.onNodeWithText("Save").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        compose.onNodeWithTag("note-title-toggle").assertIsDisplayed().performClick()
        compose.onNodeWithTag("record-title").assertIsDisplayed()
        compose.onNodeWithContentDescription("Done editing note title").performClick()
        compose.onNodeWithTag("note-content").assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "w568dp-h320dp-land-mdpi")
    fun landscapeListKeepsComposerAndItemActionsInsideDialog() {
        val list = Row(JSONObject().put("id", "list").put("name", "A longer shared shopping list title").put("user_id", "me"))
        val item = Row(JSONObject().put("id", "item").put("list_id", "list").put("content", "A list item with enough text to wrap safely").put("position", 0))
        compose.setContent {
            LargeControls {
                MaterialTheme {
                    CollectionScreen("lists", WorkspaceState(userId = "me", rows = mapOf("lists" to listOf(list), "list_items" to listOf(item))),
                        onSave = { _, _ -> }, onDelete = { _, _ -> }, onRpc = { _, _ -> }, onShare = { _, _ -> })
                }
            }
        }
        compose.onNodeWithTag("collection-list").performScrollToNode(hasTestTag("record:lists:list"))
        compose.onNodeWithTag("record:lists:list").performClick()
        val dialog = compose.onNodeWithTag("list-detail-root").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("list-add-field").assertIsDisplayed()
        compose.onNodeWithTag("list-add-button").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        val field = compose.onNodeWithTag("list-add-field").fetchSemanticsNode().boundsInRoot
        val add = compose.onNodeWithTag("list-add-button").fetchSemanticsNode().boundsInRoot
        assertTrue("List composer must stay inside its viewport", field.left >= dialog.left && add.right <= dialog.right)
        assertTrue("List input should receive most of the row", field.width >= dialog.width * .65f)
        compose.onNodeWithTag("list-items").performScrollToNode(hasTestTag("list-item:item"))
        compose.onNodeWithTag("list-item-actions:item").assertIsDisplayed().assertWidthIsAtLeast(48.dp).performClick()
        compose.onNodeWithText("Edit item").performClick()
        val itemEditor = compose.onNodeWithTag("list-item-editor").fetchSemanticsNode().boundsInRoot
        assertTrue("Item editor should use the dialog width", itemEditor.width >= dialog.width * .95f)
        compose.onNodeWithText("Save").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Content").assertIsDisplayed()
    }

}

@Composable
private fun LargeControls(content: @Composable () -> Unit) {
    val density = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(density.density, 1.8f), content = content)
}
