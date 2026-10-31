package com.zenworkspace.app.data

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.zenworkspace.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class NativeSession(
    val userId: String,
    val email: String,
    val accessToken: String,
    val refreshToken: String,
    /** Unix seconds, matching Supabase's expires_at response. */
    val expiresAt: Long,
)

class AuthException(val status: Int, message: String) : IOException(message)

/** Native Auth REST client. No browser storage or JavaScript is involved. */
class NativeAuth(context: Context) {
    private val base = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val publicKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY.trim()
    private val store = SecretStore(context.applicationContext, base)
    val passwordRecovery: Boolean get() = store.read("recovery") == "true"

    val session: NativeSession?
        get() = synchronized(sessionLock) { store.read("session")?.let { value ->
            runCatching {
                val json = JSONObject(value)
                NativeSession(
                    json.getString("user_id"), json.optString("email"),
                    json.getString("access_token"), json.getString("refresh_token"),
                    json.getLong("expires_at"),
                )
            }.getOrNull()
        } }

    suspend fun signIn(email: String, password: String): NativeSession = authMutex.withLock {
        val epoch = authEpoch.get()
        val result = request("/auth/v1/token?grant_type=password", "POST", JSONObject()
            .put("email", email.trim()).put("password", password))
        parseSession(JSONObject(result)).also { saveSession(it, epoch); store.remove("recovery") }
    }

    /** A null session means email confirmation is required; never fabricate a signed-in user. */
    suspend fun signUp(email: String, password: String): NativeSession? = authMutex.withLock {
        val epoch = authEpoch.get()
        val result = JSONObject(request("/auth/v1/signup", "POST", JSONObject()
            .put("email", email.trim()).put("password", password)))
        checkEpoch(epoch)
        if (result.optString("access_token").isBlank()) null
        else parseSession(result).also { saveSession(it, epoch); store.remove("recovery") }
    }

    /** PKCE email recovery returns to this native app and never embeds tokens in a URL. */
    suspend fun resetPassword(email: String) {
        val (verifier, challenge) = createVerifier()
        synchronized(sessionLock) {
            store.write("pkce", JSONObject().put("verifier", verifier).put("recovery", true)
                .put("created_at", System.currentTimeMillis()).toString())
        }
        request("/auth/v1/recover?redirect_to=${Uri.encode(CALLBACK)}", "POST", JSONObject()
            .put("email", email.trim()).put("code_challenge", challenge).put("code_challenge_method", "s256"))
    }

    suspend fun updatePassword(password: String) {
        require(password.length >= 6) { "Use a password with at least six characters." }
        authorizedRequest("/auth/v1/user", "PUT", JSONObject().put("password", password))
        store.remove("recovery")
    }

    /** No network or auth mutex: logout always removes local access immediately. */
    fun clearLocalSession(): NativeSession? {
        val previous = synchronized(sessionLock) {
            val current = session
            authEpoch.incrementAndGet()
            store.remove("session")
            store.remove("pkce")
            store.remove("recovery")
            current
        }
        // Interrupt old account requests so they cannot delay a subsequent sign-in.
        client.dispatcher.cancelAll()
        return previous
    }

    /** Every cleanup request uses only the captured old session, never the next account's bearer. */
    suspend fun revokeSession(previous: NativeSession, pushToken: String? = null) {
        if (!pushToken.isNullOrBlank()) {
            try {
                request("/rest/v1/push_tokens?user_id=eq.${Uri.encode(previous.userId)}&token=eq.${Uri.encode(pushToken)}", "DELETE", null, previous.accessToken)
            } catch (_: IOException) {
                // Firebase invalidates the device token separately; remote cleanup is best effort.
            }
        }
        try {
            request("/auth/v1/logout?scope=local", "POST", JSONObject(), previous.accessToken)
        } catch (_: IOException) {
            // An expired token or offline connection must not prevent local sign-out.
        }
    }

    suspend fun signOut() {
        val previous = clearLocalSession()
        if (previous != null) {
            revokeSession(previous)
        }
    }

    suspend fun accessToken(): String = refreshToken(force = false)

    /** Requests are bound to the account that started them, including after token refresh. */
    suspend fun authorizedRequest(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        headers: Map<String, String> = emptyMap(),
    ): String {
        val started = session ?: throw AuthException(401, "Please sign in to continue.")
        val epoch = authEpoch.get()
        val token = accessToken()
        checkAccount(started.userId, epoch)
        val result = try {
            request(path, method, body, token, headers)
        } catch (error: AuthException) {
            checkAccount(started.userId, epoch)
            if (error.status != 401) throw error
            val newToken = refreshToken(force = true, rejectedToken = token)
            checkAccount(started.userId, epoch)
            request(path, method, body, newToken, headers)
        }
        checkAccount(started.userId, epoch)
        return result
    }

    fun beginGoogleSignIn(): Uri {
        requireConfiguration()
        val (verifier, challenge) = createVerifier()
        synchronized(sessionLock) {
            store.write("pkce", JSONObject().put("verifier", verifier)
                .put("created_at", System.currentTimeMillis()).toString())
        }
        return Uri.parse("$base/auth/v1/authorize").buildUpon()
            .appendQueryParameter("provider", "google")
            .appendQueryParameter("redirect_to", CALLBACK)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "s256")
            .build()
    }

    suspend fun handleCallback(uri: Uri): NativeSession = authMutex.withLock {
        require(uri.scheme == "com.zenworkspace.app" && uri.host == "auth-callback" &&
            uri.port == -1 && uri.userInfo == null && uri.path.orEmpty() in setOf("", "/") &&
            uri.fragment == null) { "This sign-in link is not supported." }
        val pending = store.read("pkce")?.let(::JSONObject)
            ?: throw AuthException(400, "Start Google sign-in again from this device.")
        val age = System.currentTimeMillis() - pending.optLong("created_at")
        if (age !in 0..3_600_000) {
            store.remove("pkce")
            throw AuthException(400, "That sign-in attempt expired. Please try again.")
        }
        if (!uri.getQueryParameter("error").isNullOrBlank()) {
            store.remove("pkce")
            throw AuthException(400, "Google sign-in was cancelled or could not be completed.")
        }
        val code = uri.getQueryParameter("code")?.takeIf { it.isNotBlank() }
            ?: throw AuthException(400, "The sign-in link has no authorization code.")
        val verifier = pending.getString("verifier")
        require(verifier.length in 43..128) { "Start Google sign-in again." }
        val epoch = authEpoch.get()
        val result = request("/auth/v1/token?grant_type=pkce", "POST", JSONObject()
            .put("auth_code", code).put("code_verifier", verifier))
        parseSession(JSONObject(result)).also {
            synchronized(sessionLock) {
                if (store.read("pkce")?.let(::JSONObject)?.optString("verifier") != verifier) {
                    throw AuthException(409, "A different sign-in attempt started. Please try again.")
                }
                saveSession(it, epoch)
                if (pending.optBoolean("recovery")) store.write("recovery", "true") else store.remove("recovery")
                store.remove("pkce")
            }
        }
    }

    private suspend fun refreshToken(force: Boolean, rejectedToken: String? = null): String = authMutex.withLock {
        val current = session ?: throw AuthException(401, "Please sign in to continue.")
        if ((!force && current.expiresAt > System.currentTimeMillis() / 1000 + 60) ||
            (force && rejectedToken != null && rejectedToken != current.accessToken)) {
            return@withLock current.accessToken
        }
        val epoch = authEpoch.get()
        val response = try {
            request("/auth/v1/token?grant_type=refresh_token", "POST",
                JSONObject().put("refresh_token", current.refreshToken))
        } catch (error: AuthException) {
            if (error.status in setOf(400, 401, 403) && authEpoch.get() == epoch) {
                // Keep the account cache identity for offline work, but require a fresh login for sync.
                throw AuthException(401, "Your session expired. Sign out and sign in again to sync.")
            }
            throw error
        }
        val refreshed = parseSession(JSONObject(response))
        if (refreshed.userId != current.userId) throw AuthException(401, "The account changed. Please sign in again.")
        // A refresh rotates tokens but does not start a new account generation.
        synchronized(sessionLock) {
            checkAccount(current.userId, epoch)
            storeSession(refreshed)
        }
        refreshed.accessToken
    }

    private fun parseSession(json: JSONObject): NativeSession {
        val user = json.optJSONObject("user") ?: throw AuthException(502, "The sign-in response was incomplete.")
        val userId = user.optString("id")
        val access = json.optString("access_token")
        val refresh = json.optString("refresh_token")
        if (userId.isBlank() || access.isBlank() || refresh.isBlank()) {
            throw AuthException(502, "The sign-in response was incomplete.")
        }
        return NativeSession(userId, user.optString("email"), access, refresh,
            json.optLong("expires_at").takeIf { it > 0 }
                ?: (System.currentTimeMillis() / 1000 + json.optLong("expires_in", 3600)))
    }

    private fun saveSession(value: NativeSession, expectedEpoch: Long) = synchronized(sessionLock) {
        checkEpoch(expectedEpoch)
        storeSession(value)
        authEpoch.incrementAndGet()
    }

    private fun storeSession(value: NativeSession) {
        store.write("session", JSONObject().put("user_id", value.userId).put("email", value.email)
            .put("access_token", value.accessToken).put("refresh_token", value.refreshToken)
            .put("expires_at", value.expiresAt).toString())
    }

    private fun checkEpoch(epoch: Long) {
        if (authEpoch.get() != epoch) throw AuthException(409, "The account changed. Please try again.")
    }

    private fun checkAccount(userId: String, epoch: Long) {
        checkEpoch(epoch)
        if (session?.userId != userId) throw AuthException(409, "The account changed. Please try again.")
    }

    private fun requireConfiguration() {
        val uri = Uri.parse(base)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && publicKey.isNotBlank()) {
            "Configure the Supabase URL and publishable key before building this app."
        }
        val legacyRole = publicKey.split('.').takeIf { it.size == 3 }?.get(1)?.let { payload ->
            runCatching {
                JSONObject(Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP)
                    .toString(Charsets.UTF_8)).optString("role")
            }.getOrNull()
        }
        require(!publicKey.startsWith("sb_secret_") && legacyRole != "service_role") {
            "Android builds must use a public Supabase publishable or anon key."
        }
    }

    private suspend fun request(
        path: String,
        method: String,
        body: JSONObject?,
        token: String? = null,
        headers: Map<String, String> = emptyMap(),
    ): String = withContext(Dispatchers.IO) {
        requireConfiguration()
        require(path.startsWith("/") && !path.startsWith("//")) { "Invalid API path." }
        val verb = method.uppercase()
        require(verb in setOf("GET", "POST", "PATCH", "DELETE", "PUT")) { "Invalid API operation." }
        val builder = Request.Builder().url(base + path)
            .header("apikey", publicKey).header("Accept", "application/json")
        if (token != null) builder.header("Authorization", "Bearer $token")
        headers.forEach { (key, value) ->
            require(key.lowercase() !in setOf("authorization", "apikey", "host")) { "Invalid API header." }
            builder.header(key, value)
        }
        val requestBody = if (verb in setOf("POST", "PATCH", "PUT"))
            (body ?: JSONObject()).toString().toRequestBody(JSON) else null
        client.newCall(builder.method(verb, requestBody).build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val error = runCatching { JSONObject(text) }.getOrNull()
                val message = sequenceOf("msg", "message", "error_description", "error")
                    .mapNotNull { key -> error?.optString(key)?.takeIf(String::isNotBlank) }
                    .firstOrNull()?.take(350)
                    ?: "The server could not complete this request (${response.code})."
                throw AuthException(response.code, message)
            }
            text
        }
    }

    companion object {
        const val CALLBACK = "com.zenworkspace.app://auth-callback"
        private val authMutex = Mutex()
        private val sessionLock = Any()
        private val authEpoch = AtomicLong(0)
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS).callTimeout(45, TimeUnit.SECONDS)
            .followRedirects(false).followSslRedirects(false).build()
        private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        private fun createVerifier(): Pair<String, String> {
            val verifier = encode(ByteArray(32).also(SecureRandom()::nextBytes))
            return verifier to encode(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
        }
    }
}

/** AES-GCM keys never leave Android Keystore. Ciphertexts live in no-backup app storage. */
private class SecretStore(context: Context, project: String) {
    private val projectHash = MessageDigest.getInstance("SHA-256")
        .digest(project.toByteArray()).take(12).joinToString("") { "%02x".format(it) }
    private val directory = java.io.File(context.noBackupFilesDir, "auth-$projectHash").apply { mkdirs() }
    private val alias = "zen-native-auth-$projectHash"

    @Synchronized fun write(name: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val payload = JSONObject().put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP)).toString()
        val atomic = android.util.AtomicFile(java.io.File(directory, name))
        var stream: java.io.FileOutputStream? = null
        try {
            stream = atomic.startWrite()
            stream.write(payload.toByteArray(Charsets.UTF_8))
            atomic.finishWrite(stream)
        } catch (error: Exception) {
            stream?.let(atomic::failWrite)
            throw IOException("Unable to store the encrypted sign-in session.", error)
        }
    }

    @Synchronized fun read(name: String): String? {
        val file = android.util.AtomicFile(java.io.File(directory, name))
        if (!file.baseFile.exists()) return null
        return try {
            val json = file.openRead().use { JSONObject(it.readBytes().toString(Charsets.UTF_8)) }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128,
                Base64.decode(json.getString("iv"), Base64.NO_WRAP)))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            cipher.doFinal(Base64.decode(json.getString("ciphertext"), Base64.NO_WRAP)).toString(Charsets.UTF_8)
        } catch (_: Exception) {
            // Reinstall/Keystore invalidation cannot resurrect a plaintext or unverified session.
            file.delete()
            null
        }
    }

    @Synchronized fun remove(name: String) {
        android.util.AtomicFile(java.io.File(directory, name)).delete()
    }

    private fun key(): SecretKey = synchronized(keyLock) {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey) ?: KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }

    companion object { private val keyLock = Any() }
}
