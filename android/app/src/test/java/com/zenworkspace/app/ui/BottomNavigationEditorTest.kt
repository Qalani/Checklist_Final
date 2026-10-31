package com.zenworkspace.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Density
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BottomNavigationEditorTest {
    @get:Rule val compose = createComposeRule()

    @Test fun emptyBarCanAddAShortcutAndImmediatelyRemoveItAgain() {
        val selected = mutableStateOf(emptyList<String>())
        compose.setContent { MaterialTheme { BottomNavigationEditor(selected.value, { selected.value = it }, {}) } }

        compose.onNodeWithText("Selected (0/5)").assertExists()
        compose.onNodeWithText("Bottom bar hidden. Every page is still available from the workspace menu.").assertExists()
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Add Tasks to bottom bar"))
        compose.onNodeWithContentDescription("Add Tasks to bottom bar").performClick()
        compose.runOnIdle { assertEquals(listOf("tasks"), selected.value) }
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Remove Tasks from bottom bar"))
        compose.onNodeWithContentDescription("Remove Tasks from bottom bar").performClick()
        compose.runOnIdle { assertTrue(selected.value.isEmpty()) }
        compose.onNodeWithText("Selected (0/5)").assertExists()
    }

    @Test fun accessibleReorderingChangesOrderAndDisablesBoundaryControls() {
        val selected = mutableStateOf(listOf("home", "tasks", "notes"))
        compose.setContent { MaterialTheme { BottomNavigationEditor(selected.value, { selected.value = it }, {}) } }

        compose.onNodeWithContentDescription("Move Home up").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Move Notes down").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Move Tasks up").performClick()
        compose.runOnIdle { assertEquals(listOf("tasks", "home", "notes"), selected.value) }
        compose.onNodeWithContentDescription("Move Tasks up").assertIsNotEnabled()
        val taskTop = compose.onNodeWithTag("bottom-nav-selected:tasks").fetchSemanticsNode().boundsInRoot.top
        val homeTop = compose.onNodeWithTag("bottom-nav-selected:home").fetchSemanticsNode().boundsInRoot.top
        assertTrue(taskTop < homeTop)
        compose.onNodeWithText("Tasks moved to position 1.").assertExists()
        compose.onNodeWithContentDescription("Drag to reorder Tasks").assertExists()
    }

    @Test fun fiveItemLimitGivesFeedbackAndRemovingAnItemReenablesAdd() {
        val selected = mutableStateOf(listOf("home", "tasks", "lists", "notes", "calendar_events"))
        compose.setContent { MaterialTheme { BottomNavigationEditor(selected.value, { selected.value = it }, {}) } }

        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasText("Maximum of 5 shortcuts selected. Remove one to add another."))
        compose.onNodeWithText("Maximum of 5 shortcuts selected. Remove one to add another.").assertExists()
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Add Reminders to bottom bar"))
        compose.onNodeWithContentDescription("Add Reminders to bottom bar").assertIsNotEnabled()
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Remove Home from bottom bar"))
        compose.onNodeWithContentDescription("Remove Home from bottom bar").performClick()
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Add Reminders to bottom bar"))
        compose.onNodeWithContentDescription("Add Reminders to bottom bar").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf("tasks", "lists", "notes", "calendar_events", "zen_reminders"), selected.value) }
    }

    @Test fun hideAndResetApplyImmediatelyAndDoneDismisses() {
        val selected = mutableStateOf(listOf("settings", "friends"))
        var dismissed = false
        compose.setContent { MaterialTheme { BottomNavigationEditor(selected.value, { selected.value = it }, { dismissed = true }) } }

        compose.onNodeWithText("Hide bar").performClick()
        compose.runOnIdle { assertTrue(selected.value.isEmpty()) }
        compose.onNodeWithText("Hide bar").assertIsNotEnabled()
        compose.onNodeWithText("Reset defaults").performClick()
        compose.runOnIdle { assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, selected.value) }
        compose.onNodeWithText("Done").performClick()
        compose.runOnIdle { assertTrue(dismissed) }
    }

    @Test fun longPressDraggingReordersTheSelectedShortcut() {
        val selected = mutableStateOf(listOf("home", "tasks", "notes"))
        var longPressTimeout = 500L
        compose.setContent {
            longPressTimeout = LocalViewConfiguration.current.longPressTimeoutMillis
            MaterialTheme { BottomNavigationEditor(selected.value, { selected.value = it }, {}) }
        }
        val rowHeight = compose.onNodeWithTag("bottom-nav-selected:home").fetchSemanticsNode().boundsInRoot.height
        compose.onNodeWithContentDescription("Drag to reorder Home").performTouchInput {
            down(center)
            advanceEventTime(longPressTimeout + 100)
            moveBy(Offset(0f, rowHeight * 0.9f), delayMillis = 160)
            up()
        }
        compose.runOnIdle { assertEquals(listOf("tasks", "home", "notes"), selected.value) }
        val taskTop = compose.onNodeWithTag("bottom-nav-selected:tasks").fetchSemanticsNode().boundsInRoot.top
        val homeTop = compose.onNodeWithTag("bottom-nav-selected:home").fetchSemanticsNode().boundsInRoot.top
        assertTrue(taskTop < homeTop)
    }

    @Test
    @Config(sdk = [35], qualifiers = "w320dp-h640dp")
    fun narrowScreenWithLargeTextKeepsLabelsAndTouchTargetsInsideThePanel() {
        val selected = mutableStateOf(listOf("zen_reminders", "calendar_events", "categories", "friends", "settings"))
        var density = 1f
        compose.setContent {
            val originalDensity = LocalDensity.current
            density = originalDensity.density
            CompositionLocalProvider(LocalDensity provides Density(originalDensity.density, fontScale = 1.8f)) {
                MaterialTheme { BottomNavigationEditor(selected.value, { selected.value = it }, {}) }
            }
        }
        val panel = compose.onNodeWithTag("bottom-nav-editor-panel").fetchSemanticsNode().boundsInRoot
        assertTrue(panel.width <= 320f * density + 1f)
        val label = compose.onNodeWithTag("bottom-nav-label:zen_reminders")
        val labelBounds = label.fetchSemanticsNode().boundsInRoot
        val handle = compose.onNodeWithContentDescription("Drag to reorder Reminders").fetchSemanticsNode().boundsInRoot
        val move = compose.onNodeWithContentDescription("Move Reminders up").fetchSemanticsNode().boundsInRoot
        val remove = compose.onNodeWithContentDescription("Remove Reminders from bottom bar").fetchSemanticsNode().boundsInRoot
        assertTrue(labelBounds.left >= handle.right - 1f)
        assertTrue(labelBounds.right <= move.left + 1f)
        assertTrue(remove.right <= panel.right + 1f)
        assertTrue(handle.width >= 48f * density - 1f && handle.height >= 48f * density - 1f)
        assertTrue(remove.width >= 48f * density - 1f && remove.height >= 48f * density - 1f)
        val textLayouts = mutableListOf<TextLayoutResult>()
        label.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(textLayouts) }
        assertTrue(textLayouts.isNotEmpty())
        assertFalse(textLayouts.single().hasVisualOverflow)
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Add Home to bottom bar"))
        compose.onNodeWithContentDescription("Add Home to bottom bar").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(5, selected.value.size) }
    }

    @Test
    @Config(sdk = [35], qualifiers = "w640dp-h320dp-land")
    fun shortLandscapeKeepsContentScrollableAndDoneAndResetAlwaysReachable() {
        val selected = mutableStateOf(listOf("home", "tasks", "lists", "notes", "calendar_events"))
        var dismissed = false
        compose.setContent { MaterialTheme { BottomNavigationEditor(selected.value, { selected.value = it }, { dismissed = true }) } }

        val panel = compose.onNodeWithTag("bottom-nav-editor-panel").fetchSemanticsNode().boundsInRoot
        val content = compose.onNodeWithTag("bottom-nav-editor-content").fetchSemanticsNode().boundsInRoot
        val doneBefore = compose.onNodeWithText("Done").fetchSemanticsNode().boundsInRoot
        val resetBefore = compose.onNodeWithText("Reset defaults").fetchSemanticsNode().boundsInRoot
        assertTrue(content.height >= panel.height * 0.45f)
        assertTrue(doneBefore.top >= panel.top && doneBefore.bottom <= content.top + 1f)
        assertTrue(resetBefore.top >= content.bottom - 1f && resetBefore.bottom <= panel.bottom + 1f)

        compose.onNodeWithTag("bottom-nav-editor-content").performScrollToNode(hasContentDescription("Add Settings to bottom bar"))
        compose.onNodeWithContentDescription("Add Settings to bottom bar").assertIsDisplayed().assertIsNotEnabled()
        compose.onNodeWithText("Done").assertIsDisplayed()
        compose.onNodeWithText("Reset defaults").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, selected.value) }
        val doneAfter = compose.onNodeWithText("Done").fetchSemanticsNode().boundsInRoot
        assertEquals(doneBefore.top, doneAfter.top, 1f)
        compose.onNodeWithText("Done").performClick()
        compose.runOnIdle { assertTrue(dismissed) }
    }
}
