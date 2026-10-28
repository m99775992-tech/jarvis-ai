package com.mizan.jarvis

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader

/**
 * JARVIS Android shell: shows the same JARVIS web app (packaged inside the APK, works offline)
 * and gives it real Android abilities through [NativeBridge]: microphone + speech recognition,
 * Android voice output, launching apps directly, and saving backup files.
 */
class MainActivity : Activity() {

    companion object {
        const val REQ_MIC = 101
        const val REQ_OPEN_FILE = 102
        const val REQ_SAVE_FILE = 103
        const val HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$HOST/assets/www/index.html"
    }

    lateinit var web: WebView
    private lateinit var bridge: NativeBridge
    private lateinit var assetLoader: WebViewAssetLoader

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSaveText: String? = null
    private var pendingWebPermission: PermissionRequest? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true          // JARVIS data lives in app-private storage on this phone
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false           // only the packaged app is loaded, via https asset loader
            allowContentAccess = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(false)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == HOST) return false   // our own packaged pages
                openExternal(url.toString())        // everything else goes to the right Android app
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val wantsAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (!wantsAudio || request.origin.host != HOST) { request.deny(); return@runOnUiThread }
                    if (hasMic()) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    else { pendingWebPermission = request; askMic() }
                }
            }

            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"   // backups are .json; some file managers mislabel them, so allow all
                }
                return try { startActivityForResult(intent, REQ_OPEN_FILE); true }
                catch (e: ActivityNotFoundException) { fileCallback = null; false }
            }
        }

        bridge = NativeBridge(this, web)
        web.addJavascriptInterface(bridge, "AndroidJarvis")

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(START_URL)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // ---------------- microphone permission ----------------
    fun hasMic(): Boolean =
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun askMic() {
        if (hasMic()) { onMicResult(true); return }
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
    }

    /** "denied" only when Android will no longer show the prompt (user chose Don't allow twice). */
    fun micState(): String = when {
        hasMic() -> "granted"
        getSharedPreferences("jarvis", MODE_PRIVATE).getBoolean("micAsked", false) &&
            !shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) -> "denied"
        else -> "prompt"
    }

    private fun onMicResult(granted: Boolean) {
        pendingWebPermission?.let {
            if (granted) it.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else it.deny()
        }
        pendingWebPermission = null
        bridge.onMicPermission(granted)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_MIC) {
            getSharedPreferences("jarvis", MODE_PRIVATE).edit().putBoolean("micAsked", true).apply()
            onMicResult(grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
        }
    }

    fun openAppSettings() {
        try {
            startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", packageName, null)))
        } catch (_: Exception) { }
    }

    // ---------------- opening other apps ----------------
    /** Opens intent:, whatsapp:, tel:, sms:, https: links in the right app. Returns true if something opened. */
    fun openExternal(url: String): Boolean {
        try {
            if (url.startsWith("intent:")) {
                val parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                parsed.component = null      // never let a link target a specific internal component
                parsed.selector = null
                val pkg = parsed.`package`
                // "Open <app>": use Android's launcher entry for that package.
                if (parsed.action == Intent.ACTION_MAIN && pkg != null) {
                    val launch = packageManager.getLaunchIntentForPackage(pkg)
                    if (launch != null) { startActivity(launch); return true }
                    return openFallback(parsed)
                }
                return try {
                    parsed.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(parsed); true
                } catch (e: ActivityNotFoundException) { openFallback(parsed) }
            }
            val uri = Uri.parse(url)
            val intent = when (uri.scheme) {
                "tel" -> Intent(Intent.ACTION_DIAL, uri)              // dialer only; you press call
                "sms", "smsto" -> Intent(Intent.ACTION_SENDTO, uri)
                else -> Intent(Intent.ACTION_VIEW, uri)
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            return true
        } catch (e: Exception) {
            toast("No app on this phone can open that.")
            return false
        }
    }

    private fun openFallback(parsed: Intent): Boolean {
        val fb = parsed.getStringExtra("browser_fallback_url")
        if (fb != null && (fb.startsWith("https://") || fb.startsWith("http://"))) {
            return try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fb))); true }
            catch (_: Exception) { toast("That app is not installed."); false }
        }
        toast("That app is not installed.")
        return false
    }

    // ---------------- saving backups ----------------
    fun saveFile(name: String, mime: String, text: String) {
        pendingSaveText = text
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime
            putExtra(Intent.EXTRA_TITLE, name)
        }
        try { startActivityForResult(intent, REQ_SAVE_FILE) }
        catch (e: ActivityNotFoundException) { pendingSaveText = null; bridge.emit("save-result", "failed") }
    }

    @Deprecated("Uses the platform API available on all supported Android versions")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_OPEN_FILE -> {
                val uri = if (resultCode == RESULT_OK) data?.data else null
                fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
                fileCallback = null
            }
            REQ_SAVE_FILE -> {
                val uri = if (resultCode == RESULT_OK) data?.data else null
                val text = pendingSaveText
                pendingSaveText = null
                if (uri == null || text == null) { bridge.emit("save-result", "cancelled"); return }
                try {
                    contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
                        ?: throw IllegalStateException("no stream")
                    bridge.emit("save-result", "saved")
                    toast("Backup saved.")
                } catch (e: Exception) {
                    bridge.emit("save-result", "failed")
                    toast("Could not save the backup file.")
                }
            }
        }
    }

    fun toast(msg: String) = runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }

    @Deprecated("Back handling for all supported Android versions")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onPause() {
        super.onPause()
        bridge.stopListeningInternal()   // the mic never stays on when JARVIS is not on screen
    }

    override fun onDestroy() {
        bridge.destroy()
        web.destroy()
        super.onDestroy()
    }
}
