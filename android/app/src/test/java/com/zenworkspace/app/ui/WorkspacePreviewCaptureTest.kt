package com.zenworkspace.app.ui

import android.graphics.Bitmap
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import com.zenworkspace.app.data.Row
import com.zenworkspace.app.data.WorkspaceState
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode
import java.io.ByteArrayOutputStream
import java.util.Base64

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w400dp-h780dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WorkspacePreviewCaptureTest {
    @get:Rule val compose = createComposeRule()

    private val state = WorkspaceState(
        userId = "fixture",
        email = "dev@example.test",
        rows = mapOf(
            "tasks" to listOf(
                task("1", "Send the studio brief", "Work", "high", false),
                task("2", "Plan the weekend walk", "Personal", "medium", false),
                task("3", "Book the train", "Travel", "medium", false),
                task("4", "Order notebooks", "Work", "low", true),
                task("5", "Review the week", "Personal", "medium", true),
            ),
            "lists" to listOf(Row(JSONObject().put("id", "list").put("name", "Groceries"))),
            "notes" to listOf(Row(JSONObject().put("id", "note").put("title", "A quiet morning"))),
        ),
    )

    @Test fun homeShowsTheDerivedProgress() {
        compose.setContent {
            WorkspaceTheme("zen", false) {
                WorkspaceShell(state, "home", BottomNavigationPreferences.DEFAULT_ITEMS, {}, {}, {}, remember { SnackbarHostState() }) {
                    HomeScreen(state) {}
                }
            }
        }
        compose.onNodeWithText("3 tasks left").assertExists()
        record("HOME")
    }

    @Test fun activeTasksInDarkModeShowTheirActions() {
        compose.setContent {
            WorkspaceTheme("midnight", true) {
                WorkspaceShell(state, "tasks", BottomNavigationPreferences.DEFAULT_ITEMS, {}, {}, {}, remember { SnackbarHostState() }) {
                    CollectionScreen("tasks", state, { _, _ -> }, { _, _ -> }, { _, _ -> }, { _, _ -> })
                }
            }
        }
        compose.onNodeWithText("Send the studio brief").assertExists()
        record("TASKS")
    }

    private fun record(name: String) {
        // Inspect only the synthetic workspace above. Keep the diagnostic small.
        runCatching {
            val captured = compose.onRoot().captureToImage().asAndroidBitmap()
            val thumbnail = Bitmap.createScaledBitmap(captured, 280, (captured.height.toDouble() * 280 / captured.width).toInt(), true)
            val output = ByteArrayOutputStream()
            thumbnail.compress(Bitmap.CompressFormat.JPEG, 66, output)
            println("ZEN_PREVIEW_$name " + Base64.getEncoder().encodeToString(output.toByteArray()))
        }.onFailure { println("Preview capture unavailable: ${it.javaClass.simpleName}") }
    }

    private fun task(id: String, title: String, category: String, priority: String, complete: Boolean) =
        Row(JSONObject().put("id", id).put("title", title).put("category", category)
            .put("priority", priority).put("completed", complete).put("user_id", "fixture").put("order", id.toInt()))
}
