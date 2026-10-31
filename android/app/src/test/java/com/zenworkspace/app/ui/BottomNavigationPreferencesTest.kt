package com.zenworkspace.app.ui

import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BottomNavigationPreferencesTest {
    private lateinit var context: Context
    private lateinit var preferences: BottomNavigationPreferences

    @Before fun setUp() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences(BottomNavigationPreferences.PREFERENCES_NAME, Context.MODE_PRIVATE).edit().clear().commit()
        preferences = BottomNavigationPreferences(context)
    }

    @Test fun newAccountUsesDefaultsWithoutCopyingAnotherAccountsChoices() {
        preferences.save("alice", listOf("calendar_events", "zen_reminders"))
        assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, preferences.load("bob"))
        assertEquals(listOf("calendar_events", "zen_reminders"), preferences.load("alice"))
    }

    @Test fun selectionAndOrderSurviveReopeningAndRemainAccountScoped() {
        preferences.save("alice", listOf("settings", "notes", "tasks"))
        preferences.save("bob", listOf("friends", "insights"))
        val reopened = BottomNavigationPreferences(context)
        assertEquals(listOf("settings", "notes", "tasks"), reopened.load("alice"))
        assertEquals(listOf("friends", "insights"), reopened.load("bob"))
    }

    @Test fun explicitlyEmptySelectionStaysEmptyAfterReopening() {
        preferences.save("alice", emptyList())
        assertTrue(BottomNavigationPreferences(context).load("alice").isEmpty())
        assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, preferences.load("bob"))
    }

    @Test fun malformedJsonAndWrongPreferenceTypeFallBackToDefaults() {
        val stored = context.getSharedPreferences(BottomNavigationPreferences.PREFERENCES_NAME, Context.MODE_PRIVATE)
        stored.edit().putString(BottomNavigationPreferences.key("alice"), "{broken").commit()
        assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, preferences.load("alice"))
        stored.edit().putBoolean(BottomNavigationPreferences.key("alice"), false).commit()
        assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, preferences.load("alice"))
    }

    @Test fun persistedRowsIgnoreUnknownIdsDuplicatesAndNonStringValues() {
        context.getSharedPreferences(BottomNavigationPreferences.PREFERENCES_NAME, Context.MODE_PRIVATE).edit()
            .putString(BottomNavigationPreferences.key("alice"), "[\"notes\",null,42,\"removed-page\",\"notes\",\"tasks\"]").commit()
        assertEquals(listOf("notes", "tasks"), preferences.load("alice"))
    }

    @Test fun oversizedSavedSelectionKeepsFirstFiveKnownUniquePagesInOrder() {
        preferences.save("alice", listOf("unknown", "settings", "settings", "friends", "home", "tasks", "notes", "lists"))
        assertEquals(listOf("settings", "friends", "home", "tasks", "notes"), preferences.load("alice"))
        assertEquals(BottomNavigationPreferences.DEFAULT_ITEMS, listOf("home", "tasks", "lists", "notes"))
    }

    @Test fun movingAcrossTheListPreservesEveryOtherItemsRelativeOrder() {
        val current = listOf("home", "tasks", "notes", "friends")
        assertEquals(listOf("tasks", "notes", "friends", "home"), BottomNavigationPreferences.move(current, 0, 3))
        assertEquals(listOf("friends", "home", "tasks", "notes"), BottomNavigationPreferences.move(current, 3, 0))
        assertEquals(listOf("home", "tasks", "notes", "friends"), current)
    }

    @Test fun invalidMoveIndicesLeaveSelectionUnchangedAndEmptyIsSafe() {
        val current = listOf("tasks", "notes")
        assertEquals(current, BottomNavigationPreferences.move(current, -1, 1))
        assertEquals(current, BottomNavigationPreferences.move(current, 0, 2))
        assertEquals(current, BottomNavigationPreferences.move(current, 1, 1))
        assertTrue(BottomNavigationPreferences.move(emptyList(), 0, 1).isEmpty())
    }

    @Test fun catalogContainsEveryWorkspacePageExactlyOnce() {
        assertEquals(setOf("home", "tasks", "lists", "notes", "calendar_events", "zen_reminders", "friends", "insights", "categories", "settings"), WorkspaceDestinations.all.map { it.id }.toSet())
        assertEquals(10, WorkspaceDestinations.all.size)
        assertTrue(WorkspaceDestinations.all.all { it.label.isNotBlank() && WorkspaceDestinations.find(it.id) == it })
    }
}
