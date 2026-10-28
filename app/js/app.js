// JARVIS UI controller. Wires the engine, permissions, voice, storage, backup and reminders to the DOM.
// Rule: user/untrusted text is only ever inserted with textContent (never innerHTML).
import { load, save, normalize, addAudit, uid, defaultState, STORAGE_KEY, PRE_RESTORE_KEY } from './store.js';
import { createEngine, speakable, notificationText, tasksFor, sortTasks, greetingWord, HELP } from './engine.js';
import { check, issueApproval, needsConfirm, POLICY } from './permissions.js';
import { createBackup, verifyBackup, applyRestore } from './backup.js';
import { calendarUrl } from './apps.js';
import { ymd, addDays, friendlyDate, friendlyTime } from './dates.js';
import * as voice from './voice.js';

export const VERSION = '0.1.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------- state ----------------
const boot = load(localStorage);
let state = boot.state;
let lastBackupBlob = null;
let saveFailed = false;

function commit() {
  try { save(localStorage, state); saveFailed = false; }
  catch (e) { saveFailed = true; toast('Sir, I could not save to storage. Phone storage may be full.'); }
  renderBadges(); renderStrip();
  if (currentView === 'tasks') renderTasks();
  if (currentView === 'memory') renderMemory();
  if (currentView === 'log') renderLog();
  if (currentView === 'system') renderSystem();
}

const engine = createEngine({ getState: () => state, commit });

// ---------------- helpers ----------------
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M4 10h16M9 3v4m6-4v4" stroke="currentColor" stroke-width="1.8"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>',
};
function iconBtn(name, label, onclick, cls = '') {
  const b = el('button', { class: `icon-btn ${cls}`, type: 'button', 'aria-label': label, title: label, onclick });
  b.innerHTML = ICON[name]; // static trusted markup only
  return b;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
const sir = () => state.settings.honorific || 'Sir';
const nowHM = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function fmtTs(iso) { const d = new Date(iso); return `${friendlyDate(ymd(d))} ${friendlyTime(nowHM(d))}`; }

// ---------------- theme ----------------
function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  $('meta[name="theme-color"]').setAttribute('content', state.settings.theme === 'dark' ? '#05080a' : '#eef3f1');
}

// ---------------- assistant state + waveform ----------------
const STATE_SUB = { idle: 'Standing by', listening: 'Listening — speak now', processing: 'Processing', speaking: 'Speaking' };
let vState = 'idle';
function setVState(s, sub) {
  vState = s;
  document.body.dataset.state = s;
  $('#state-label').textContent = s.toUpperCase();
  $('#state-sub').textContent = sub || STATE_SUB[s];
  $('#stop').hidden = !(s === 'listening' || s === 'speaking');
  const mic = $('#mic');
  mic.setAttribute('aria-pressed', String(s === 'listening'));
  mic.setAttribute('aria-label', s === 'listening' ? 'Stop listening' : 'Start voice command');
  const chip = $('#chip-mic');
  chip.classList.toggle('live', s === 'listening');
  chip.querySelector('b').textContent = s === 'listening' ? 'MIC LIVE' : 'MIC OFF';
}

const wave = (() => {
  const c = $('#wave'); const ctx = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0, raf = 0, amp = 0.15;
  function size() { const r = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); c.width = r.width * dpr; c.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function col(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function draw() {
    const w = c.clientWidth, h = c.clientHeight, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.33;
    ctx.clearRect(0, 0, w, h);
    const em = col('--emerald'), cy2 = col('--cyan'), gold = col('--gold'), danger = col('--danger'), line = col('--line-strong');
    const main = { idle: em, listening: danger, processing: cy2, speaking: gold }[vState];
    const target = { idle: 0.12, listening: 0.75, processing: 0.35, speaking: 0.6 }[vState];
    amp += (target - amp) * 0.08;
    // outer rings
    ctx.lineWidth = 1; ctx.strokeStyle = line;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.42, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // rotating arcs
    ctx.lineWidth = 2; ctx.strokeStyle = main; ctx.globalAlpha = 0.85;
    const rot = t * (vState === 'processing' ? 0.06 : 0.012);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * 1.42, rot + i * 2.09, rot + i * 2.09 + 0.55); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // radial bars (sound wave)
    const bars = 72;
    for (let i = 0; i < bars; i++) {
      const a = (i / bars) * Math.PI * 2;
      const n = Math.sin(i * 0.9 + t * 0.11) * 0.5 + Math.sin(i * 0.37 - t * 0.07) * 0.35 + Math.sin(i * 2.1 + t * 0.19) * 0.15;
      const len = R * (0.06 + amp * 0.32 * (0.55 + 0.45 * n));
      const r1 = R * 1.02, r2 = r1 + Math.max(2, len);
      ctx.strokeStyle = i % 2 ? main : cy2; ctx.globalAlpha = 0.45 + 0.5 * amp;
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // core
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    g.addColorStop(0, main + '33'); g.addColorStop(0.7, main + '10'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = main; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 0.05);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    t++;
  }
  function loop() { draw(); raf = requestAnimationFrame(loop); }
  function start() { cancelAnimationFrame(raf); size(); if (reduce) draw(); else loop(); }
  addEventListener('resize', size);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  return { start, redraw: draw };
})();

// ---------------- conversation ----------------
function addUserMsg(text, source) {
  const m = el('div', { class: 'msg user' }, el('span', { class: 'who' }, 'YOU', source === 'voice' ? el('span', { class: 'src', text: '· voice' }) : null), el('div', { text }));
  $('#convo').append(m); scrollDown();
}

function taskListEl(ids, numbered = true) {
  const ul = el('ul', { class: 'tasklist' });
  ids.forEach((id, i) => {
    const t = state.tasks.find((x) => x.id === id); if (!t) return;
    const li = el('li', { class: t.status === 'done' ? 'done' : '' });
    const cb = el('button', { class: 'check', type: 'button', 'aria-label': `Mark ${t.title} done`, onclick: () => toggleTask(t.id, li) });
    cb.innerHTML = ICON.check;
    li.append(cb, numbered ? el('span', { class: 'num', text: String(i + 1) }) : null, el('span', { class: 't-title' }, el('span', { class: `pri ${t.priority}` }), t.title), el('span', { class: 'when', text: [t.date ? friendlyDate(t.date) : '', t.time ? friendlyTime(t.time) : ''].filter(Boolean).join(' · ') }));
    ul.append(li);
  });
  return ul;
}

function cardEl(card) {
  const status = el('span', { class: `status ${card.status}`, text: card.status.replace('_', ' ') });
  const btn = el('button', { class: 'btn small primary', type: 'button', text: card.cta || 'Run' });
  const node = el('div', { class: 'card' }, el('div', { class: 'card-title' }, card.title, status), el('div', { class: 'card-detail', text: card.detail || '' }), btn);
  const setStatus = (s) => { card.status = s; status.className = `status ${s}`; status.textContent = s.replace('_', ' '); };
  if (needsConfirm(card.type)) setStatus('awaiting_approval');
  btn.addEventListener('click', async () => {
    const res = await runAction(card);
    setStatus(res);
    if (['completed', 'handed_off', 'cancelled', 'failed'].includes(res) && res !== 'cancelled') btn.disabled = res !== 'handed_off';
    if (res === 'handed_off') btn.textContent = 'Open again';
  });
  return node;
}

function addJarvisMsg(out) {
  const body = el('div', { text: out.reply });
  const m = el('div', { class: 'msg jarvis' }, el('span', { class: 'who', text: 'JARVIS' }), body);
  if (out.help) m.append(el('div', { class: 'help-grid' }, out.help.map(([k, v]) => el('div', {}, el('b', { text: k }), v))));
  if (out.list && out.list.length && out.intent !== 'task_add') m.append(taskListEl(out.list));
  if (out.memories) m.append(el('ul', {}, out.memories.map((x) => el('li', { text: x }))));
  (out.cards || []).forEach((c) => m.append(cardEl(c)));
  $('#convo').append(m); scrollDown();
  return m;
}
function scrollDown() { requestAnimationFrame(() => { const main = $('#main'); main.scrollTop = main.scrollHeight; }); }

function say(out) {
  const text = speakable(out, state.settings);
  if (!text || !voice.ttsSupported) { setVState('idle'); return; }
  let started = false;
  // Watchdog: some phones have no TTS engine/voice installed and never fire events.
  const guard = setTimeout(() => { if (!started && vState === 'processing') setVState('idle', 'Voice unavailable — text only'); }, 2500);
  voice.speak(text, state.settings, {
    onStart: () => { started = true; clearTimeout(guard); setVState('speaking'); },
    onEnd: () => { clearTimeout(guard); if (vState === 'speaking' || vState === 'processing') setVState('idle'); },
  });
}

function submit(text, source = 'text') {
  text = String(text || '').trim();
  if (!text) return;
  voice.stopSpeaking();
  addUserMsg(text, source);
  setVState('processing');
  let out;
  try { out = engine.handle(text, { source }); }
  catch (e) {
    console.error(e);
    addAudit(state, 'command', 'failed', 'internal error'); commit();
    out = { reply: `${sir()}, I encountered an internal error and did not complete that request. Nothing was changed. Details: ${e.message}`, cards: [], speak: `${sir()}, I encountered an error.` };
  }
  addJarvisMsg(out);
  if (out.stop) { stopAll(); return; }
  if (out.navigate === 'system:backup') { setTimeout(() => { show('system'); $('#backup').scrollIntoView({ behavior: 'smooth' }); }, 400); }
  applyTheme(); renderChips();
  setTimeout(() => say(out), 120);
}

function stopAll() {
  voice.stopListening(); voice.stopSpeaking(); setVState('idle', 'Stopped');
}

// ---------------- actions (permission-gated) ----------------
function confirmDialog(card) {
  return new Promise((resolve) => {
    const d = $('#confirm');
    const pol = POLICY[card.type] || { label: card.type, risk: 'high', level: 'strong' };
    $('#cf-badge').textContent = pol.risk === 'high' ? 'HIGH-RISK · AUTHORIZATION REQUIRED' : 'AUTHORIZATION REQUIRED';
    $('#cf-badge').className = 'cf-badge' + (pol.risk === 'high' ? ' high' : '');
    $('#cf-title').textContent = `${sir()}, authorize: ${pol.label}?`;
    const dl = $('#cf-details'); dl.replaceChildren();
    const row = (k, v) => dl.append(el('dt', { text: k }), el('dd', { text: v }));
    const extra = $('#cf-extra'); extra.replaceChildren();
    let textarea = null, typed = null;
    switch (card.type) {
      case 'message': {
        row('What will happen', `${card.payload.channel === 'sms' ? 'Messages' : 'WhatsApp'} opens with this text typed. You still tap Send yourself — JARVIS cannot press Send.`);
        row('Recipient', card.payload.known ? card.payload.contact : `${card.payload.contact} (not saved — you will pick the chat)`);
        textarea = el('textarea', { maxlength: '1000', 'aria-label': 'Message text' }); textarea.value = card.payload.text;
        extra.append(el('label', { class: 'field' }, el('span', { text: 'Message (you can edit it)' }), textarea));
        row('Data shared', 'Only the message text and number are passed to Android. Nothing goes to any AI service.');
        break;
      }
      case 'call': row('What will happen', 'Your phone dialer opens with the number. You press Call.'); row('Recipient', card.payload.contact); break;
      case 'task_delete': row('What will happen', 'This task is permanently removed from this phone.'); row('Task', card.detail); break;
      case 'task_delete_all': row('What will happen', 'All pending tasks are permanently removed.'); row('Scope', card.detail); break;
      case 'memory_forget': row('What will happen', 'These memories are permanently deleted.'); row('Memories', card.detail); break;
      case 'contact_delete': row('What will happen', 'This contact is removed from JARVIS (not from your phone).'); row('Contact', card.detail); break;
      case 'audit_clear': row('What will happen', 'The activity log on this phone is cleared.'); break;
      case 'restore': row('What will happen', 'Your current JARVIS data is replaced by the backup. A safety copy of current data is kept so you can undo.'); row('Backup', card.detail); break;
      case 'revert_restore': row('What will happen', 'JARVIS returns to the data it had just before the last restore.'); break;
      case 'erase_all': row('What will happen', 'Every task, memory, contact, log entry and setting on this phone is deleted. This cannot be undone without a backup.'); break;
      default: row('Action', card.detail || card.title);
    }
    if (pol.level === 'strong') {
      typed = el('input', { 'aria-label': 'Type DELETE to confirm', placeholder: 'Type DELETE to confirm', autocapitalize: 'characters' });
      extra.append(el('label', { class: 'field' }, el('span', { text: 'Strong confirmation' }), typed));
    }
    const ok = $('#cf-ok');
    ok.disabled = !!typed;
    if (typed) typed.oninput = () => { ok.disabled = typed.value.trim().toUpperCase() !== 'DELETE'; };
    d.onclose = () => {
      if (d.returnValue === 'ok' && (!typed || typed.value.trim().toUpperCase() === 'DELETE')) {
        if (textarea) { card.payload.text = textarea.value.trim(); }
        resolve(issueApproval(card.id)); // the ONLY place approvals are created
      } else resolve(null);
    };
    d.returnValue = '';
    d.showModal();
  });
}

POLICY.contact_delete = { level: 'confirm', risk: 'medium', label: 'Delete contact' };
POLICY.revert_restore = { level: 'confirm', risk: 'high', label: 'Undo last restore' };

function openHref(href, external) {
  if (/^https?:/i.test(href) && external) {
    const w = window.open(href, '_blank', 'noopener,noreferrer');
    if (!w) location.href = href;
  } else {
    location.href = href; // intent:, tel:, sms:, wa.me hand-offs
  }
}

/** Returns the resulting status string. */
async function runAction(card) {
  let tokenStr = null;
  if (needsConfirm(card.type)) {
    tokenStr = await confirmDialog(card);
    if (!tokenStr) { addAudit(state, card.type, 'cancelled', 'user declined'); commit(); toast('Cancelled. Nothing was done.'); return 'cancelled'; }
  }
  const verdict = check(card, tokenStr);
  if (!verdict.allowed) { addAudit(state, card.type, 'failed', verdict.reason); commit(); toast(verdict.reason); return 'failed'; }
  try {
    switch (card.type) {
      case 'open_app': openHref(card.href); addAudit(state, 'open_app', 'handed_off', card.payload?.app); commit(); return 'handed_off';
      case 'open_url': case 'search': case 'calendar': openHref(card.href, true); addAudit(state, card.type, 'handed_off'); commit(); return 'handed_off';
      case 'message': {
        const { channel, text } = card.payload;
        const base = card.href.split(channel === 'sms' ? '?body=' : '?text=')[0];
        const href = `${base}${channel === 'sms' ? '?body=' : '?text='}${encodeURIComponent(text)}`;
        openHref(href);
        addAudit(state, 'message', 'handed_off', `${channel} opened; user must tap Send`); commit();
        toast(`${channel === 'sms' ? 'Messages' : 'WhatsApp'} opened, ${sir()}. Tap Send to deliver.`);
        return 'handed_off';
      }
      case 'call': openHref(card.href); addAudit(state, 'call', 'handed_off', 'dialer opened'); commit(); return 'handed_off';
      case 'task_delete': {
        const before = state.tasks.length;
        state.tasks = state.tasks.filter((t) => t.id !== card.payload.taskId);
        const ok = state.tasks.length < before;
        addAudit(state, 'task_delete', ok ? 'completed' : 'failed', ok ? '' : 'task not found'); commit();
        toast(ok ? 'Task deleted.' : 'That task no longer exists.');
        return ok ? 'completed' : 'failed';
      }
      case 'task_delete_all': state.tasks = state.tasks.filter((t) => t.status !== 'pending'); addAudit(state, 'task_delete_all', 'completed'); commit(); toast('All pending tasks deleted.'); return 'completed';
      case 'memory_forget': state.memory = state.memory.filter((m) => !card.payload.ids.includes(m.id)); addAudit(state, 'memory_forget', 'completed', `${card.payload.ids.length} removed`); commit(); toast('Memory deleted.'); return 'completed';
      case 'contact_delete': state.contacts = state.contacts.filter((c) => c.id !== card.payload.id); addAudit(state, 'contact_delete', 'completed'); commit(); return 'completed';
      case 'audit_clear': state.audit = []; addAudit(state, 'audit_clear', 'completed'); commit(); toast('Activity log cleared.'); return 'completed';
      case 'restore': return doRestore(card.payload.data, card.payload.createdAt);
      case 'revert_restore': return doRevert();
      case 'erase_all': {
        for (const k of Object.keys(localStorage)) if (k.startsWith('jarvis.')) localStorage.removeItem(k);
        state = defaultState(); addAudit(state, 'erase_all', 'completed'); commit();
        applyTheme(); renderAll(); $('#convo').replaceChildren(); greet(); toast('All JARVIS data erased.');
        return 'completed';
      }
      default: throw new Error('No executor for ' + card.type);
    }
  } catch (e) {
    addAudit(state, card.type, 'failed', e.message); commit(); toast(`${sir()}, that failed: ${e.message}`); return 'failed';
  }
}

function ask(type, title, detail, payload = {}) { return runAction({ id: uid(), type, title, detail, payload, status: 'awaiting_approval' }); }

// ---------------- tasks ----------------
function toggleTask(id, li) {
  const t = state.tasks.find((x) => x.id === id); if (!t) return;
  t.status = t.status === 'done' ? 'pending' : 'done';
  t.doneAt = t.status === 'done' ? new Date().toISOString() : null;
  if (t.status === 'pending') t.notified = false;
  addAudit(state, t.status === 'done' ? 'task_complete' : 'task_reopen', 'completed', t.title.slice(0, 60));
  li?.classList.toggle('done', t.status === 'done');
  commit();
}

function taskRow(t) {
  const li = el('li', { class: t.status === 'done' ? 'done' : '' });
  const cb = el('button', { class: 'check', type: 'button', 'aria-label': (t.status === 'done' ? 'Reopen ' : 'Complete ') + t.title, onclick: () => toggleTask(t.id, li) });
  cb.innerHTML = ICON.check;
  const meta = [t.date ? friendlyDate(t.date) : 'No date', t.time ? friendlyTime(t.time) : null, t.priority !== 'normal' ? t.priority + ' priority' : null, t.time && t.status === 'pending' ? (t.notified ? 'alerted' : 'alert set') : null].filter(Boolean).join(' · ');
  li.append(cb, el('div', { class: 'grow' }, el('span', { class: 't-title' }, el('span', { class: `pri ${t.priority}` }), t.title), el('span', { class: 'meta', text: meta })));
  const acts = el('div', { class: 'acts' });
  if (t.date && t.status === 'pending') acts.append(iconBtn('cal', 'Add to Google Calendar', () => runAction({ id: uid(), type: 'calendar', href: calendarUrl(t), title: 'Calendar' })));
  acts.append(iconBtn('trash', 'Delete task', () => ask('task_delete', 'Delete task', t.title, { taskId: t.id }), 'del'));
  li.append(acts);
  return li;
}

function renderTasks() {
  const now = new Date();
  const groups = [
    ['overdue', 'Overdue', tasksFor(state, 'overdue', now)],
    ['today', 'Today', tasksFor(state, 'today', now)],
    ['tomorrow', 'Tomorrow', tasksFor(state, 'tomorrow', now)],
    ['upcoming', 'Upcoming', tasksFor(state, 'upcoming', now)],
    ['nodate', 'Someday', tasksFor(state, 'nodate', now)],
    ['done', 'Completed', sortTasks(state.tasks.filter((t) => t.status === 'done')).reverse().slice(0, 30)],
  ];
  const wrap = $('#task-sections'); wrap.replaceChildren();
  for (const [key, label, list] of groups) {
    if (!list.length && !['today', 'tomorrow'].includes(key)) continue;
    const sec = el('div', { class: `panel task-section ${key}` }, el('h2', {}, label, el('small', { text: key === 'today' ? now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : String(list.length) })));
    const ul = el('ul', { class: 'list' });
    if (!list.length) ul.append(el('li', { class: 'empty', text: key === 'today' ? `Nothing for today, ${sir()}.` : 'Nothing planned yet.' }));
    list.forEach((t) => ul.append(taskRow(t)));
    sec.append(ul); wrap.append(sec);
  }
  const p = state.tasks.filter((t) => t.status === 'pending').length;
  $('#tasks-summary').textContent = `${p} pending · ${tasksFor(state, 'today', now).length} today · ${tasksFor(state, 'tomorrow', now).length} tomorrow`;
}

$('#tf-when').addEventListener('change', (e) => { $('#tf-date').hidden = e.target.value !== 'pick'; });
$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#tf-title').value.trim(); if (!title) return;
  const w = $('#tf-when').value; const now = new Date();
  const date = w === 'today' ? ymd(now) : w === 'tomorrow' ? ymd(addDays(now, 1)) : w === 'pick' ? ($('#tf-date').value || null) : null;
  const time = $('#tf-time').value || null;
  const t = normalize({ tasks: [{ id: uid(), title, date, time, priority: $('#tf-priority').value, reminder: !!time, source: 'form', createdAt: new Date().toISOString() }] }).tasks[0];
  if (!t) return;
  state.tasks.push(t); addAudit(state, 'task_add', 'completed', t.title.slice(0, 60)); commit();
  $('#tf-title').value = ''; $('#tf-time').value = '';
  toast(`Added, ${sir()}.`);
});

// ---------------- memory & contacts ----------------
function renderMemory() {
  $('#mem-enabled').checked = state.settings.memoryEnabled;
  $('#mem-input').disabled = !state.settings.memoryEnabled;
  const ul = $('#mem-list'); ul.replaceChildren();
  if (!state.memory.length) ul.append(el('li', { class: 'empty', text: 'No memories yet. Say “remember that …” or add one above.' }));
  for (const m of state.memory) {
    const textEl = el('span', { class: 't-title', text: m.text });
    const li = el('li', {}, el('div', { class: 'grow' }, textEl, el('span', { class: 'meta', text: `${m.source} · ${fmtTs(m.updatedAt || m.createdAt)}${m.updatedAt ? ' · edited' : ''}` })),
      el('div', { class: 'acts' },
        iconBtn('edit', 'Edit memory', () => {
          const inp = el('input', { maxlength: '400', 'aria-label': 'Edit memory' }); inp.value = m.text;
          const saveEdit = () => { const v = inp.value.trim(); if (v && v !== m.text) { m.text = v; m.updatedAt = new Date().toISOString(); addAudit(state, 'memory_edit', 'completed'); } commit(); };
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') renderMemory(); });
          inp.addEventListener('blur', saveEdit);
          textEl.replaceWith(inp); inp.focus();
        }),
        iconBtn('trash', 'Delete memory', () => ask('memory_forget', 'Forget memory', m.text, { ids: [m.id] }), 'del')));
    ul.append(li);
  }
  const cl = $('#contact-list'); cl.replaceChildren();
  if (!state.contacts.length) cl.append(el('li', { class: 'empty', text: 'No contacts saved.' }));
  for (const c of state.contacts) {
    cl.append(el('li', {}, el('div', { class: 'grow' }, el('span', { class: 't-title', text: c.name }), el('span', { class: 'meta', text: c.phone })),
      el('div', { class: 'acts' }, iconBtn('trash', 'Delete contact', () => ask('contact_delete', 'Delete contact', c.name, { id: c.id }), 'del'))));
  }
}
$('#mem-enabled').addEventListener('change', (e) => { state.settings.memoryEnabled = e.target.checked; addAudit(state, 'memory_toggle', 'completed', e.target.checked ? 'on' : 'off'); commit(); });
$('#mem-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#mem-input').value.trim(); if (!v) return;
  const out = engine.handle('remember that ' + v, { source: 'form' });
  toast(out.reply.length > 90 ? out.reply.slice(0, 88) + '…' : out.reply);
  $('#mem-input').value = '';
});
$('#contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = normalize({ contacts: [{ id: uid(), name: $('#ct-name').value, phone: $('#ct-phone').value }] }).contacts[0];
  if (!c) { toast('Enter a name and a valid phone number.'); return; }
  state.contacts = state.contacts.filter((x) => x.name.toLowerCase() !== c.name.toLowerCase());
  state.contacts.push(c); addAudit(state, 'contact_add', 'completed'); commit();
  $('#ct-name').value = ''; $('#ct-phone').value = ''; toast(`Contact saved, ${sir()}.`);
});

// ---------------- log ----------------
function renderLog() {
  const ul = $('#log-list'); ul.replaceChildren();
  if (!state.audit.length) ul.append(el('li', { class: 'empty', text: 'No activity yet.' }));
  for (const a of state.audit.slice(0, 200)) {
    ul.append(el('li', {}, el('div', { class: 'grow' }, el('span', {}, a.action.replace(/_/g, ' '), el('span', { class: `status ${a.status}`, text: a.status.replace('_', ' ') })), el('span', { class: 'meta', text: `${fmtTs(a.ts)}${a.detail ? ' · ' + a.detail : ''}` }))));
  }
}
function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return blob;
}
$('#log-export').addEventListener('click', () => { download(`jarvis-activity-${ymd(new Date())}.json`, JSON.stringify(state.audit, null, 2)); addAudit(state, 'audit_export', 'completed'); commit(); });
$('#log-clear').addEventListener('click', () => ask('audit_clear', 'Clear log', ''));

// ---------------- backup & restore ----------------
const stamp = () => { const d = new Date(); return `${ymd(d).replace(/-/g, '')}-${nowHM(d).replace(':', '')}`; };
$('#bk-create').addEventListener('click', async () => {
  const pass = $('#bk-pass').value;
  try {
    const b = await createBackup(state, pass);
    const text = JSON.stringify(b);
    const check2 = await verifyBackup(text, pass); // verify immediately after creating
    if (!check2.ok) throw new Error('Self-check failed: ' + check2.error);
    const name = `jarvis-backup-${stamp()}${b.encrypted ? '-encrypted' : ''}.json`;
    lastBackupBlob = new File([text], name, { type: 'application/json' });
    download(name, text);
    state.backups.last = b.createdAt;
    state.backups.history.unshift({ ts: b.createdAt, encrypted: b.encrypted, bytes: text.length, sha256: b.sha256 });
    state.backups.history = state.backups.history.slice(0, 20);
    addAudit(state, 'backup_create', 'completed', `${b.encrypted ? 'encrypted' : 'plain'} · verified`);
    $('#bk-pass').value = '';
    commit();
    $('#bk-share').hidden = !(navigator.canShare && navigator.canShare({ files: [lastBackupBlob] }));
    toast(`Backup created and verified, ${sir()}. Saved to Downloads.`);
  } catch (e) {
    addAudit(state, 'backup_create', 'failed', e.message); commit();
    toast(`${sir()}, backup failed: ${e.message}`);
  }
});
$('#bk-share').addEventListener('click', async () => {
  if (!lastBackupBlob) return;
  try { await navigator.share({ files: [lastBackupBlob], title: 'JARVIS backup' }); addAudit(state, 'backup_share', 'handed_off', 'user chose destination'); commit(); }
  catch (e) { if (e.name !== 'AbortError') toast('Sharing failed: ' + e.message); }
});
$('#bk-file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('That file is too large to be a JARVIS backup.'); return; }
  const text = await f.text();
  let res = await verifyBackup(text, '');
  if (!res.ok && res.needsPassphrase) {
    const pass = $('#bk-pass').value;
    if (!pass) { toast('Encrypted backup: enter its passphrase in the field above, then choose the file again.'); $('#bk-pass').focus(); return; }
    res = await verifyBackup(text, pass);
  }
  if (!res.ok) { addAudit(state, 'backup_verify', 'failed', res.error.slice(0, 120)); commit(); toast(res.error); return; }
  addAudit(state, 'backup_verify', 'completed'); commit();
  const c = res.counts;
  await ask('restore', 'Restore backup', `${fmtTs(res.createdAt)} · ${c.tasks} tasks, ${c.memory} memories, ${c.contacts} contacts · integrity verified${res.encrypted ? ' · was encrypted' : ''}`, { data: res.data, createdAt: res.createdAt });
  $('#bk-pass').value = '';
});
function doRestore(data, createdAt) {
  const result = applyRestore(localStorage, { STORAGE_KEY, PRE_RESTORE_KEY }, state, data);
  if (!result.ok) { addAudit(state, 'restore', 'failed', result.error.slice(0, 120)); commit(); toast(result.error); return 'failed'; }
  state = load(localStorage).state;
  addAudit(state, 'restore', 'completed', 'from backup ' + (createdAt || '').slice(0, 10)); commit();
  applyTheme(); renderAll(); toast(`Restore complete, ${sir()}. Your previous data is kept for undo.`);
  return 'completed';
}
function doRevert() {
  const prev = localStorage.getItem(PRE_RESTORE_KEY);
  if (!prev) { toast('There is no restore to undo.'); return 'failed'; }
  try {
    const data = normalize(JSON.parse(prev));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.removeItem(PRE_RESTORE_KEY);
    state = load(localStorage).state; addAudit(state, 'restore_undo', 'completed'); commit(); applyTheme(); renderAll();
    toast('Previous data restored.'); return 'completed';
  } catch (e) { toast('Undo failed: ' + e.message); return 'failed'; }
}
$('#bk-revert').addEventListener('click', () => ask('revert_restore', 'Undo restore', ''));
$('#erase-all').addEventListener('click', () => ask('erase_all', 'Erase all', ''));

// ---------------- system ----------------
const PRIVACY_DESC = {
  normal: 'Normal: JARVIS speaks replies and shows full reminder text.',
  private: 'Private: spoken replies on, notification text kept generic.',
  public: 'Public: spoken replies say only “details on screen”; notifications generic.',
  meeting: 'Meeting: JARVIS never speaks; notifications generic.',
};
const CAPS = [
  ['works', 'Text commands, today / tomorrow / week task lists, briefing'],
  ['works', 'Tasks & memory saved on this phone, survive restarts'],
  ['works', 'Backup + passphrase encryption + verified restore + undo'],
  ['works', 'Privacy modes, activity log, approval for risky actions'],
  ['works', 'Offline use after first load (installed app)'],
  ['device', 'Voice commands & spoken replies — depend on your phone’s Chrome and voices'],
  ['device', 'Open apps (Instagram, WhatsApp…) after your tap — untested on your phone yet'],
  ['device', 'WhatsApp / SMS with message pre-typed — you tap Send'],
  ['device', 'Reminder alerts while JARVIS is open; use “Add to Calendar” for guaranteed alarms'],
  ['native', 'Auto-send messages, answer calls, read notifications, always-on wake word'],
  ['native', 'Voice-only lock (speaker recognition) — planned with device authentication'],
  ['planned', 'Claude / other AI providers (opt-in, ask-first), live research summaries'],
  ['planned', 'Business dashboard, client workspaces, software project factory'],
];
const CAP_TAG = { works: ['Works', 'ok-t'], device: ['Test on phone', 'gold-t'], native: ['Needs native app', 'warn-t'], planned: ['Planned', 'muted'] };

async function healthItems() {
  const items = [];
  let storageOk = false;
  try { localStorage.setItem('jarvis.probe', '1'); storageOk = localStorage.getItem('jarvis.probe') === '1'; localStorage.removeItem('jarvis.probe'); } catch {}
  items.push(['Local storage', storageOk && !saveFailed ? ['Writable', 'ok-t'] : ['Not writable', 'bad-t']]);
  let persisted = null; try { persisted = await navigator.storage?.persisted?.(); } catch {}
  items.push(['Protected from cleanup', persisted ? ['Yes', 'ok-t'] : ['Not granted', 'warn-t']]);
  items.push(['Network', navigator.onLine ? ['Online', 'ok-t'] : ['Offline — local features only', 'warn-t']]);
  const sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
  items.push(['Offline cache', sw ? ['Active', 'ok-t'] : ['Not active yet', 'warn-t']]);
  items.push(['Speech recognition', voice.sttSupported ? ['Available', 'ok-t'] : ['Not supported here', 'warn-t']]);
  items.push(['Speech output', voice.ttsSupported ? ['Available', 'ok-t'] : ['Not supported here', 'warn-t']]);
  const np = 'Notification' in window ? Notification.permission : 'unsupported';
  items.push(['Notifications', np === 'granted' ? ['Allowed', 'ok-t'] : np === 'denied' ? ['Blocked in browser', 'bad-t'] : np === 'unsupported' ? ['Unsupported', 'warn-t'] : ['Not enabled', 'muted']]);
  items.push(['Data size', [`${((localStorage.getItem(STORAGE_KEY) || '').length / 1024).toFixed(1)} KB`, 'muted']]);
  return items;
}
function kvList(ul, items) { ul.replaceChildren(...items.map(([k, [v, cls]]) => el('li', {}, el('span', { text: k }), el('span', { class: cls, text: v })))); }

async function renderSystem() {
  const s = state.settings;
  kvList($('#health-list'), await healthItems());
  $$('#privacy-seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === s.privacyMode)));
  $('#privacy-desc').textContent = PRIVACY_DESC[s.privacyMode];
  $('#silent-mode').checked = s.silentMode;
  $('#voice-out').checked = s.voiceOut;
  $('#voice-in').checked = s.voiceInConsent;
  $('#voice-in').disabled = !voice.sttSupported;
  if (!voice.sttSupported) $('#voice-in-desc').textContent = 'Not supported in this browser — use Chrome on Android';
  $('#lang-select').value = s.lang;
  for (const k of ['rate', 'pitch', 'volume']) { $('#' + k).value = s[k]; $(`#${k}-out`).textContent = Number(s[k]).toFixed(2); }
  $('#honorific').value = s.honorific;
  $('#theme').checked = s.theme === 'light';
  $('#notif').checked = s.notifications && 'Notification' in window && Notification.permission === 'granted';
  const last = state.backups.last;
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  kvList($('#backup-status'), [
    ['Last backup', last ? [`${fmtTs(last)}${days ? ` (${days}d ago)` : ''}`, days !== null && days >= s.backupReminderDays ? 'warn-t' : 'ok-t'] : ['Never', 'warn-t']],
    ['Backups made', [String(state.backups.history.length), 'muted']],
    ['Includes', ['Tasks, memory, contacts, log, settings', 'muted']],
    ['Never includes', ['Passwords, keys, tokens (none stored)', 'ok-t']],
    ['Undo available', [localStorage.getItem(PRE_RESTORE_KEY) ? 'Yes' : 'No', 'muted']],
  ]);
  $('#bk-revert').disabled = !localStorage.getItem(PRE_RESTORE_KEY);
  kvList($('#usage-list'), [
    ['Local commands', [String(state.usage.localCommands), 'muted']],
    ['Voice commands', [String(state.usage.voiceCommands), 'muted']],
    ['External AI requests', [String(state.usage.externalAIRequests), 'ok-t']],
    ['Cost so far', ['₹0', 'ok-t']],
  ]);
  kvList($('#security-list'), [
    ['Data location', ['This phone only', 'ok-t']],
    ['Secrets stored', ['None (blocked by design)', 'ok-t']],
    ['Risky actions', ['Require your tap to authorize', 'ok-t']],
    ['External AI', ['Disabled', 'ok-t']],
    ['Script policy', ['CSP: own scripts only', 'ok-t']],
    ['App lock', ['Not yet — Phase 4', 'warn-t']],
    ['Voice-only lock', ['Not available in web app', 'warn-t']],
    ['Backups', ['AES-256 when passphrase set', 'ok-t']],
  ]);
  $('#caps-list').replaceChildren(...CAPS.map(([k, v]) => el('li', {}, el('span', { class: `tag ${CAP_TAG[k][1]}`, text: CAP_TAG[k][0] }), el('span', { text: v }))));
  $('#version').textContent = `JARVIS AI v${VERSION} · Phase 1 foundation · Mizan Technology`;
}

$('#run-diag').addEventListener('click', async () => { await renderSystem(); addAudit(state, 'diagnostics', 'completed'); commit(); toast(`Diagnostics complete, ${sir()}.`); });
$('#privacy-seg').addEventListener('click', (e) => { const m = e.target.closest('button')?.dataset.mode; if (!m) return; state.settings.privacyMode = m; addAudit(state, 'privacy_mode', 'completed', m); commit(); renderChips(); });
$('#silent-mode').addEventListener('change', (e) => { state.settings.silentMode = e.target.checked; if (e.target.checked) voice.stopSpeaking(); commit(); renderChips(); });
$('#voice-out').addEventListener('change', (e) => { state.settings.voiceOut = e.target.checked; if (!e.target.checked) voice.stopSpeaking(); commit(); });
$('#voice-in').addEventListener('change', async (e) => {
  if (e.target.checked) { const ok = await voiceConsent(); e.target.checked = ok; }
  else { state.settings.voiceInConsent = false; voice.stopListening(); addAudit(state, 'voice_input_consent', 'completed', 'revoked'); commit(); }
});
$('#lang-select').addEventListener('change', (e) => { state.settings.lang = e.target.value; commit(); });
for (const k of ['rate', 'pitch', 'volume']) $('#' + k).addEventListener('input', (e) => { state.settings[k] = Number(e.target.value); $(`#${k}-out`).textContent = Number(e.target.value).toFixed(2); clearTimeout(e.target._t); e.target._t = setTimeout(commit, 300); });
$('#voice-select').addEventListener('change', (e) => { state.settings.voiceURI = e.target.value; commit(); });
$('#voice-test').addEventListener('click', () => {
  if (!voice.ttsSupported) { toast('Speech output is not supported in this browser.'); return; }
  voice.speak(`${greetingWord(new Date())}, ${sir()}. All systems are operational.`, state.settings, { onStart: () => setVState('speaking'), onEnd: () => setVState('idle') });
});
$('#honorific').addEventListener('change', (e) => { state.settings.honorific = e.target.value.trim().slice(0, 20) || 'Sir'; addAudit(state, 'honorific_change', 'completed'); commit(); });
$('#theme').addEventListener('change', (e) => { state.settings.theme = e.target.checked ? 'light' : 'dark'; applyTheme(); commit(); });
$('#notif').addEventListener('change', async (e) => {
  if (!e.target.checked) { state.settings.notifications = false; commit(); return; }
  if (!('Notification' in window)) { toast('Notifications are not supported here.'); e.target.checked = false; return; }
  const p = await Notification.requestPermission();
  state.settings.notifications = p === 'granted'; e.target.checked = p === 'granted';
  addAudit(state, 'notifications', p === 'granted' ? 'completed' : 'failed', p); commit();
  if (p !== 'granted') toast('Permission was not granted. You can allow it in Chrome site settings.');
});
$('#notif-test').addEventListener('click', () => notify({ title: 'JARVIS', body: `${sir()}, notifications are working.` }, true));

async function populateVoices() {
  const vs = voice.rankVoices(await voice.loadVoices());
  const sel = $('#voice-select');
  sel.replaceChildren(el('option', { value: '', text: vs.length ? `Auto — ${vs[0].name} (${vs[0].lang})` : 'No voices found on this device' }), ...vs.map((v) => el('option', { value: v.voiceURI, text: `${v.name} · ${v.lang}` })));
  sel.value = state.settings.voiceURI || '';
}

function voiceConsent() {
  return new Promise((resolve) => {
    const d = $('#confirm');
    $('#cf-badge').textContent = 'MICROPHONE PERMISSION'; $('#cf-badge').className = 'cf-badge';
    $('#cf-title').textContent = `${sir()}, enable voice commands?`;
    const dl = $('#cf-details'); dl.replaceChildren();
    const row = (k, v) => dl.append(el('dt', { text: k }), el('dd', { text: v }));
    row('When the mic is on', 'Only while the mic button is red and the MIC LIVE indicator shows. Never in the background.');
    row('Where audio goes', 'Chrome on Android sends your speech to Google’s speech service to turn it into text. JARVIS itself stores only the resulting text command.');
    row('Identity', 'Voice is not used as proof of identity. Risky actions still need your tap.');
    $('#cf-extra').replaceChildren(); $('#cf-ok').disabled = false;
    d.onclose = () => {
      const ok = d.returnValue === 'ok';
      if (ok) { state.settings.voiceInConsent = true; addAudit(state, 'voice_input_consent', 'completed', 'granted'); commit(); }
      resolve(ok);
    };
    d.returnValue = ''; d.showModal();
  });
}

// ---------------- voice input ----------------
async function toggleMic() {
  if (vState === 'listening') { voice.stopListening(); setVState('idle'); return; }
  voice.stopSpeaking(); // barge-in
  if (!voice.sttSupported) { addJarvisMsg({ reply: `${sir()}, speech recognition is not supported in this browser. Please type your command, or open JARVIS in Chrome on Android.`, cards: [] }); return; }
  if (!state.settings.voiceInConsent && !(await voiceConsent())) return;
  const input = $('#composer-input');
  setVState('listening');
  voice.listen({
    lang: state.settings.lang,
    onInterim: (t) => { input.value = t; },
    onFinal: (t) => { input.value = ''; submit(t, 'voice'); },
    onEnd: () => { if (vState === 'listening') setVState('idle'); },
    onError: (err) => {
      setVState('idle');
      const why = { 'not-allowed': 'microphone permission was denied. Allow it in Chrome site settings', 'service-not-allowed': 'microphone permission was denied', 'no-speech': 'I did not hear anything', network: 'speech recognition needs an internet connection', 'audio-capture': 'no microphone was found' }[err];
      if (err !== 'aborted') toast(`${sir()}, ${why || 'voice input failed (' + err + ')'}. You can type instead.`);
    },
  });
}
$('#mic').addEventListener('click', toggleMic);
$('#stop').addEventListener('click', stopAll);
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#composer-input'); const v = i.value; i.value = ''; submit(v, 'text'); });
$('#quick').addEventListener('click', (e) => { const c = e.target.closest('button')?.dataset.cmd; if (c) submit(c, 'text'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (vState === 'listening' || vState === 'speaking')) stopAll(); });

// ---------------- reminders & notifications ----------------
async function notify({ title, body }, test = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') { if (test) toast('Enable notifications first.'); return false; }
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) await reg.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'jarvis-' + Date.now(), silent: state.settings.privacyMode === 'meeting' || state.settings.silentMode });
    else new Notification(title, { body });
    if (test) toast('Test notification sent.');
    return true;
  } catch (e) { if (test) toast('Notification failed: ' + e.message); return false; }
}
let alertTask = null;
function showAlert(t, missed) {
  alertTask = t;
  $('#alert-title').textContent = missed ? 'MISSED WHILE CLOSED' : 'REMINDER';
  $('#alert-body').textContent = state.settings.privacyMode === 'public' || state.settings.privacyMode === 'meeting' ? `${sir()}, you have a reminder. (Open to view)` : `${sir()}, ${t.title}${t.time ? ' — ' + friendlyTime(t.time) : ''}`;
  $('#alert').hidden = false;
  if (state.settings.privacyMode === 'public' || state.settings.privacyMode === 'meeting') $('#alert-body').onclick = () => { $('#alert-body').textContent = `${t.title} — ${friendlyTime(t.time)}`; };
  if (navigator.vibrate && !state.settings.silentMode) try { navigator.vibrate([120, 80, 120]); } catch {}
}
$('#alert-done').addEventListener('click', () => { if (alertTask) toggleTask(alertTask.id); $('#alert').hidden = true; alertTask = null; });
$('#alert-dismiss').addEventListener('click', () => { $('#alert').hidden = true; alertTask = null; });

function checkReminders(startup = false) {
  const now = new Date(); const today = ymd(now); const hm = nowHM(now);
  const due = state.tasks.filter((t) => t.status === 'pending' && t.time && !t.notified && t.date && (t.date < today || (t.date === today && t.time <= hm)));
  if (!due.length) return;
  for (const t of due) {
    t.notified = true;
    const missed = startup || t.date < today;
    addAudit(state, 'reminder', 'completed', missed ? 'missed while closed' : 'alerted');
    if (state.settings.notifications) notify(notificationText(t, state.settings));
  }
  commit();
  const t = due[due.length - 1];
  showAlert(t, startup);
  const out = { speak: `${sir()}, reminder: ${t.title}.`, sensitive: true };
  if (!startup) say(out);
}

// ---------------- chips, strip, badges ----------------
function renderChips() {
  const net = $('#chip-net'); const on = navigator.onLine;
  net.className = 'chip ' + (on ? 'ok' : 'warn'); net.querySelector('b').textContent = on ? 'ONLINE' : 'OFFLINE';
  const mode = $('#chip-mode'); const m = state.settings.privacyMode;
  mode.className = 'chip ' + (m === 'normal' ? 'ok' : 'warn');
  mode.querySelector('b').textContent = (state.settings.silentMode ? 'SILENT · ' : '') + m.toUpperCase();
}
function renderStrip() {
  const now = new Date();
  const today = tasksFor(state, 'today', now), tomorrow = tasksFor(state, 'tomorrow', now), overdue = tasksFor(state, 'overdue', now);
  const next = today.find((t) => t.time && t.time >= nowHM(now));
  const stat = (v, label, cls = '', view) => el('button', { class: `stat ${cls}`, type: 'button', onclick: () => show('tasks') }, el('b', { text: v }), el('span', { text: label }));
  $('#today-strip').replaceChildren(
    stat(String(today.length), 'Today'),
    stat(String(tomorrow.length), 'Tomorrow', 'gold'),
    overdue.length ? stat(String(overdue.length), 'Overdue', 'alert') : stat(next ? friendlyTime(next.time) : '—', next ? 'Next alert' : 'No alerts'),
  );
}
function renderBadges() {
  const n = tasksFor(state, 'today').length + tasksFor(state, 'overdue').length;
  const b = $('#badge-tasks'); b.hidden = !n; b.textContent = String(n);
}

// ---------------- navigation ----------------
let currentView = 'core';
function show(view) {
  currentView = view;
  document.body.dataset.view = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $$('.tabbar button').forEach((b) => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'); });
  $('#main').scrollTop = view === 'core' ? $('#main').scrollHeight : 0;
  if (view === 'tasks') renderTasks();
  if (view === 'memory') renderMemory();
  if (view === 'log') renderLog();
  if (view === 'system') { renderSystem(); populateVoices(); }
  if (view === 'core') wave.start();
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
function renderAll() { renderChips(); renderStrip(); renderBadges(); show(currentView); }

// ---------------- boot ----------------
function greet() {
  const now = new Date();
  const today = tasksFor(state, 'today', now).length, overdue = tasksFor(state, 'overdue', now).length;
  let reply;
  if (boot.fresh && !state.tasks.length && !state.audit.length) {
    reply = `${greetingWord(now)}, ${sir()}. JARVIS is online and running entirely on this phone. Try “Remind me to submit the accounts project tomorrow at 5 pm”, then ask “What’s on tomorrow?”. Say “help” for everything I can do.`;
  } else {
    reply = `${greetingWord(now)}, ${sir()}. ${today ? `You have ${today} task${today > 1 ? 's' : ''} today` : 'Nothing is scheduled today'}${overdue ? ` and ${overdue} overdue` : ''}. How may I help?`;
  }
  addJarvisMsg({ reply, cards: [] });
}

applyTheme();
setVState('idle');
renderAll();
if (boot.recovered) addJarvisMsg({ reply: `${sir()}, your saved data could not be read and may be corrupted. I started fresh and kept a copy of the damaged data. If you have a backup, restore it from System → Backup.`, cards: [] });
greet();
addEventListener('online', renderChips);
addEventListener('offline', renderChips);
checkReminders(true);
setInterval(() => { checkReminders(false); if (currentView === 'core') renderStrip(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(false); renderStrip(); } });

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
try { navigator.storage?.persist?.(); } catch {}
window.__jarvis = { get state() { return state; }, submit, VERSION }; // for QA only; contains no secrets
