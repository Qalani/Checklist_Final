package com.zenworkspace.app.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.zenworkspace.app.MainActivity
import com.zenworkspace.app.data.NativeAuth
import com.zenworkspace.app.data.NativeRepository
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

object PushNotifications {
    const val CHANNEL_ID = "zen_reminders"
    private const val INSTALL_MARKER = "native-push-identity-v2"
    private val tokenLock = Any()
    private var tokenGeneration = 0L
    private var pendingDeletion: Task<Void>? = null

    /** A wrapper upgrade must not reuse a token registered to its old web session. */
    fun prepareNativeInstall(context: Context) {
        val rotate = synchronized(tokenLock) {
            readInstallMarker(context) != "ready" &&
                (pendingDeletion == null || pendingDeletion?.let { it.isComplete && !it.isSuccessful } == true)
        }
        if (rotate) forgetLocalToken(context)
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Task due dates and Zen reminders"
            }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    fun show(context: Context, title: String, body: String, id: String) {
        ensureChannel(context)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val intent = Intent(context, MainActivity::class.java).putExtra("open_section", "reminders")
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title.ifBlank { "Zen Workspace" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(id, 0, notification)
    }

    /** Firebase configuration is optional for local-only developer builds. */
    fun requestToken(context: Context, onToken: (String) -> Unit) {
        if (!firebaseAvailable(context)) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            storeToken(context, token)
            onToken(token)
        }
    }

    suspend fun register(context: Context, repository: NativeRepository) {
        ensureChannel(context)
        if (!firebaseAvailable(context)) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val (generation, deletion) = synchronized(tokenLock) {
            if (readInstallMarker(context) != "ready" &&
                (pendingDeletion == null || pendingDeletion?.let { it.isComplete && !it.isSuccessful } == true)) {
                startTokenDeletion(context)
            }
            tokenGeneration to pendingDeletion
        }
        if (deletion != null) suspendCancellableCoroutine<Unit> { continuation ->
            deletion.addOnCompleteListener { task ->
                if (!continuation.isActive) return@addOnCompleteListener
                if (task.isSuccessful) continuation.resume(Unit)
                else continuation.resumeWithException(task.exception ?: IllegalStateException("Push identity could not be reset"))
            }
        }
        synchronized(tokenLock) {
            if (generation != tokenGeneration) return
            FirebaseMessaging.getInstance().isAutoInitEnabled = true
        }
        val token = suspendCancellableCoroutine<String> { continuation ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!continuation.isActive) return@addOnCompleteListener
                if (task.isSuccessful) continuation.resume(task.result)
                else continuation.resumeWithException(task.exception ?: IllegalStateException("Push registration unavailable"))
            }
        }
        synchronized(tokenLock) {
            if (generation != tokenGeneration) return
            storeToken(context, token)
        }
        repository.registerPushToken(token)
    }

    /** Immediate local sign-out; Firebase cleanup proceeds without waiting for network. */
    fun forgetLocalToken(context: Context) {
        synchronized(tokenLock) {
            tokenGeneration += 1
            File(context.noBackupFilesDir, INSTALL_MARKER).writeText("pending")
            startTokenDeletion(context)
            File(context.noBackupFilesDir, "native-fcm-token").delete()
        }
        ReminderScheduler.cancelAll(context)
    }

    suspend fun unregister(context: Context, repository: NativeRepository) {
        val token = readToken(context)
        // Deleting the Firebase token also stops delivery when the backend is
        // temporarily unreachable during an offline sign-out.
        try {
            if (token != null) repository.unregisterPushToken(token)
        } finally {
            forgetLocalToken(context)
        }
    }

    internal fun storeToken(context: Context, token: String) {
        File(context.noBackupFilesDir, "native-fcm-token").writeText(token)
    }

    private fun readToken(context: Context): String? = runCatching { File(context.noBackupFilesDir, "native-fcm-token").readText() }.getOrNull()

    private fun readInstallMarker(context: Context): String? = runCatching {
        File(context.noBackupFilesDir, INSTALL_MARKER).readText()
    }.getOrNull()

    /** Caller holds tokenLock. Keep the pending marker until Firebase confirms invalidation. */
    private fun startTokenDeletion(context: Context) {
        val app = context.applicationContext
        if (!firebaseAvailable(app)) return
        val generation = tokenGeneration
        val messaging = FirebaseMessaging.getInstance()
        messaging.isAutoInitEnabled = false
        pendingDeletion = messaging.deleteToken().also { deletion ->
            deletion.addOnSuccessListener {
                synchronized(tokenLock) {
                    if (generation == tokenGeneration) File(app.noBackupFilesDir, INSTALL_MARKER).writeText("ready")
                }
            }
        }
    }

    private fun firebaseAvailable(context: Context) = runCatching {
        FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context) != null
    }.getOrDefault(false)
}

class NativeMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // The foreground registration path associates this refreshed token with
        // the active account. No session credential is copied into this service.
        if (FirebaseMessaging.getInstance().isAutoInitEnabled) PushNotifications.storeToken(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (NativeAuth(this).session == null) return
        val notification = message.notification
        val title = notification?.title ?: message.data["title"] ?: "Zen reminder"
        val body = notification?.body ?: message.data["body"] ?: "Time for your Zen reminder"
        val id = message.data["reminder_id"] ?: message.messageId ?: "cloud-reminder"
        PushNotifications.show(this, title, body, id)
    }
}
