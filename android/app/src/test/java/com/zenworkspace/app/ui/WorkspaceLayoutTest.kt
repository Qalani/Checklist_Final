package com.zenworkspace.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.zenworkspace.app.data.Row
import com.zenworkspace.app.data.WorkspaceState
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode
import kotlin.math.abs

/** Exercises real native layout, scrolling and navigation under constrained viewports. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w900dp-h900dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WorkspaceLayoutTest {
    @get:Rule val compose = createComposeRule()

    private fun viewport(width: Dp, height: Dp, fontScale: Float = 1f, content: @Composable () -> Unit) {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f, fontScale)) {
                MaterialTheme {
                    Box(Modifier.size(width, height).testTag("test-viewport")) { content() }
                }
            }
        }
    }

    @Test fun defaultBottomBarRoutesEveryShortcutAndUpdatesSelection() {
        val current = mutableStateOf("home")
        val visited = mutableListOf<String>()
        viewport(320.dp, 160.dp) {
            WorkspaceBottomBar(BottomNavigationPreferences.DEFAULT_ITEMS, current.value) {
                current.value = it
                visited += it
            }
        }
        BottomNavigationPreferences.DEFAULT_ITEMS.forEach { id ->
            val label = requireNotNull(WorkspaceDestinations.find(id)).label
            compose.onNodeWithContentDescription(label, useUnmergedTree = true).assertIsDisplayed()
            compose.onNodeWithTag("bottom-item-$id").assertIsDisplayed().performClick()
            compose.onNodeWithTag("bottom-item-$id").assertIsSelected()
        }
        compose.runOnIdle { assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, visited) }
    }

    @Test fun fiveCustomShortcutsKeepOrderIconsAndHitTargetsAtLargeFontOnNarrowPhone() {
        val items = listOf("settings", "friends", "calendar_events", "zen_reminders", "insights")
        val current = mutableStateOf("calendar_events")
        val visited = mutableListOf<String>()
        viewport(320.dp, 180.dp, fontScale = 1.5f) {
            WorkspaceBottomBar(items, current.value) { current.value = it; visited += it }
        }
        compose.onNodeWithTag("bottom-item-calendar_events").assertIsSelected()
        val bar = compose.onNodeWithTag("workspace-bottom-bar").fetchSemanticsNode().boundsInRoot
        assertEquals(320f, bar.width, 1f)
        assertTrue("Large text receives a taller navigation bar", bar.height >= 80f)
        var previousRight = bar.left
        items.forEach { id ->
            val item = compose.onNodeWithTag("bottom-item-$id")
            item.assertIsDisplayed()
            val bounds = item.fetchSemanticsNode().boundsInRoot
            assertTrue("Each shortcut keeps a usable touch width", bounds.width >= 48f)
            assertTrue("Custom shortcuts retain their requested order", bounds.left >= previousRight - 1f)
            assertTrue("Shortcut fits inside the phone", bounds.right <= bar.right + 1f)
            previousRight = bounds.right
            compose.onNodeWithContentDescription(requireNotNull(WorkspaceDestinations.find(id)).label,
                useUnmergedTree = true).assertIsDisplayed()
            item.performClick().assertIsSelected()
        }
        compose.runOnIdle { assertEquals(items, visited) }
    }

    @Test fun hiddenBottomBarLeavesEveryPageAndEditorReachableFromMenu() {
        val current = mutableStateOf("home")
        val visited = mutableListOf<String>()
        val bottomItems = mutableStateOf(emptyList<String>())
        var editorOpens = 0
        viewport(320.dp, 600.dp) {
            WorkspaceShell(
                WorkspaceState(userId = "me"), current.value, bottomItems.value,
                onSection = { current.value = it; visited += it }, onRefresh = {},
                onEditNavigation = { editorOpens++ }, snackbar = remember { SnackbarHostState() },
            ) { Text("Current section: ${current.value}") }
        }
        compose.onNodeWithTag("workspace-bottom-bar").assertDoesNotExist()
        val usable = compose.onNodeWithTag("workspace-content").fetchSemanticsNode().boundsInRoot
        WorkspaceDestinations.all.forEach { destination ->
            compose.onNodeWithContentDescription("Workspace sections").performClick()
            compose.onNode(hasText(destination.label) and hasClickAction()).performScrollTo().performClick()
            compose.onNodeWithText("Current section: ${destination.id}").assertIsDisplayed()
        }
        compose.runOnIdle { assertEquals(WorkspaceDestinations.all.map { it.id }, visited) }
        compose.onNodeWithContentDescription("Workspace sections").performClick()
        compose.onNodeWithText("Edit bottom bar").performScrollTo().performClick()
        compose.runOnIdle {
            assertEquals(1, editorOpens)
            bottomItems.value = BottomNavigationPreferences.DEFAULT_ITEMS
        }
        compose.onNodeWithTag("workspace-bottom-bar").assertIsDisplayed()
        val withBar = compose.onNodeWithTag("workspace-content").fetchSemanticsNode().boundsInRoot
        assertTrue("Hiding the bar returns its occupied height to page content", usable.height - withBar.height >= 60f)
    }

    @Test fun settingsKeepsNavigationEditVisibleAndCollapsesThemeChoicesIntoDropdown() {
        var editOpens = 0
        val theme = mutableStateOf("system")
        val noop = {}
        viewport(320.dp, 480.dp, fontScale = 1.5f) {
            SettingsContent("member@example.com", theme.value, { theme.value = it }, emptyList(), 0,
                SettingsActions({ editOpens++ }, noop, noop, noop, noop, noop, noop, noop))
        }
        compose.onNodeWithTag("edit-bottom-bar").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, editOpens) }
        compose.onNodeWithText("Hidden · use the menu to switch pages").assertIsDisplayed()
        listOf("Use device theme", "Zen Light", "Dawn Light", "Midnight Dark", "Forest Dark").forEach {
            compose.onNodeWithText(it).assertDoesNotExist()
        }
        compose.onNodeWithText("Appearance: Use device theme").assertIsDisplayed().performClick()
        compose.onNodeWithText("Zen Light").performClick()
        compose.runOnIdle { assertEquals("zen", theme.value) }
        compose.onNodeWithText("Appearance: Zen Light").assertIsDisplayed()
        compose.onNodeWithText("Forest Dark").assertDoesNotExist()
    }

    @Test fun phoneHomeCardsFillTheGridWidthAndNavigate() {
        var destination = ""
        viewport(320.dp, 600.dp) { HomeScreen(WorkspaceState(userId = "me")) { destination = it } }
        val grid = compose.onNodeWithTag("home-grid").fetchSemanticsNode().boundsInRoot
        val tasks = compose.onNodeWithTag("home-card-tasks").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val lists = compose.onNodeWithTag("home-card-lists").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertEquals(320f, grid.width, 1f)
        assertEquals(grid.width - 16f, tasks.width, 1f)
        assertEquals(grid.left + 8f, tasks.left, 1f)
        assertTrue("Phone cards form one full-width column", lists.top >= tasks.bottom)
        compose.onNodeWithTag("home-card-tasks").performClick()
        compose.runOnIdle { assertEquals("tasks", destination) }
    }

    @Test fun widerHomeUsesAvailableWidthForTwoColumns() {
        viewport(840.dp, 600.dp) { HomeScreen(WorkspaceState(userId = "me")) {} }
        val grid = compose.onNodeWithTag("home-grid").fetchSemanticsNode().boundsInRoot
        val tasks = compose.onNodeWithTag("home-card-tasks").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val lists = compose.onNodeWithTag("home-card-lists").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertEquals(840f, grid.width, 1f)
        assertTrue("Tablet cards share a grid row", abs(tasks.top - lists.top) <= 1f)
        assertTrue("Columns do not overlap", tasks.right <= lists.left)
        assertEquals("Columns consume available width with only the grid gaps", grid.width,
            tasks.width + lists.width + 8f + 16f, 2f)
    }

    @Test fun insightsWrapsLongCategoriesAndScrollsToTheLastOneWithLargeText() {
        val categories = (0 until 24).map { "Category $it: planning and wellbeing across work, study and personal commitments" }
        val tasks = categories.mapIndexed { index, category ->
            Row(JSONObject().put("id", "task-$index").put("category", category).put("completed", index % 2 == 0))
        }
        viewport(320.dp, 480.dp, fontScale = 1.5f) {
            InsightsScreen(WorkspaceState(userId = "me", rows = mapOf("tasks" to tasks)))
        }
        compose.onNodeWithText(categories.last()).assertDoesNotExist()
        compose.onNodeWithTag("insights-grid").performScrollToNode(hasText(categories.last()))
        val categoryNode = compose.onNodeWithText(categories.last()).performScrollTo().assertIsDisplayed()
        val layouts = mutableListOf<TextLayoutResult>()
        categoryNode.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
        assertEquals("Category exposes its actual text layout", 1, layouts.size)
        val layout = layouts.single()
        val category = categoryNode.fetchSemanticsNode().boundsInRoot
        val grid = compose.onNodeWithTag("insights-grid").fetchSemanticsNode().boundsInRoot
        val diagnostic = "lines=${layout.lineCount}, measured=${layout.size}, visible=$category, viewport=$grid"
        println("Large-font insight category: $diagnostic")
        assertTrue("Long category names wrap: $diagnostic", layout.lineCount > 1)
        assertFalse("Wrapped category text has no visual overflow: $diagnostic", layout.hasVisualOverflow)
        assertTrue("Scrolled text is fully visible rather than partially clipped: $diagnostic",
            category.height + 1f >= layout.size.height)
        assertTrue("Category remains inside the available width: $diagnostic",
            category.left >= grid.left && category.right <= grid.right)
        assertTrue("Scrolled category fits in the viewport: $diagnostic",
            category.top >= grid.top && category.bottom <= grid.bottom)
    }

    @Test fun landscapeAuthenticationScrollsToSubmitGoogleAndRecoveryControls() {
        var submitted: Triple<String, String, Boolean>? = null
        var resetEmail = ""
        var googleOpens = 0
        viewport(640.dp, 320.dp, fontScale = 1.5f) {
            AuthContent(configured = true, busy = false,
                onSubmit = { email, password, create -> submitted = Triple(email, password, create) },
                onGoogle = { googleOpens++ }, onReset = { resetEmail = it })
        }
        val page = compose.onNodeWithTag("auth-content").fetchSemanticsNode().boundsInRoot
        assertEquals(640f, page.width, 1f)
        assertEquals(320f, page.height, 1f)
        compose.onNodeWithText("Email").performScrollTo().performTextInput("member@example.com")
        compose.onNodeWithText("Password").performScrollTo().performTextInput("valid-password")
        compose.onNodeWithText("Sign in").performScrollTo().assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(Triple("member@example.com", "valid-password", false), submitted) }
        compose.onNodeWithText("Continue with Google").performScrollTo().assertIsDisplayed().performClick()
        compose.onNodeWithText("Reset password").performScrollTo().assertIsDisplayed().performClick()
        compose.runOnIdle {
            assertEquals(1, googleOpens)
            assertEquals("member@example.com", resetEmail)
        }
    }
}
