# ARCHITECTURE

JARVIS is a client-only Progressive Web App. No server, no database, no paid service. Every module is a plain ES module, so it runs in Chrome on Android and can be tested with Node.

```
             ┌────────────── UI (app.js, index.html, style.css) ──────────────┐
 text/voice ─▶ composer / mic ─▶ submit() ─▶ engine.handle() ─▶ reply + proposed actions
             │                                    │                    │
             │                                    ▼                    ▼
             │                         parser.js (intent)     cards ─▶ runAction()
             │                         dates.js  (when)                 │
             │                                    │          permissions.check(token)
             │                         safe local mutations             │ (token only from
             │                         (add/complete task, memory)      │  confirm dialog tap)
             │                                    ▼                    ▼
             │                         store.js (normalize + save)   apps.js hand-off
             │                                    │                 (intent:, wa.me, tel:, sms:)
             │                         backup.js (create/verify/restore)
             │                         voice.js (STT/TTS) · sw.js (offline)
             └────────────────────────────────────────────────────────────────┘
```

## Modules and responsibilities
| Module | Responsibility | May do | May NOT do |
|---|---|---|---|
| `parser.js` | Turn text into an intent + slots | Pure string work | Touch state, DOM, network |
| `engine.js` | Central orchestrator | Low-risk local changes (add/complete task, add memory, settings toggles), propose actions | Execute risky actions, call network |
| `permissions.js` | Policy table + single-use approval tokens | Allow/deny | Be bypassed by engine output |
| `app.js` | UI, confirm dialog, executors | Execute an action only after `check()` passes | Insert untrusted text as HTML |
| `store.js` | Schema, validation (`normalize`), persistence | Read/write `localStorage` | Accept unknown fields; enable external AI from imported data |
| `backup.js` | Backup format, AES-GCM, SHA-256 integrity, staged restore | — | Store the passphrase |
| `apps.js` | Build Android hand-off links | — | Send anything by itself |
| `voice.js` | Web Speech API wrapper | Listen only on user tap | Listen in background |
| `sw.js` | Offline cache of the app shell | Cache own files + fonts | Intercept other sites |

## Action lifecycle
`suggested` → (`awaiting_approval`) → `handed_off` / `completed` / `failed` / `cancelled`. Every step is written to the audit log without message text or secrets.

## Future provider layer (Phase 5)
`providers/` interface: `{ id, available(), estimateCost(), send(request) }`. Requests pass through `permissions` with type `ai_request` (currently `blocked`). A provider key must live on a private server (e.g. a free Cloudflare Worker), never in this frontend.
