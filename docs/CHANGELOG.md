# CHANGELOG

## 0.1.2 — 29 Oct 2026
- "Mic test" button/command: shows how JARVIS was opened, speech support, permission state, then listens once and repeats what it heard. Every outcome ends with a short code (MIC-OK, MIC-BLOCKED, MIC-INAPP, MIC-SPEECH-SERVICE, MIC-SILENT, MIC-NETWORK, MIC-NONE, MIC-FRAMED).
- Mic button now asks Chrome for the microphone directly before listening, which shows the real Allow prompt reliably on Android.
- Detects in-app browsers (opened from a WhatsApp/Instagram link) and explains how to open in Chrome.
- Separate fix steps for Chrome-blocked vs Google speech-service problems.
- 19 unit tests.

## 0.1.1 — 29 Oct 2026
- "Open <app>" now launches the app immediately instead of showing a button.
- WhatsApp messages go straight into the WhatsApp app (Android intent, wa.me fallback); the Authorize dialog opens by itself, so it is one tap, then Send in WhatsApp.
- New phrasings understood: "Open WhatsApp and text to reach at college early" (no recipient: pick chat), "text Rahul on WhatsApp I am coming", "message Mom on WhatsApp that I am late".
- Microphone-blocked message now explains the preview limitation and gives exact Chrome/Android steps.
- 18 unit tests, 27 browser flow checks.

## 0.1.0 — 29 Oct 2026
- First working foundation: HUD interface, "Sir" personalization, local command engine.
- Tasks with today/tomorrow/week/overdue views, natural-language dates and times, priorities.
- Reminder alerts (while open), Google Calendar hand-off.
- Memory with secret refusal; contacts; activity log.
- Voice input/output (Web Speech API) with consent dialog and privacy filter.
- Privacy modes and manual silent switch.
- Code-enforced approval tokens for risky actions.
- Backup/restore with AES-GCM encryption, integrity check, staged restore and undo.
- Offline support (service worker), installable on Android.
- 17 unit tests, 24 browser flow checks.
