# PROJECT STATUS — JARVIS AI v0.1.0

Last updated: 29 Oct 2026. Evidence = automated tests in `tests/` run in the build sandbox (Node 20 + headless Chromium at 375×760 phone size). **Nothing below has been tested on Sir's actual Android phone yet.**

Legend: **Tested** = implemented and verified by automated test · **Built, needs phone test** = implemented, depends on real Android/Chrome behavior · **Not possible as web app** · **Planned**

| Area | Status | Evidence / note |
|---|---|---|
| Responsive JARVIS interface (HUD, waveform, states, tabs) | Tested | Screenshots at 375px + 1280px; no horizontal overflow on any view |
| "Sir" personalization (persists, changeable) | Tested | `engine: addresses user as Sir`, `honorific preference` |
| Text commands, local intent engine | Tested | 17 unit tests + browser flows |
| Today / tomorrow / week / overdue task lists | Tested | parser + engine tests, UI flows |
| Task add / complete / delete (delete needs approval) | Tested | browser flows: cancel keeps task, authorize deletes |
| Local persistence across restarts | Tested | reload test; corruption recovery test |
| Memory: add, list, edit, delete, disable, secret refusal | Tested | engine + UI tests |
| Contacts (local) for WhatsApp/SMS/call | Tested (link building) | `apps:` test |
| Permission gate (single-use approval tokens) | Tested | `permissions:` test |
| Privacy modes + silent switch | Tested (logic) | `privacy:` test |
| Activity log (statuses, export, clear) | Tested | UI flows |
| Backup (plain + AES-GCM encrypted), verify, restore, undo | Tested | 5 unit tests + 10 browser checks incl. tampered/garbage/wrong passphrase |
| Offline use | Tested | page reload with network off, commands still work |
| XSS / injection in task text | Tested | rendered as text, no element created |
| Reminder alert while app open | Tested | due-task alert + mark done |
| Voice commands (speech-to-text) | Built, needs phone test | Uses Chrome's Web Speech API; cannot be tested in sandbox (no mic) |
| JARVIS voice (text-to-speech) | Built, needs phone test | Prefers British male voice if installed; watchdog prevents stuck state |
| Open apps (Instagram, WhatsApp…) | Built, needs phone test | Android intent links; require a tap |
| WhatsApp/SMS with pre-typed message | Built, needs phone test | `wa.me` / `sms:` links; user taps Send |
| System notifications | Built, needs phone test | Requires permission; reliable only while app recently used |
| Add to Google Calendar (real alarms) | Built, needs phone test | Opens calendar with event pre-filled |
| Auto-send messages, answer calls, read notifications, background wake word | Not possible as web app | Needs native Android app (Accessibility / default dialer) |
| Voice-only lock (only Sir's voice) | Not possible reliably | Planned: device lock (fingerprint) for sensitive actions instead |
| App lock (PIN/fingerprint) | Planned — Phase 4 | |
| Claude / other AI providers | Planned — Phase 5 | Disabled; nothing is ever sent to AI |
| Live research summaries | Planned — Phase 6 | Today: opens Google search only |
| Business dashboard, client workspaces, project factory | Planned — Phase 8 | |

## Known limitations
- Reminders cannot fire when JARVIS is fully closed (browser limitation). Use "Add to Google Calendar" for anything important.
- The app cannot read Android's ringer mode; the silent switch is manual.
- Speech recognition on Chrome Android sends audio to Google to convert to text (disclosed before enabling).
- Data lives in Chrome's storage for this site. Clearing Chrome site data erases it — keep backups.
