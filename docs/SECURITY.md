# SECURITY

JARVIS is designed to be hard to misuse. No software is unhackable; these are the controls in place and their limits.

## Controls implemented (v0.1.0)
- **No secrets stored.** No API keys, tokens or passwords exist in the app. Text that looks like a password/PIN/OTP/card/Aadhaar number is refused for tasks and memory (`looksSecret`).
- **Permission enforcement in code.** The engine only proposes actions. Messages, calls, deletions, restore, log clearing and erase require a single-use, 60-second approval token created only by the confirmation dialog tap (`permissions.js`). Erase-all and delete-all need typing DELETE. External AI is `blocked`.
- **Untrusted input.** All user/imported text is inserted with `textContent`. Imported backups pass `normalize()` (whitelist of fields, type checks, length caps); imported data can never enable external AI.
- **Content-Security-Policy:** scripts only from the app itself; no inline scripts; no plugins; no form posts; no external connections except Google Fonts.
- **URL safety:** only `http(s)` web links open; `javascript:` and other schemes are rejected.
- **Backups:** optional AES-GCM-256 with PBKDF2-SHA256 (250,000 iterations); SHA-256 integrity check; 5 MB limit; version check.
- **Voice is not identity.** Voice commands cannot authorize risky actions.
- **Audit log** records action, status and minimal detail — never message text or secrets.

## Not yet implemented
- App lock (PIN / fingerprint via WebAuthn) — Phase 4.
- Encryption of data at rest in browser storage (Chrome sandboxes it per site; anyone who unlocks the phone and opens JARVIS can see it). Phase 4.
- Dependency scanning: there are **zero** third-party JS dependencies at runtime.

## Security test checklist
| Test | Status |
|---|---|
| Unauthorized action without approval token | Tested — blocked |
| Forged / reused / wrong-action token | Tested — blocked |
| Unknown action type | Tested — blocked |
| HTML/script in task text (XSS) | Tested — rendered as text |
| Tampered backup | Tested — rejected, data unchanged |
| Wrong passphrase / altered ciphertext | Tested — rejected |
| Non-JSON / foreign / oversized / future-version file | Tested — rejected |
| Imported data trying to enable external AI | Tested — forced off |
| Secret leakage into backup | Tested — none |
| Prompt injection | N/A until an AI provider exists; design: tool results never grant permissions |

## Incident response
1. Suspect someone used your phone: System → Activity log, review entries; export it.
2. Make an encrypted backup, then System → Erase all if needed; restore later.
3. If a future API key leaks: revoke it at the provider immediately, then rotate.

## Updates & rollback
Updates = new files deployed to the same address. The service worker uses a versioned cache; to roll back, redeploy the previous version folder. Always back up before updating.

## Android bridge (v0.2.0)
- Only the packaged app (served from https://appassets.androidplatform.net/assets/) runs in the WebView; file access is off; other links leave the app.
- `window.AndroidJarvis` exposes only: speech in/out, mic permission state, open a link/intent, save a file the user chooses. No reading of files, contacts, SMS, notifications.
- Intent links have their component and selector cleared so a link cannot target a hidden internal screen of another app.
- Microphone permission is requested at runtime; the recognizer is stopped whenever JARVIS leaves the screen.
- Release signing key lives only in GitHub repository secrets.
