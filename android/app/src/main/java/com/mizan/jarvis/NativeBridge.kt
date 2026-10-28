package com.mizan.jarvis

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.Locale

/**
 * The only door between the JARVIS web app and Android, exposed to JavaScript as window.AndroidJarvis.
 * Deliberately small: microphone/speech, voice output, opening links/apps, saving a file.
 * It cannot read files, contacts, messages, or press buttons in other apps.
 * Events go back to JavaScript through window.__jarvisNative(type, data).
 */
class NativeBridge(private val act: MainActivity, private val web: WebView) : TextToSpeech.OnInitListener {

    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = TextToSpeech(act, this)
    @Volatile private var ttsReady = false
    @Volatile private var chosenVoice: String = "Android default"
    private var recognizer: SpeechRecognizer? = null
    private var pendingListenLang: String? = null
    private var pendingMicRequest = false

    // ---------------- events to JavaScript ----------------
    fun emit(type: String, data: String = "") {
        val js = "window.__jarvisNative && window.__jarvisNative(${JSONObject.quote(type)}, ${JSONObject.quote(data)})"
        main.post { web.evaluateJavascript(js, null) }
    }

    // ---------------- info ----------------
    @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
    @JavascriptInterface fun sttAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(act)
    @JavascriptInterface fun micPermission(): String = act.micState()
    @JavascriptInterface fun voiceName(): String = chosenVoice
    @JavascriptInterface fun openSettings() { main.post { act.openAppSettings() } }

    // ---------------- microphone ----------------
    @JavascriptInterface fun requestMic() {
        main.post {
            if (act.hasMic()) emit("mic-permission", "granted")
            else { pendingMicRequest = true; act.askMic() }
        }
    }

    fun onMicPermission(granted: Boolean) {
        if (pendingMicRequest) { pendingMicRequest = false; emit("mic-permission", if (granted) "granted" else "denied") }
        val lang = pendingListenLang ?: return
        pendingListenLang = null
        if (granted) beginListening(lang) else { emit("stt-error", "not-allowed"); emit("stt-end") }
    }

    @JavascriptInterface fun startListening(lang: String) {
        main.post {
            if (!act.hasMic()) { pendingListenLang = lang; act.askMic(); return@post }
            beginListening(lang)
        }
    }

    @JavascriptInterface fun stopListening() { main.post { stopListeningInternal() } }

    fun stopListeningInternal(notify: Boolean = true) {
        recognizer?.let { r ->
            try { r.cancel() } catch (_: Exception) { }
            try { r.destroy() } catch (_: Exception) { }
            recognizer = null
            if (notify) emit("stt-end")
        }
    }

    private fun beginListening(lang: String) {
        stopListeningInternal(notify = false)   // a new session is starting; don't end it by accident
        tts?.stop()
        if (!SpeechRecognizer.isRecognitionAvailable(act)) { emit("stt-error", "service-not-allowed"); emit("stt-end"); return }
        val r = SpeechRecognizer.createSpeechRecognizer(act)
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { emit("stt-ready") }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(partial: Bundle?) {
                partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { emit("stt-interim", it) }
            }
            override fun onResults(results: Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) emit("stt-final", text) else emit("stt-error", "no-speech")
                finishRecognizer()
            }
            override fun onError(error: Int) {
                emit("stt-error", when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> "network"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
                    SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
                    SpeechRecognizer.ERROR_CLIENT -> "aborted"
                    else -> "error-$error"
                })
                finishRecognizer()
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang.ifBlank { "en-IN" })
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, act.packageName)
        }
        try { r.startListening(intent) } catch (e: Exception) { emit("stt-error", "start-failed"); finishRecognizer() }
    }

    private fun finishRecognizer() {
        val r = recognizer
        main.post {
            if (r != null && recognizer === r) {
                try { r.destroy() } catch (_: Exception) { }
                recognizer = null
                emit("stt-end")
            }
        }
    }

    // ---------------- voice output ----------------
    override fun onInit(status: Int) {
        val engine = tts ?: return
        if (status != TextToSpeech.SUCCESS) { ttsReady = false; return }
        ttsReady = true
        val best = try { pickVoice(engine.voices ?: emptySet()) } catch (_: Exception) { null }
        if (best != null) { engine.voice = best; chosenVoice = "${best.name} (${best.locale.toLanguageTag()})" }
        else { engine.language = Locale.UK; chosenVoice = "Default (en-GB)" }
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) { emit("tts-start") }
            override fun onDone(id: String?) { emit("tts-end") }
            @Deprecated("Deprecated in Android API") override fun onError(id: String?) { emit("tts-end") }
            override fun onError(id: String?, code: Int) { emit("tts-end") }
            override fun onStop(id: String?, interrupted: Boolean) { emit("tts-end") }
        })
    }

    /** Closest free match to a calm British "JARVIS" style: British English, male, installed on the phone. */
    private fun pickVoice(voices: Set<Voice>): Voice? {
        val male = Regex("-x-(rjs|gbd|gbb)-|male", RegexOption.IGNORE_CASE)
        fun score(v: Voice): Int {
            var s = 0
            val tag = v.locale.toLanguageTag()
            if (tag.equals("en-GB", true)) s += 50 else if (tag.equals("en-IN", true)) s += 20 else if (v.locale.language == "en") s += 10
            if (male.containsMatchIn(v.name) && !v.name.contains("female", true)) s += 30
            if (!v.isNetworkConnectionRequired) s += 5
            if (v.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true) s -= 100
            return s
        }
        return voices.filter { it.locale.language == "en" }.maxByOrNull { score(it) }
    }

    @JavascriptInterface fun speak(text: String, rate: Float, pitch: Float) {
        main.post {
            val engine = tts
            if (engine == null || !ttsReady) { emit("tts-end"); return@post }
            engine.setSpeechRate(rate.coerceIn(0.5f, 2f))
            engine.setPitch(pitch.coerceIn(0.5f, 2f))
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jarvis-${System.currentTimeMillis()}")
        }
    }

    @JavascriptInterface fun stopSpeaking() { main.post { tts?.stop() } }

    // ---------------- apps & files ----------------
    @JavascriptInterface fun openExternal(url: String): Boolean {
        if (url.length > 8000) return false
        main.post { act.openExternal(url) }
        return true
    }

    @JavascriptInterface fun saveFile(name: String, mime: String, text: String): Boolean {
        val safeName = name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80)
        main.post { act.saveFile(safeName, mime, text) }
        return true
    }

    fun destroy() {
        stopListeningInternal()
        tts?.stop(); tts?.shutdown(); tts = null
    }
}
