package com.zenworkspace.app.ui

import androidx.compose.material3.MaterialTheme
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
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

/** Executes native Compose controls on a local Android runtime without backend credentials. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@LooperMode(LooperMode.Mode.PAUSED)
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
        compose.onNodeWithContentDescription("Move Second task up").performClick()
        compose.runOnIdle {
            assertEquals(2, writes.size)
            assertEquals(5, writes.first { it.getString("id") == "second" }.getInt("order"))
            assertEquals(9, writes.first { it.getString("id") == "first" }.getInt("order"))
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
}
