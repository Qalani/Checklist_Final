package com.zenworkspace.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Text("Better, together.", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(email, { email = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Friend's email") }, singleLine = true)
            Button(onClick = { onRpc("add_friend_by_email", JSONObject().put("target_email", email.trim())); email = "" }, enabled = email.contains('@')) { Text("Send friend request") }
        }
        if (incoming.isNotEmpty()) item { Text("Friend requests", style = MaterialTheme.typography.titleMedium) }
        items(incoming, key = { "request:${it.id}" }) { request ->
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                Text(request.text("requester_email"))
                Row {
                    TextButton(onClick = { onRpc("respond_to_friend_request", JSONObject().put("request_id", request.id).put("action", "accept")) }) { Text("Accept") }
                    TextButton(onClick = { onRpc("respond_to_friend_request", JSONObject().put("request_id", request.id).put("action", "decline")) }) { Text("Decline") }
                }
            } }
        }
        items(state.table("friends"), key = { it.id }) { friend ->
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                Text(friend.text("friend_name").ifBlank { friend.text("friend_email") }, style = MaterialTheme.typography.titleMedium)
                Text(friend.text("friend_email"))
                TextButton(onClick = { remove = friend }) { Text("Remove friend") }
            } }
        }
        if (outgoing.isNotEmpty()) item { Text("Waiting for a reply", style = MaterialTheme.typography.titleMedium) }
        items(outgoing, key = { "outgoing:${it.id}" }) { Text(it.text("target_email")) }
        if (state.table("friends").isEmpty() && incoming.isEmpty()) item { Text("Add someone you know to start sharing a little of your workspace.") }
    }
    remove?.let { friend -> AlertDialog(onDismissRequest = { remove = null }, title = { Text("Remove friend?") },
        text = { Text(friend.text("friend_email")) }, confirmButton = { TextButton(onClick = {
            remove = null; onRpc("remove_friend", JSONObject().put("target_friend_id", friend.text("friend_id")))
        }) { Text("Remove") } }, dismissButton = { TextButton(onClick = { remove = null }) { Text("Cancel") } }) }
}

@Composable
fun SharingDialog(table: String, row: DataRow, repository: NativeRepository, onDismiss: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf("viewer") }
    var members by remember { mutableStateOf<List<DataRow>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var publicToken by remember { mutableStateOf(row.text("public_share_token")) }
    var publicConfirm by remember { mutableStateOf(false) }
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
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Share ${if (isTask) "task" else "list"}") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(row.text(if (isTask) "title" else "name"))
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            members.forEach { member ->
                Column {
                    Text(member.text("user_email").ifBlank { member.text("user_id") }, style = MaterialTheme.typography.bodyMedium)
                    Text(member.text("role"), style = MaterialTheme.typography.bodySmall)
                    if (owner && member.text("role") != "owner" && !member.bool("is_owner")) Row {
                        TextButton(enabled = !busy, onClick = { run {
                            repository.save(memberTable, JSONObject().put("id", member.id).put("role", if (member.text("role") == "viewer") "editor" else "viewer")); load()
                        } }) { Text(if (member.text("role") == "viewer") "Make editor" else "Make viewer") }
                        TextButton(enabled = !busy, onClick = { run { repository.delete(memberTable, member.id); load() } }) { Text("Remove") }
                    }
                }
            }
            if (owner) {
                HorizontalDivider()
                OutlinedTextField(email, { email = it }, label = { Text("Invite by email") }, singleLine = true)
                Row {
                    FilterChip(selected = role == "viewer", onClick = { role = "viewer" }, label = { Text("Viewer") })
                    Spacer(Modifier.width(8.dp))
                    FilterChip(selected = role == "editor", onClick = { role = "editor" }, label = { Text("Editor") })
                }
                Button(enabled = !busy && email.contains('@'), onClick = { run {
                    repository.rpc(if (isTask) "invite_task_collaborator" else "invite_list_member", JSONObject()
                        .put(if (isTask) "task_uuid" else "list_uuid", row.id).put("invitee_email", email.trim()).put("desired_role", role))
                    email = ""; load()
                } }) { Text("Invite") }
                if (!isTask) {
                    HorizontalDivider()
                    if (publicToken.isBlank()) TextButton(onClick = { publicConfirm = true }, enabled = !busy) { Text("Enable public sharing") }
                    else {
                        Text("Public sharing is enabled. Anyone with the existing web share link can view this list.")
                        SelectionToken("https://zenchecklist.vercel.app/lists/share/$publicToken")
                        TextButton(onClick = {
                            val share = android.content.Intent(android.content.Intent.ACTION_SEND)
                                .setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT,
                                    "https://zenchecklist.vercel.app/lists/share/$publicToken")
                            context.startActivity(android.content.Intent.createChooser(share, "Share list"))
                        }) { Text("Share link") }
                        TextButton(onClick = { run {
                            val response = JSONObject(repository.rpc("rotate_list_public_share", JSONObject().put("list_uuid", row.id)))
                            publicToken = response.getString("token")
                        } }, enabled = !busy) { Text("Replace share token") }
                        TextButton(onClick = { run {
                            repository.rpc("disable_list_public_share", JSONObject().put("list_uuid", row.id)); publicToken = ""
                        } }, enabled = !busy) { Text("Disable public sharing") }
                    }
                }
            }
        } }, confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } })
    if (publicConfirm) AlertDialog(onDismissRequest = { publicConfirm = false }, title = { Text("Make list public?") },
        text = { Text("Anyone with its share link will be able to read this list and its items. You can disable sharing later.") },
        confirmButton = { TextButton(onClick = { publicConfirm = false; run {
            publicToken = JSONObject(repository.rpc("enable_list_public_share", JSONObject().put("list_uuid", row.id))).getString("token")
        } }) { Text("Enable") } }, dismissButton = { TextButton(onClick = { publicConfirm = false }) { Text("Cancel") } })
}

@Composable
private fun SelectionToken(value: String) {
    androidx.compose.foundation.text.selection.SelectionContainer { Text(value, style = MaterialTheme.typography.bodySmall) }
}
