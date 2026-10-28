# TESTING

## Automated (run in build environment)
- `npm test` → `node --test tests/` — 17 tests: dates, parser, engine, privacy, permissions, store, backup, restore, Android links. **Result 29 Oct 2026: 17/17 pass.**
- `tests/browser/ui-smoke.mjs` — phone-size UI, persistence after reload, overflow on all 5 views, console errors. **Pass, 0 JS errors.**
- `tests/browser/flows.mjs` — 24 checks: approvals, backup/restore/undo, tampered and wrong-passphrase files, reminder alert, erase-all strong confirm, XSS, offline. **24/24 pass.**
- `tests/browser/theme-voice-watchdog.mjs` — light theme and no stuck "Processing" state without a voice engine. **Pass.**

## Manual phone test checklist (Sir, on your Android phone)
1. Open JARVIS in Chrome → greeting says "Sir". 
2. Type "Remind me to drink water in 2 minutes" → keep JARVIS open → alert appears.
3. "What do I have to do today?" → list shows.
4. Close Chrome fully, reopen → tasks still there.
5. Tap mic → allow microphone → say "What's on tomorrow?".
6. System → Voice → Test voice. Pick the best English (UK) voice.
7. "Open Instagram" → tap Open → Instagram should launch.
8. Save a contact, then "Open WhatsApp and text <name> to reach college early" → Review → Authorize → WhatsApp opens with text typed.
9. Turn on airplane mode → reopen JARVIS → it still works offline.
10. System → Create backup with a passphrase → restore it.
Report anything that fails and JARVIS will be fixed against your real phone's behavior.
