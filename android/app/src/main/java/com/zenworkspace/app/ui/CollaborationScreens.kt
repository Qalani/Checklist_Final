package com.zenworkspace.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zenworkspace.app.data.NativeRepository
import com.zenworkspace.app.data.Row as DataRow
import com.zenworkspace.app.data.WorkspaceState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun FriendsScreen(state: WorkspaceState, onRpc: (String, JSONObject) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var remove by remember { mutableStateOf<DataRow?>(null) }
    val incoming = state.table("friend_requests").filter { it.text("target_id") == state.userId && it.text("status") == "pending" }
    val outgoing = state.table("friend_requests").filter { it.text("requester_id") == state.userId && it.text("status") == "pending" }
    fun sendRequest() {
        if (email.contains('@')) {
            onRpc("add_friend_by_email", JSONObject().put("target_email", email.trim()))
            email = ""
        }
    }
    LazyColumn(
        Modifier.fillMaxSize().imePadding().testTag("friends-content"),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        email, { email = it }, modifier = Modifier.weight(1f),
                        label = { Text("Friend's email") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { sendRequest() }),
                    )
                    Button(onClick = ::sendRequest, enabled = email.contains('@'),
                        modifier = Modifier.heightIn(min = 48.dp), contentPadding = PaddingValues(horizontal = 16.dp)) { Text("Send") }
                }
            }
        }
        if (incoming.isNotEmpty()) item { CollaborationSectionTitle("Friend requests") }
        items(incoming, key = { "request:${it.id}" }) { request ->
            FriendRequestRow(request,
                onAccept = { onRpc("respond_to_friend_request", JSONObject().put("request_id", request.id).put("action", "accept")) },
                onDecline = { onRpc("respond_to_friend_request", JSONObject().put("request_id", request.id).put("action", "decline")) })
        }
        if (state.table("friends").isNotEmpty()) item { CollaborationSectionTitle("Friends") }
        items(state.table("friends"), key = { "friend:${it.id}" }) { friend ->
            Column {
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (friend.text("friend_name").isNotBlank()) Text(friend.text("friend_name"), style = MaterialTheme.typography.titleSmall)
                        Text(friend.text("friend_email"), style = MaterialTheme.typography.bodyMedium)
                    }
                    TextButton(onClick = { remove = friend }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Remove") }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f))
            }
        }
        if (outgoing.isNotEmpty()) item { CollaborationSectionTitle("Waiting for a reply") }
        items(outgoing, key = { "outgoing:${it.id}" }) { request ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(request.text("target_email"), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Text("Pending", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (state.table("friends").isEmpty() && incoming.isEmpty()) item {
            Text("Add someone you know to start sharing a little of your workspace.",
                Modifier.padding(vertical = 4.dp), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    remove?.let { friend -> AlertDialog(onDismissRequest = { remove = null }, title = { Text("Remove friend?") },
        text = { Text(friend.text("friend_email")) }, confirmButton = { TextButton(onClick = {
            remove = null; onRpc("remove_friend", JSONObject().put("target_friend_id", friend.text("friend_id")))
        }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Remove") } },
        dismissButton = { TextButton(onClick = { remove = null }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel") } }) }
}

@Composable
private fun CollaborationSectionTitle(title: String) {
    Text(title, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.titleSmall)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FriendRequestRow(request: DataRow, onAccept: () -> Unit, onDecline: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val wide = maxWidth >= 440.dp
        val identity: @Composable (Modifier) -> Unit = { modifier ->
            Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (request.text("requester_name").isNotBlank()) Text(request.text("requester_name"), style = MaterialTheme.typography.titleSmall)
                Text(request.text("requester_email"), style = MaterialTheme.typography.bodyMedium)
            }
        }
        val actions: @Composable () -> Unit = {
            FlowRow(Modifier.widthIn(max = 188.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onAccept, modifier = Modifier.heightIn(min = 48.dp)) { Text("Accept") }
                TextButton(onClick = onDecline, modifier = Modifier.heightIn(min = 48.dp)) { Text("Decline") }
            }
        }
        Column {
            if (wide) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                identity(Modifier.weight(1f)); actions()
            } else Column(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                identity(Modifier.fillMaxWidth()); actions()
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f))
        }
    }
}

@Composable
fun SharingDialog(table: String, row: DataRow, repository: NativeRepository, onDismiss: () -> Unit) {
    var members by remember { mutableStateOf<List<DataRow>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var publicToken by remember { mutableStateOf(row.text("public_share_token")) }
    var publicConfirm by remember { mutableStateOf(false) }
    var inviteRevision by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val account by repository.state.collectAsStateWithLifecycle()
    val owner = row.text("access_role") == "owner" || row.text("user_id") == account.userId
    val isTask = table == "tasks"
    val memberTable = if (isTask) "task_collaborators" else "list_members"
    suspend fun load() {
        val result = if (isTask) repository.rpc("get_task_collaborators", JSONObject().put("task_uuid", row.id))
            else repository.select("list_members", "list_id=eq.${row.id}&select=*")
        val array = JSONArray(result)
        members = (0 until array.length()).map { DataRow(array.getJSONObject(it)) }
    }
    fun run(block: suspend () -> Unit) { scope.launch {
        busy = true; error = null
        try { block() } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { error = failure.message ?: "Unable to update sharing." }
        finally { busy = false }
    } }
    LaunchedEffect(row.id) { run { load() } }
    Dialog(onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(8.dp), contentAlignment = Alignment.Center) {
            SharingPanel(
                SharingPresentation(row.id, row.text(if (isTask) "title" else "name"), isTask, members, owner, busy, error, publicToken, inviteRevision),
                modifier = Modifier.widthIn(max = 640.dp).fillMaxWidth().fillMaxHeight(),
                onDismiss = onDismiss,
                onInvite = { email, role -> run {
                    repository.rpc(if (isTask) "invite_task_collaborator" else "invite_list_member", JSONObject()
                        .put(if (isTask) "task_uuid" else "list_uuid", row.id).put("invitee_email", email.trim()).put("desired_role", role))
                    load(); inviteRevision++
                } },
                onMemberRole = { member -> run {
                    repository.save(memberTable, JSONObject().put("id", member.id).put("role", if (member.text("role") == "viewer") "editor" else "viewer")); load()
                } },
                onRemoveMember = { member -> run { repository.delete(memberTable, member.id); load() } },
                onEnablePublic = { publicConfirm = true },
                onShareLink = {
                    val share = android.content.Intent(android.content.Intent.ACTION_SEND)
                        .setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, publicShareLink(publicToken))
                    context.startActivity(android.content.Intent.createChooser(share, "Share list"))
                },
                onRotatePublic = { run {
                    publicToken = JSONObject(repository.rpc("rotate_list_public_share", JSONObject().put("list_uuid", row.id))).getString("token")
                } },
                onDisablePublic = { run {
                    repository.rpc("disable_list_public_share", JSONObject().put("list_uuid", row.id)); publicToken = ""
                } },
            )
        }
    }
    if (publicConfirm) AlertDialog(onDismissRequest = { publicConfirm = false }, title = { Text("Make list public?") },
        text = { Text("Anyone with its share link will be able to read this list and its items. You can disable sharing later.") },
        confirmButton = { TextButton(onClick = { publicConfirm = false; run {
            publicToken = JSONObject(repository.rpc("enable_list_public_share", JSONObject().put("list_uuid", row.id))).getString("token")
        } }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Enable") } },
        dismissButton = { TextButton(onClick = { publicConfirm = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel") } })
}

internal data class SharingPresentation(
    val itemId: String,
    val name: String,
    val isTask: Boolean,
    val members: List<DataRow>,
    val owner: Boolean,
    val busy: Boolean = false,
    val error: String? = null,
    val publicToken: String = "",
    val inviteRevision: Int = 0,
)

/** Fixed dismissal controls remain reachable while invitation/member content scrolls above the IME. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SharingPanel(
    view: SharingPresentation,
    modifier: Modifier = Modifier,
    onDismiss: () -> Unit,
    onInvite: (String, String) -> Unit,
    onMemberRole: (DataRow) -> Unit,
    onRemoveMember: (DataRow) -> Unit,
    onEnablePublic: () -> Unit,
    onShareLink: () -> Unit,
    onRotatePublic: () -> Unit,
    onDisablePublic: () -> Unit,
) {
    var email by rememberSaveable(view.itemId) { mutableStateOf("") }
    var role by rememberSaveable(view.itemId) { mutableStateOf("viewer") }
    LaunchedEffect(view.inviteRevision) { if (view.inviteRevision > 0) email = "" }
    fun invite() {
        if (!view.busy && email.contains('@')) onInvite(email.trim(), role)
    }
    Surface(modifier.testTag("sharing-panel"), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().testTag("sharing-header").padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Share ${if (view.isTask) "task" else "list"}", style = MaterialTheme.typography.titleLarge)
                    Text(view.name, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") }
            }
            HorizontalDivider()
            if (view.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp))
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).testTag("sharing-content")
                .padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                view.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                if (view.owner) {
                    OutlinedTextField(email, { email = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Invite by email") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { invite() }))
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = role == "viewer", onClick = { role = "viewer" }, label = { Text("Viewer") }, modifier = Modifier.heightIn(min = 48.dp))
                        FilterChip(selected = role == "editor", onClick = { role = "editor" }, label = { Text("Editor") }, modifier = Modifier.heightIn(min = 48.dp))
                        Button(enabled = !view.busy && email.contains('@'), onClick = ::invite, modifier = Modifier.heightIn(min = 48.dp)) { Text("Invite") }
                    }
                    HorizontalDivider()
                }
                CollaborationSectionTitle("People with access")
                if (view.members.isEmpty() && !view.busy) Text("No collaborators yet.", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                view.members.forEach { member ->
                    Column(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SelectionContainer(Modifier.weight(1f)) {
                                Text(member.text("user_email").ifBlank { member.text("user_id") }, style = MaterialTheme.typography.bodyMedium)
                            }
                            Text(member.text("role").replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
                        }
                        if (view.owner && member.text("role") != "owner" && !member.bool("is_owner")) {
                            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                TextButton(enabled = !view.busy, onClick = { onMemberRole(member) }, modifier = Modifier.heightIn(min = 48.dp)) {
                                    Text(if (member.text("role") == "viewer") "Make editor" else "Make viewer")
                                }
                                TextButton(enabled = !view.busy, onClick = { onRemoveMember(member) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Remove access") }
                            }
                        } else Spacer(Modifier.height(8.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f))
                    }
                }
                if (view.owner && !view.isTask) {
                    CollaborationSectionTitle("Public link")
                    if (view.publicToken.isBlank()) TextButton(onClick = onEnablePublic, enabled = !view.busy,
                        modifier = Modifier.heightIn(min = 48.dp)) { Text("Enable public sharing") }
                    else {
                        Text("Anyone with this link can view the list.", style = MaterialTheme.typography.bodyMedium)
                        SelectionContainer {
                            Text(publicShareLink(view.publicToken), Modifier.fillMaxWidth(), style = MaterialTheme.typography.bodySmall)
                        }
                        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = onShareLink, modifier = Modifier.heightIn(min = 48.dp)) { Text("Share link") }
                            TextButton(onClick = onRotatePublic, enabled = !view.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Replace link") }
                            TextButton(onClick = onDisablePublic, enabled = !view.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Disable sharing") }
                        }
                    }
                }
            }
        }
    }
}

private fun publicShareLink(token: String) = "https://zenchecklist.vercel.app/lists/share/$token"
