package com.zenworkspace.app.ui

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.repeatOnLifecycle
import com.zenworkspace.app.BuildConfig
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

private data class Destination(val id: String, val label: String)
private val destinations = listOf(Destination("home", "Home"), Destination("tasks", "Tasks"),
    Destination("lists", "Lists"), Destination("notes", "Notes"), Destination("calendar_events", "Calendar"),
    Destination("zen_reminders", "Reminders"), Destination("friends", "Friends"),
    Destination("insights", "Insights"), Destination("categories", "Categories"), Destination("settings", "Settings"))

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
    var menu by remember { mutableStateOf(false) }
    var sharing by remember { mutableStateOf<Pair<String, DataRow>?>(null) }
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
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = { TopAppBar(title = { Column {
                Text("Zen Workspace", style = MaterialTheme.typography.titleMedium)
                Text(if (state.userId == null) "A little space to focus" else destinations.first { it.id == section }.label,
                    style = MaterialTheme.typography.bodySmall)
            } }, actions = {
                if (state.userId != null) {
                    IconButton(onClick = model::refresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, "Sync workspace") }
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Default.Menu, "Workspace sections") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            destinations.forEach { destination -> DropdownMenuItem(text = { Text(destination.label) }, onClick = {
                                section = destination.id; menu = false
                            }) }
                        }
                    }
                }
            }) },
            bottomBar = {
                if (state.userId != null) {
                    NavigationBar {
                        destinations.take(4).forEachIndexed { index, item ->
                            NavigationBarItem(
                                selected = section == item.id,
                                onClick = { section = item.id },
                                icon = {
                                    Icon(when (index) {
                                        0 -> Icons.Default.Home
                                        1 -> Icons.Default.CheckCircle
                                        2 -> Icons.AutoMirrored.Filled.List
                                        else -> Icons.Default.EditNote
                                    }, item.label)
                                },
                                label = { Text(item.label) }
                            )
                        }
                    }
                }
            }
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
                if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (state.pending > 0) {
                    Text("${state.pending} change${if (state.pending == 1) "" else "s"} saved on this device · waiting to sync",
                        Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall)
                }
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
                        }, requestNotifications)
                        else -> CollectionScreen(section, state,
                            onSave = { table, values -> action { model.repository.save(table, values) } },
                            onDelete = { table, id -> action { model.repository.delete(table, id) } },
                            onRpc = { name, body -> action { model.repository.rpc(name, body) } },
                            onShare = { table, row -> sharing = table to row })
                    }
                }
            }
        }
        if (state.passwordRecovery) PasswordRecoveryDialog(model)
        sharing?.let { (table, row) -> SharingDialog(table, row, model.repository) { sharing = null } }
    }
}

@Composable
private fun AuthScreen(state: WorkspaceState, model: ZenViewModel) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var create by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Spacer(Modifier.height(24.dp))
        Text("Make room for what matters.", style = MaterialTheme.typography.headlineMedium)
        Text("Your tasks, lists and notes, together in a calmer workspace.")
        if (!state.configured) {
            Card { Text("This build needs a Supabase project URL and publishable key. Build the APK with SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to connect your workspace.", Modifier.padding(20.dp)) }
        }
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        Button(onClick = { model.action { if (create) model.repository.signUp(email.trim(), password) else model.repository.signIn(email.trim(), password) } },
            enabled = state.configured && !state.busy && email.contains('@') && password.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
            Text(if (create) "Create account" else "Sign in")
        }
        OutlinedButton(onClick = { model.action { androidx.browser.customtabs.CustomTabsIntent.Builder().build().launchUrl(context, model.repository.beginGoogleSignIn()) } },
            enabled = state.configured && !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Continue with Google") }
        TextButton(onClick = { create = !create }) { Text(if (create) "Already have an account? Sign in" else "Create an account") }
        TextButton(onClick = { model.action { model.repository.resetPassword(email.trim()) } }, enabled = state.configured && email.contains('@')) { Text("Reset password") }
    }
}

@Composable
private fun HomeScreen(state: WorkspaceState, navigate: (String) -> Unit) {
    val tasks = state.table("tasks")
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Text("A clearer day starts here.", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text("${tasks.count { !it.bool("completed") }} tasks to do. Take them one at a time.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(destinations.filter { it.id !in listOf("home", "settings", "categories") }) { destination ->
            val count = when(destination.id) { "tasks" -> tasks.count { !it.bool("completed") }; "insights" -> tasks.count { it.bool("completed") }; else -> state.table(destination.id).size }
            ElevatedCard(onClick = { navigate(destination.id) }, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(22.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(destination.label, style = MaterialTheme.typography.titleMedium)
                    Text(count.toString(), color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun InsightsScreen(state: WorkspaceState) {
    val tasks = state.table("tasks")
    val complete = tasks.count { it.bool("completed") }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item {
            Text("Your progress", style = MaterialTheme.typography.headlineMedium)
            Text("$complete of ${tasks.size} tasks complete")
            Spacer(Modifier.height(16.dp))
            LinearProgressIndicator(progress = { if (tasks.isEmpty()) 0f else complete.toFloat() / tasks.size }, modifier = Modifier.fillMaxWidth())
        }
        items(tasks.groupBy { it.text("category").ifBlank { "Uncategorised" } }.toList()) { (category, rows) ->
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(20.dp)) {
                Text(category, style = MaterialTheme.typography.titleMedium)
                Text("${rows.count { it.bool("completed") }} / ${rows.size} complete")
            } }
        }
        item { Text("${state.table("notes").size} notes · ${state.table("lists").size} lists · ${state.table("zen_reminders").size} reminders") }
    }
}

@Composable
private fun SettingsScreen(state: WorkspaceState, model: ZenViewModel, theme: String, setTheme: (String) -> Unit, requestNotifications: () -> Unit) {
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
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Your workspace", style = MaterialTheme.typography.headlineMedium)
        Text(state.email)
        Text("Appearance", style = MaterialTheme.typography.titleMedium)
        listOf("system" to "Use device theme", "zen" to "Zen Light", "dawn" to "Dawn Light", "midnight" to "Midnight Dark", "forest" to "Forest Dark").forEach { (id, name) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { setTheme(id) }) { Text(name) }
                RadioButton(selected = theme == id, onClick = { setTheme(id) })
            }
        }
        HorizontalDivider()
        OutlinedButton(requestNotifications) { Text("Enable notifications") }
        OutlinedButton(onClick = { export.launch("zen-workspace-${java.time.LocalDate.now()}.json") }) { Text("Export workspace backup") }
        OutlinedButton(onClick = { import.launch(arrayOf("application/json", "text/plain")) }) { Text("Import workspace backup") }
        OutlinedButton(onClick = { importCalendar.launch(arrayOf("text/calendar", "application/ics", "application/octet-stream", "text/plain")) }) { Text("Import calendar (.ics)") }
        if (state.pending > 0) {
            OutlinedButton(onClick = { exportPending.launch("zen-pending-changes.json") }) { Text("Export pending changes") }
            TextButton(onClick = { discardChanges = true }) { Text("Discard pending changes") }
        }
        Text("Backups contain personal workspace data. Store them somewhere private. Imports create new copies.", style = MaterialTheme.typography.bodySmall)
        HorizontalDivider()
        Text("Zen Workspace ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall)
        Text("Native Android · Kotlin and Jetpack Compose", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { signOut = true }) { Text("Sign out") }
    }
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
    var password by remember { mutableStateOf("") }
    val state by model.repository.state.collectAsStateWithLifecycle()
    AlertDialog(onDismissRequest = {}, title = { Text("Set your new password") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Choose a password of at least 6 characters.")
            OutlinedTextField(password, { password = it }, label = { Text("New password") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        } }, confirmButton = { TextButton(enabled = password.length >= 6 && !state.busy,
            onClick = { model.action { model.repository.updatePassword(password) } }) { Text("Update password") } })
}
