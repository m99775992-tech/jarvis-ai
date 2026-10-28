# ROADMAP

| Phase | Scope | State |
|---|---|---|
| 1 Foundation | Interface, Sir, text, tasks, persistence, settings, privacy, docs | **Done (v0.1.0)** |
| 2 Core assistant | Intent engine, permission checks, history, memory, errors | **Mostly done**; next: multi-step plans, task dependencies, recurring tasks |
| 3 Voice | STT, TTS, controls, privacy-aware speech | **Built, needs phone test** |
| 4 Security & recovery | App lock (fingerprint/PIN), encrypted storage at rest, security events | Backup done; lock next |
| 5 AI providers | Provider layer, opt-in Claude/other via private free Cloudflare Worker, ask-before-send, usage meter, spending cap | Planned |
| 6 Research & productivity | Study planner, exam countdowns, daily briefing schedule, document notes | Planned |
| 7 Android integration | Native companion app (free Android Studio alternative needed: cloud build via GitHub Actions) for Accessibility auto-send, call screening, notification reading | Planned — needs native app |
| 8 Business & project factory | Mizan Technology clients, proposals, revenue/expense tracker, project workspaces | Planned |
| 9 Testing & hardening | Accessibility audit, device matrix, security tests | Ongoing |
| 10 Release | Permanent hosting, user guide, release checklist | Planned |

## Honest limits (by design)
- "No usage limit": local features have none. Cloud AI always has provider limits and costs; JARVIS will show them, never hide them.
- "Only my voice": not reliable in any free system; JARVIS will use phone fingerprint/PIN for sensitive actions instead.
- "End-to-end encrypted": nothing leaves the phone today; backups can be AES-256 encrypted. Future sync will be encrypted on the phone before upload.

## Phase 2 — Android app (started 29 Oct 2026)
1. [built, awaiting phone test] Android app shell with native voice, direct app launching, backup save/restore.
2. Background reminders: real Android alarms and notifications even when JARVIS is closed.
3. "Hey JARVIS" wake word (on-device, only while you switch it on).
4. Accessibility-based actions: press Send in WhatsApp after your approval; answer calls (ANSWER_PHONE_CALLS).
5. Optional AI brain — only with your explicit approval of a provider; free tiers have daily limits.
