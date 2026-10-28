# JARVIS Android app (Phase 2, step 1)

## What it is
A small native Android app (Kotlin, `android/`) that shows the same JARVIS web app (`app/`, packaged inside the APK, works offline) and adds real Android abilities through one narrow bridge, `window.AndroidJarvis` (`NativeBridge.kt`):

| Ability | How |
|---|---|
| Voice input | Android `SpeechRecognizer` (normally Google's speech service; may use internet) |
| Voice output | Android `TextToSpeech`, prefers an installed British-English male voice |
| Open apps / WhatsApp / dialer / SMS | Android intents, launched directly — no extra tap (still asks Authorize for messages and calls) |
| Save backups | Android "Save as" screen (Storage Access Framework) |
| Restore backups | Android file picker |

The bridge cannot read your files, contacts, messages or notifications, and cannot press buttons in other apps. Those need extra permissions and are later steps (see ROADMAP).

## Permissions
- `INTERNET` — Google Fonts and speech recognition.
- `RECORD_AUDIO` — asked the first time you tap the mic. The mic stops whenever JARVIS leaves the screen.

Android cloud backup of app data is disabled (`allowBackup=false`); use JARVIS's own encrypted backup.

## How it is built (no laptop needed)
1. Any push to `master` that changes `app/`, `android/` or the workflow runs `.github/workflows/android.yml` on GitHub's free servers.
2. It runs the core tests, builds a signed release APK, verifies the signature, and publishes it as a GitHub Release `vX.Y.Z`.
3. The version comes from `VERSION` in `app/js/app.js` (versionCode = major*10000 + minor*100 + patch). Bump it for every release so Android accepts the update.

## Signing key
- Stored only as repository secrets `JARVIS_KEYSTORE_B64` and `JARVIS_KEYSTORE_PASSWORD` (alias `jarvis`). Never committed.
- The same key signs every build, so updates install over the old app and keep your data.
- If the secrets are deleted, a new key is needed and the app must be uninstalled and reinstalled (take an encrypted backup first).

## Install on the phone
1. Open https://github.com/m99775992-tech/jarvis-ai/releases/latest in Chrome.
2. Under Assets, tap `JARVIS-X.Y.Z.apk`.
3. When Android warns about unknown apps, allow Chrome to install apps, then tap Install. Play Protect may warn because the app is not from the Play Store; choose to install anyway only if you downloaded it from the link above.
4. Open JARVIS, tap Mic test, and allow the microphone.

## Tested vs not tested
- Tested: Gradle build of the APK (locally and on GitHub), APK contents and permissions, and the JavaScript side of the bridge with a simulated bridge (`tests/browser/native-bridge.mjs`, 11 checks).
- Not tested (needs a real phone): the Kotlin speech recognizer, Android voice, launching WhatsApp/YouTube, the Save-as and file-picker screens.
