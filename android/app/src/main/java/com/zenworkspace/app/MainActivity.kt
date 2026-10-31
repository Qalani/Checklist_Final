package com.zenworkspace.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.ViewModelProvider
import com.zenworkspace.app.ui.ZenViewModel
import com.zenworkspace.app.ui.ZenWorkspaceApp

class MainActivity : ComponentActivity() {
    private lateinit var model: ZenViewModel
    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted && ::model.isInitialized && model.repository.state.value.userId != null) model.action {
            com.zenworkspace.app.notifications.PushNotifications.register(this@MainActivity, model.repository)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        com.zenworkspace.app.notifications.PushNotifications.prepareNativeInstall(this)
        model = ViewModelProvider(this)[ZenViewModel::class.java]
        com.zenworkspace.app.notifications.PushNotifications.ensureChannel(this)
        intent?.data?.let { uri -> model.handleCallback(uri); intent.data = null }
        openNotification(intent)
        setContent { ZenWorkspaceApp(model) {
            if (Build.VERSION.SDK_INT >= 33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        } }
    }

    private fun openNotification(intent: Intent?) {
        if (intent?.getStringExtra("open_section") == "reminders") model.requestedSection = "zen_reminders"
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.let { uri -> model.handleCallback(uri); intent.data = null }
        openNotification(intent)
    }
}
