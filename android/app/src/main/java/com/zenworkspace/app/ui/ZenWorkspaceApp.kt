package com.zenworkspace.app.ui

import android.app.Application
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.repeatOnLifecycle
import com.zenworkspace.app.util.CalendarImport
import com.zenworkspace.app.data.NativeRepository
import com.zenworkspace.app.data.Row as DataRow
import com.zenworkspace.app.data.WorkspaceState
import com.zenworkspace.app.notifications.PushNotifications
import com.zenworkspace.app.notifications.ReminderScheduler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

class ZenViewModel(application: Application) : AndroidViewModel(application) {
    val repository = NativeRepository(application)
    var requestedSection by mutableStateOf<String?>(null)
    var error by mutableStateOf<String?>(null)
        private set
    fun action(block: suspend () -> Unit) { viewModelScope.launch {
        val startedUser = repository.state.value.userId
        try { block() } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { if (startedUser == repository.state.value.userId) error = failure.message ?: "Unable to complete this action. Please try again." }
    } }
    init {
        viewModelScope.launch {
            repository.state.collect { state ->
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                if (state.userId == null) ReminderScheduler.cancelAll(application)
                else ReminderScheduler.schedule(application, state.table("tasks").map { it.values },
                    state.table("zen_reminders").map { it.values }, state.userId)
                }
            }
        }
    }
    fun handleCallback(uri: Uri) { action { repository.handleCallback(uri) } }
    fun dismissError() { error = null; repository.clearMessage() }
    fun refresh() { action { repository.refresh() } }
}

private val light = lightColorScheme(primary = Color(0xFF286B65), onPrimary = Color.White,
    secondary = Color(0xFF64627C), background = Color(0xFFF4F7F8), surface = Color(0xFFF9FBFB),
    surfaceVariant = Color(0xFFE7EFEE), onSurface = Color(0xFF202F35))
private val dark = darkColorScheme(primary = Color(0xFF9AD3C8), onPrimary = Color(0xFF123B35),
    background = Color(0xFF141E28), surface = Color(0xFF1D2B38), surfaceVariant = Color(0xFF304251),
    onSurface = Color(0xFFE3EAF0))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ZenWorkspaceApp(model: ZenViewModel, requestNotifications: () -> Unit) {
    val state by model.repository.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("native_appearance", 0) }
    var theme by rememberSaveable { mutableStateOf(preferences.getString("theme", "system") ?: "system") }
    val isDark = theme == "midnight" || theme == "forest" || (theme == "system" && androidx.compose.foundation.isSystemInDarkTheme())
    val scheme = when (theme) {
        "forest" -> dark.copy(background = Color(0xFF13241F), surface = Color(0xFF20382F), primary = Color(0xFFA5D6B1))
        "dawn" -> light.copy(background = Color(0xFFFBF5EF), surface = Color(0xFFFFFBF6), primary = Color(0xFF805849))
        else -> if (isDark) dark else light
    }
    SideEffect {
        (context as? android.app.Activity)?.let { activity ->
            androidx.core.view.WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
                isAppearanceLightStatusBars = !isDark
                isAppearanceLightNavigationBars = !isDark
            }
        }
    }
    var section by rememberSaveable(state.userId) { mutableStateOf("home") }
    val navigationPreferences = remember { BottomNavigationPreferences(context) }
    var bottomItems by remember(state.userId) {
        mutableStateOf(state.userId?.let(navigationPreferences::load) ?: BottomNavigationPreferences.DEFAULT_ITEMS)
    }
    var editBottomBar by rememberSaveable(state.userId) { mutableStateOf(false) }
    var sharing by remember(state.userId) { mutableStateOf<Pair<String, DataRow>?>(null) }
    val snackbar = remember { SnackbarHostState() }
    val action: (suspend () -> Unit) -> Unit = model::action
    MaterialTheme(colorScheme = scheme) {
        LifecycleResumeEffect(state.userId) {
            model.refresh()
            if (state.userId != null) model.action {
                try { PushNotifications.register(context, model.repository) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { }
            }
            onPauseOrDispose { }
        }
        // Pull changes made on another device while the native workspace is visible.
        val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
        LaunchedEffect(state.userId, lifecycleOwner) {
            lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (true) { delay(30_000); if (state.userId != null) {
                    try { model.repository.refresh() }
                    catch (cancelled: CancellationException) { throw cancelled }
                    catch (_: Exception) { }
                } }
            }
        }
        LaunchedEffect(state.userId) {
            if (state.userId != null) {
                if (!preferences.getBoolean("notifications_requested", false)) {
                    preferences.edit().putBoolean("notifications_requested", true).apply()
                    requestNotifications()
                }
                try { PushNotifications.register(context, model.repository) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { /* Local reminders remain available without push registration. */ }
            }
        }
        LaunchedEffect(model.requestedSection, state.userId) {
            if (state.userId != null && model.requestedSection != null) {
                section = model.requestedSection!!; model.requestedSection = null
            }
        }
        LaunchedEffect(model.error, state.message) {
            (model.error ?: state.message)?.let { snackbar.showSnackbar(it); model.dismissError() }
        }
        BackHandler(section != "home" && state.userId != null) { section = "home" }
        WorkspaceShell(
            state = state,
            section = section,
            bottomItems = bottomItems,
            onSection = { section = it },
            onRefresh = model::refresh,
            onEditNavigation = { editBottomBar = true },
            snackbar = snackbar,
        ) {
            if (state.userId == null) {
                AuthScreen(state, model)
            } else {
                when (section) {
                    "home" -> HomeScreen(state) { section = it }
                    "insights" -> InsightsScreen(state)
                    "friends" -> FriendsScreen(state) { name, body -> action { model.repository.rpc(name, body) } }
                    "settings" -> SettingsScreen(state, model, theme, { value ->
                        theme = value
                        preferences.edit().putString("theme", value).apply()
                    }, requestNotifications, bottomItems, { editBottomBar = true })
                    else -> CollectionScreen(section, state,
                        onSave = { table, values -> action { model.repository.save(table, values) } },
                        onDelete = { table, id -> action { model.repository.delete(table, id) } },
                        onRpc = { name, body -> action { model.repository.rpc(name, body) } },
                        onShare = { table, row -> sharing = table to row })
                }
            }
        }
        if (editBottomBar && state.userId != null) {
            BottomNavigationEditor(
                selectedIds = bottomItems,
                onChange = { ids ->
                    bottomItems = ids
                    state.userId?.let { navigationPreferences.save(it, ids) }
                },
                onDismiss = { editBottomBar = false },
            )
        }
        if (state.passwordRecovery) PasswordRecoveryDialog(model)
        sharing?.let { (table, row) -> SharingDialog(table, row, model.repository) { sharing = null } }
    }
}

@Composable
private fun AuthScreen(state: WorkspaceState, model: ZenViewModel) {
    val context = LocalContext.current
    AuthContent(
        configured = state.configured,
        busy = state.busy,
        onSubmit = { email, password, create -> model.action {
            if (create) model.repository.signUp(email, password) else model.repository.signIn(email, password)
        } },
        onGoogle = { model.action {
            androidx.browser.customtabs.CustomTabsIntent.Builder().build().launchUrl(context, model.repository.beginGoogleSignIn())
        } },
        onReset = { email -> model.action { model.repository.resetPassword(email) } },
    )
}

@Composable
private fun SettingsScreen(state: WorkspaceState, model: ZenViewModel, theme: String, setTheme: (String) -> Unit, requestNotifications: () -> Unit, bottomItems: List<String>, editNavigation: () -> Unit) {
    val context = LocalContext.current
    var signOut by remember { mutableStateOf(false) }
    var confirmImport by remember { mutableStateOf<Uri?>(null) }
    var confirmCalendar by remember { mutableStateOf<Uri?>(null) }
    var discardChanges by remember { mutableStateOf(false) }
    val tables = remember { listOf("categories", "tasks", "lists", "list_items", "notes", "calendar_events", "zen_reminders") }
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) model.action {
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val payload = JSONObject().put("format", "zen-native-v1").put("exported_at", Instant.now().toString())
                tables.forEach { table -> payload.put(table, JSONArray(state.table(table).map { it.values })) }
                context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(payload.toString(2)) }
                    ?: error("Unable to write to the selected file.")
            }
        }
    }
    val exportPending = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) model.action {
            val content = model.repository.exportPending()
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(content) }
                    ?: error("Unable to write the pending changes file.")
            }
        }
    }
    val importCalendar = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> confirmCalendar = uri }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> confirmImport = uri }
    SettingsContent(
        email = state.email,
        theme = theme,
        setTheme = setTheme,
        bottomItems = bottomItems,
        pending = state.pending,
        actions = SettingsActions(
            editNavigation = editNavigation,
            notifications = requestNotifications,
            exportBackup = { export.launch("zen-workspace-${java.time.LocalDate.now()}.json") },
            importBackup = { import.launch(arrayOf("application/json", "text/plain")) },
            importCalendar = { importCalendar.launch(arrayOf("text/calendar", "application/ics", "application/octet-stream", "text/plain")) },
            exportPending = { exportPending.launch("zen-pending-changes.json") },
            discardPending = { discardChanges = true },
            signOut = { signOut = true },
        ),
    )
    confirmCalendar?.let { uri -> AlertDialog(onDismissRequest = { confirmCalendar = null }, title = { Text("Import calendar?") },
        text = { Text("Add events from this iCalendar file to your workspace. Recurring events must be expanded by the calendar you export from.") },
        confirmButton = { TextButton(onClick = {
            confirmCalendar = null
            model.action {
                val events = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val source = context.contentResolver.openInputStream(uri)?.use { input ->
                        val buffer = java.io.ByteArrayOutputStream()
                        val chunk = ByteArray(8192)
                        var count: Int
                        while (input.read(chunk).also { count = it } != -1) {
                            require(buffer.size() + count <= 1_048_576) { "Choose a calendar smaller than 1 MB." }
                            buffer.write(chunk, 0, count)
                        }
                        buffer.toString("UTF-8")
                    } ?: error("Unable to read this calendar.")
                    CalendarImport.parse(source)
                }
                events.forEach { model.repository.save("calendar_events", it) }
            }
        }) { Text("Import events") } }, dismissButton = { TextButton(onClick = { confirmCalendar = null }) { Text("Cancel") } }) }
    if (discardChanges) AlertDialog(onDismissRequest = { discardChanges = false }, title = { Text("Discard unsynced changes?") },
        text = { Text("Export your pending changes first if you need to keep them. This removes unsynced edits for this account from this device and reloads the online workspace. This cannot be undone.") },
        confirmButton = { TextButton(onClick = { discardChanges = false; model.action { model.repository.discardPending() } }) { Text("Discard and reload") } },
        dismissButton = { TextButton(onClick = { discardChanges = false }) { Text("Keep changes") } })
    if (signOut) AlertDialog(onDismissRequest = { signOut = false }, title = { Text("Sign out?") },
        text = { Text(if (state.pending > 0) "${state.pending} pending changes remain saved on this device for this account. Sign in again to sync them." else "Your synced workspace will be available when you return.") },
        confirmButton = { TextButton(onClick = { signOut = false; model.action {
                PushNotifications.forgetLocalToken(context)
                model.repository.signOut()
            } }) { Text("Sign out") } },
        dismissButton = { TextButton(onClick = { signOut = false }) { Text("Cancel") } })
    confirmImport?.let { uri -> AlertDialog(onDismissRequest = { confirmImport = null }, title = { Text("Import backup?") },
        text = { Text("This adds copies of your backup to the signed-in workspace. Import a file only once to avoid duplicates.") },
        confirmButton = { TextButton(onClick = {
            confirmImport = null
            model.action {
                val payload = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        val buffer = java.io.ByteArrayOutputStream()
                        val chunk = ByteArray(8192)
                        var count: Int
                        while (input.read(chunk).also { count = it } != -1) {
                            require(buffer.size() + count <= 5_000_000) { "Choose a backup smaller than 5 MB." }
                            buffer.write(chunk, 0, count)
                        }
                        val bytes = buffer.toByteArray()
                        require(bytes.size <= 5_000_000) { "Choose a backup smaller than 5 MB." }
                        JSONObject(bytes.toString(Charsets.UTF_8))
                    } ?: error("Unable to read the selected backup.")
                }
                require(payload.optString("format") == "zen-native-v1") { "Choose a Zen Workspace native backup." }
                val listIds = mutableMapOf<String, String>()
                tables.forEach { table ->
                    val entries = payload.optJSONArray(table) ?: JSONArray()
                    require(entries.length() <= 5000) { "This backup has too many rows." }
                    for (index in 0 until entries.length()) {
                        val entry = JSONObject(entries.getJSONObject(index).toString())
                        val oldId = entry.optString("id")
                        val id = UUID.randomUUID().toString()
                        if (table == "lists") listIds[oldId] = id
                        if (table == "list_items") {
                            val parent = listIds[entry.optString("list_id")] ?: continue
                            entry.put("list_id", parent)
                        }
                        listOf("user_id", "access_role", "owner_id", "members", "items", "public_share_token", "public_share_enabled", "created_at", "updated_at").forEach(entry::remove)
                        entry.put("id", id)
                        model.repository.save(table, entry)
                    }
                }
            }
        }) { Text("Import copies") } }, dismissButton = { TextButton(onClick = { confirmImport = null }) { Text("Cancel") } }) }
}

@Composable
private fun PasswordRecoveryDialog(model: ZenViewModel) {
    val context = LocalContext.current
    val state by model.repository.state.collectAsStateWithLifecycle()
    PasswordRecoveryContent(
        busy = state.busy,
        message = state.message ?: model.error,
        onUpdate = { password -> model.action { model.repository.updatePassword(password) } },
        onCancel = { model.action {
            PushNotifications.forgetLocalToken(context)
            model.repository.signOut()
        } },
    )
}
