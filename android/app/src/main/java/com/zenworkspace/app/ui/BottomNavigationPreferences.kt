package com.zenworkspace.app.ui

import android.content.Context
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector
import org.json.JSONArray

data class WorkspaceDestination(val id: String, val label: String, val icon: ImageVector)

object WorkspaceDestinations {
    val all: List<WorkspaceDestination> = listOf(
        WorkspaceDestination("home", "Home", Icons.Default.Home),
        WorkspaceDestination("tasks", "Tasks", Icons.Default.CheckCircle),
        WorkspaceDestination("lists", "Lists", Icons.AutoMirrored.Filled.List),
        WorkspaceDestination("notes", "Notes", Icons.Default.EditNote),
        WorkspaceDestination("calendar_events", "Calendar", Icons.Default.CalendarMonth),
        WorkspaceDestination("zen_reminders", "Reminders", Icons.Default.Notifications),
        WorkspaceDestination("friends", "Friends", Icons.Default.People),
        WorkspaceDestination("insights", "Insights", Icons.Default.Insights),
        WorkspaceDestination("categories", "Categories", Icons.Default.Category),
        WorkspaceDestination("settings", "Settings", Icons.Default.Settings),
    )

    fun find(id: String): WorkspaceDestination? = all.firstOrNull { it.id == id }
}

/** Device preferences belong to an account, independently of its synced workspace. */
class BottomNavigationPreferences(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(userId: String): List<String> {
        require(userId.isNotBlank()) { "An account is required to load navigation preferences." }
        return runCatching {
            val saved = preferences.getString(key(userId), null) ?: return DEFAULT_ITEMS.toList()
            val array = JSONArray(saved)
            normalize((0 until array.length()).mapNotNull { array.opt(it) as? String })
        }.getOrElse { DEFAULT_ITEMS.toList() }
    }

    fun save(userId: String, ids: List<String>) {
        require(userId.isNotBlank()) { "An account is required to save navigation preferences." }
        preferences.edit().putString(key(userId), JSONArray(normalize(ids)).toString()).apply()
    }

    companion object {
        val DEFAULT_ITEMS: List<String> = listOf("home", "tasks", "lists", "notes")
        const val MAX_ITEMS = 5
        internal const val PREFERENCES_NAME = "native_bottom_navigation"
        internal fun key(userId: String) = "account:$userId"

        fun normalize(ids: List<String>): List<String> = ids.asSequence()
            .filter { WorkspaceDestinations.find(it) != null }.distinct().take(MAX_ITEMS).toList()

        /** Bounds checks make accessibility buttons and gesture reordering agree. */
        fun move(ids: List<String>, fromIndex: Int, toIndex: Int): List<String> {
            val current = normalize(ids)
            if (fromIndex !in current.indices || toIndex !in current.indices || fromIndex == toIndex) return current
            return current.toMutableList().apply { add(toIndex, removeAt(fromIndex)) }.toList()
        }
    }
}
