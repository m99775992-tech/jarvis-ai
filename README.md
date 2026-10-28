# JARVIS AI — Mizan Technology

**Android app:** https://github.com/m99775992-tech/jarvis-ai/releases/latest (download the .apk on your phone; see docs/ANDROID.md)

**Live web app:** https://m99775992-tech.github.io/jarvis-ai/ (open in Chrome on Android, then ⋮ → Add to Home screen)

**Just A Rather Very Intelligent System.** Owner: Kaleem Sundke · Version 0.1.0 (Phase 1 foundation + parts of Phases 2–4).

JARVIS is an installable phone web app (PWA). It runs entirely on your Android phone in Chrome, costs ₹0, needs no laptop, no API key and no paid subscription, and keeps working offline after the first load.

## What it does today
- Talks to you as **"Sir"** (changeable in System → Personalization), text or voice.
- Plans your days: "What do I have to do today?", "What's on tomorrow?", "Show my tasks this week", "Brief me".
- Adds tasks from plain English: "Remind me to submit the accounts project tomorrow at 5 pm", "I have to study economics on Friday urgent".
- Reminder alerts while JARVIS is open, plus one-tap "Add to Google Calendar" for real phone alarms.
- Memory you control ("Remember that my exams start on 15 November"), with edit / delete / off switch. Passwords, PINs, OTPs and card numbers are refused.
- Opens apps and prepares messages: "Open Instagram", "Open WhatsApp and text Ali to reach college early" (WhatsApp opens with the text typed; **you tap Send**).
- Privacy modes (Normal / Private / Public / Meeting), manual silent switch, activity log.
- Backups: plain or AES-256 encrypted, verified on creation, integrity-checked restore, undo restore.

See `docs/PROJECT_STATUS.md` for the exact implemented / tested / planned list.

## Folder layout
```
jarvis/
├── app/                 ← the deployable app (open index.html via a web host)
│   ├── index.html       UI shell + strict Content-Security-Policy
│   ├── css/style.css    design system (dark command-center + light theme)
│   ├── js/app.js        UI controller
│   ├── js/engine.js     central orchestrator ("brain"), local, deterministic
│   ├── js/parser.js     intent recognition
│   ├── js/dates.js      today / tomorrow / weekday / time parsing
│   ├── js/permissions.js approval tokens — code-enforced permission gate
│   ├── js/store.js      local storage + schema validation
│   ├── js/backup.js     backup, encryption, verification, staged restore
│   ├── js/apps.js       Android intent / WhatsApp / SMS / calendar links
│   ├── js/voice.js      speech-to-text and text-to-speech
│   ├── sw.js            offline cache
│   └── manifest.webmanifest, icons/
├── tests/               automated tests (node --test) + browser QA scripts
└── docs/                architecture, security, privacy, backup, testing, setup, roadmap
```
