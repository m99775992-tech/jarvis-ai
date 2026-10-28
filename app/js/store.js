// Local persistence + schema validation. Everything lives on this device (browser storage).
// normalize() is the single gatekeeper for any data entering the app (load + restore).

export const SCHEMA = 1;
export const STORAGE_KEY = 'jarvis.state.v1';
export const PRE_RESTORE_KEY = 'jarvis.state.v1.pre-restore';
const MAX_TASKS = 2000, MAX_MEMORY = 1000, MAX_AUDIT = 500, MAX_CONTACTS = 300;

export function uid() {
  const a = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') || String(Date.now() + Math.random());
}

export function defaultSettings() {
  return {
    honorific: 'Sir',
    theme: 'dark',
    voiceOut: true,
    voiceInConsent: false,
    voiceURI: '',
    rate: 1,
    pitch: 0.85,
    volume: 1,
    lang: 'en-IN',
    privacyMode: 'normal',     // normal | private | public | meeting
    silentMode: false,         // manual: browsers cannot read Android ringer mode
    memoryEnabled: true,
    notifications: false,
    backupReminderDays: 7,
    claudeEnabled: false,      // Phase 5. Disabled by default; no key can be stored in this build.
  };
}

export function defaultState() {
  return {
    schema: SCHEMA,
    createdAt: new Date().toISOString(),
    settings: defaultSettings(),
    tasks: [],
    memory: [],
    contacts: [],
    audit: [],
    usage: { localCommands: 0, voiceCommands: 0, externalAIRequests: 0 },
    backups: { last: null, history: [] },
  };
}

const str = (v, max = 300) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max) : '');
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const num = (v, min, max, d) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isIso = (v) => typeof v === 'string' && !isNaN(Date.parse(v));
const id = (v) => (typeof v === 'string' && /^[a-zA-Z0-9._-]{1,40}$/.test(v) ? v : uid());

function normTask(t) {
  if (!t || typeof t !== 'object') return null;
  const title = str(t.title, 200).trim();
  if (!title) return null;
  return {
    id: id(t.id),
    title,
    date: isDate(t.date) ? t.date : null,
    time: isTime(t.time) ? t.time : null,
    priority: oneOf(t.priority, ['high', 'normal', 'low'], 'normal'),
    status: oneOf(t.status, ['pending', 'done'], 'pending'),
    reminder: bool(t.reminder, false),
    notified: bool(t.notified, false),
    createdAt: isIso(t.createdAt) ? t.createdAt : new Date().toISOString(),
    doneAt: isIso(t.doneAt) ? t.doneAt : null,
    source: oneOf(t.source, ['text', 'voice', 'form', 'restore'], 'text'),
  };
}

function normMemory(m) {
  if (!m || typeof m !== 'object') return null;
  const text = str(m.text, 400).trim();
  if (!text) return null;
  return {
    id: id(m.id),
    text,
    source: oneOf(m.source, ['text', 'voice', 'form', 'restore'], 'text'),
    createdAt: isIso(m.createdAt) ? m.createdAt : new Date().toISOString(),
    updatedAt: isIso(m.updatedAt) ? m.updatedAt : null,
  };
}

function normContact(c) {
  if (!c || typeof c !== 'object') return null;
  const name = str(c.name, 60).trim();
  const phone = str(c.phone, 20).replace(/[^\d+]/g, '');
  if (!name || phone.replace(/\D/g, '').length < 7) return null;
  return { id: id(c.id), name, phone };
}

const STATUSES = ['suggested', 'awaiting_approval', 'in_progress', 'completed', 'failed', 'partial', 'cancelled', 'handed_off'];
function normAudit(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    id: id(a.id),
    ts: isIso(a.ts) ? a.ts : new Date().toISOString(),
    action: str(a.action, 60) || 'unknown',
    status: oneOf(a.status, STATUSES, 'completed'),
    detail: str(a.detail, 200),
  };
}

export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Data is not a JARVIS state object.');
  if (typeof raw.schema === 'number' && raw.schema > SCHEMA) throw new Error(`Data was created by a newer JARVIS version (schema ${raw.schema}).`);
  const d = defaultSettings();
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const arr = (v, fn, max) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : []);
  const u = raw.usage && typeof raw.usage === 'object' ? raw.usage : {};
  const b = raw.backups && typeof raw.backups === 'object' ? raw.backups : {};
  return {
    schema: SCHEMA,
    createdAt: isIso(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    settings: {
      honorific: str(s.honorific, 20).trim() || d.honorific,
      theme: oneOf(s.theme, ['dark', 'light'], d.theme),
      voiceOut: bool(s.voiceOut, d.voiceOut),
      voiceInConsent: bool(s.voiceInConsent, d.voiceInConsent),
      voiceURI: str(s.voiceURI, 200),
      rate: num(s.rate, 0.5, 1.6, d.rate),
      pitch: num(s.pitch, 0.5, 1.5, d.pitch),
      volume: num(s.volume, 0, 1, d.volume),
      lang: oneOf(s.lang, ['en-IN', 'en-GB', 'en-US', 'hi-IN'], d.lang),
      privacyMode: oneOf(s.privacyMode, ['normal', 'private', 'public', 'meeting'], d.privacyMode),
      silentMode: bool(s.silentMode, d.silentMode),
      memoryEnabled: bool(s.memoryEnabled, d.memoryEnabled),
      notifications: bool(s.notifications, d.notifications),
      backupReminderDays: num(s.backupReminderDays, 0, 90, d.backupReminderDays),
      claudeEnabled: false, // cannot be enabled by imported data
    },
    tasks: arr(raw.tasks, normTask, MAX_TASKS),
    memory: arr(raw.memory, normMemory, MAX_MEMORY),
    contacts: arr(raw.contacts, normContact, MAX_CONTACTS),
    audit: arr(raw.audit, normAudit, MAX_AUDIT),
    usage: {
      localCommands: num(u.localCommands, 0, 1e9, 0),
      voiceCommands: num(u.voiceCommands, 0, 1e9, 0),
      externalAIRequests: num(u.externalAIRequests, 0, 1e9, 0),
    },
    backups: {
      last: isIso(b.last) ? b.last : null,
      history: Array.isArray(b.history)
        ? b.history.slice(0, 20).filter((h) => h && isIso(h.ts)).map((h) => ({ ts: h.ts, encrypted: !!h.encrypted, bytes: num(h.bytes, 0, 1e9, 0), sha256: str(h.sha256, 64) }))
        : [],
    },
  };
}

export function load(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { state: defaultState(), fresh: true, recovered: false };
    return { state: normalize(JSON.parse(raw)), fresh: false, recovered: false };
  } catch (e) {
    // Corrupted data: keep a copy for manual recovery instead of silently destroying it.
    try { storage.setItem(STORAGE_KEY + '.corrupt.' + Date.now(), storage.getItem(STORAGE_KEY) || ''); } catch {}
    return { state: defaultState(), fresh: true, recovered: true, error: String(e.message || e) };
  }
}

export function save(storage, state) {
  const json = JSON.stringify(state);
  storage.setItem(STORAGE_KEY + '.tmp', json);   // write-then-swap reduces half-written state
  storage.setItem(STORAGE_KEY, json);
  storage.removeItem(STORAGE_KEY + '.tmp');
  return json.length;
}

export function addAudit(state, action, status, detail = '') {
  state.audit.unshift({ id: uid(), ts: new Date().toISOString(), action, status, detail: String(detail).slice(0, 200) });
  if (state.audit.length > MAX_AUDIT) state.audit.length = MAX_AUDIT;
}
