package com.zenworkspace.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
internal fun AuthContent(
    configured: Boolean,
    busy: Boolean,
    onSubmit: (String, String, Boolean) -> Unit,
    onGoogle: () -> Unit,
    onReset: (String) -> Unit,
) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var create by rememberSaveable { mutableStateOf(false) }
    val form: @Composable ColumnScope.() -> Unit = {
        if (!configured) {
            Card(Modifier.fillMaxWidth()) {
                Text("This build needs a Supabase project URL and publishable key. Build the APK with SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to connect your workspace.", Modifier.padding(12.dp))
            }
        }
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        Button(onClick = { onSubmit(email.trim(), password, create) },
            enabled = configured && !busy && email.contains('@') && password.isNotEmpty(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(if (create) "Create account" else "Sign in")
        }
        OutlinedButton(onClick = onGoogle, enabled = configured && !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Continue with Google") }
        TextButton(onClick = { create = !create }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(if (create) "Already have an account? Sign in" else "Create an account")
        }
        TextButton(onClick = { onReset(email.trim()) }, enabled = configured && email.contains('@'), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Reset password") }
    }
    BoxWithConstraints(Modifier.fillMaxSize().testTag("auth-content")) {
        if (maxWidth >= 600.dp) {
            Row(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.weight(0.8f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Make room for what matters.", style = MaterialTheme.typography.headlineSmall)
                    Text("Tasks, lists and notes in one workspace.", style = MaterialTheme.typography.bodyMedium)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp), content = form)
            }
        } else {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Make room for what matters.", style = MaterialTheme.typography.headlineSmall)
                form()
            }
        }
    }
}


@Composable
internal fun PasswordRecoveryContent(
    busy: Boolean,
    message: String?,
    onUpdate: (String) -> Unit,
    onCancel: () -> Unit,
) {
    var password by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = {},
        modifier = Modifier.padding(horizontal = 10.dp).widthIn(max = 560.dp).fillMaxWidth(),
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
        title = { Text("Set your new password") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Choose a password of at least 6 characters.")
                OutlinedTextField(password, { password = it }, label = { Text("New password") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(enabled = password.length >= 6 && !busy,
                modifier = Modifier.heightIn(min = 48.dp), onClick = { onUpdate(password) }) { Text("Update password") }
        },
        dismissButton = {
            TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel recovery") }
        },
    )
}
