import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../app/js/parser.js';
import { parseWhen } from '../app/js/dates.js';
import { createEngine, speakable, notificationText, tasksFor } from '../app/js/engine.js';
import { defaultState, normalize, load, save, STORAGE_KEY, PRE_RESTORE_KEY } from '../app/js/store.js';
import { createBackup, verifyBackup, applyRestore } from '../app/js/backup.js';
import { check, issueApproval } from '../app/js/permissions.js';
import { findApp, appIntentUrl, whatsappUrl, safeWebUrl, calendarUrl } from '../app/js/apps.js';

const NOW = new Date(2026, 9, 29, 10, 0); // Thu 29 Oct 2026, 10:00
class Mem { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
function engine() { const state = defaultState(); let commits = 0; const e = createEngine({ getState: () => state, commit: () => commits++ }); return { state, e, commits: () => commits }; }

// ---------- dates ----------
test('dates: today / tomorrow / weekday / time', () => {
  assert.deepEqual(parseWhen('call CA tomorrow at 5pm', NOW), { date: '2026-10-30', time: '17:00', rest: 'call CA' });
  assert.equal(parseWhen('day after tomorrow test', NOW).date, '2026-10-31');
  assert.equal(parseWhen('meeting on monday', NOW).date, '2026-11-02');
  assert.equal(parseWhen('exam on 15 nov', NOW).date, '2026-11-15');
  assert.equal(parseWhen('fees on 5 jan', NOW).date, '2027-01-05');
  assert.equal(parseWhen('at 9am study', NOW).date, '2026-10-30'); // 9am already passed today
  assert.equal(parseWhen('at 11:30 call', NOW).time, '11:30');
  assert.equal(parseWhen('in 30 minutes stretch', NOW).time, '10:30');
});

// ---------- parser ----------
test('parser: core intents', () => {
  assert.equal(parse('what do I have to do today', NOW).intent, 'task_list');
  assert.equal(parse("what's on tomorrow", NOW).scope, 'tomorrow');
  assert.equal(parse('show my tasks this week', NOW).scope, 'week');
  const w = parse('Jarvis, open WhatsApp and text Ali to reach at college early', NOW);
  assert.deepEqual([w.intent, w.contact, w.text], ['message', 'Ali', 'Reach at college early']);
  assert.equal(parse('open instagram', NOW).app, 'instagram');
  assert.equal(parse('open google.com', NOW).intent, 'open_url');
  assert.equal(parse('switch to meeting mode', NOW).mode, 'meeting');
  assert.equal(parse('remember my upi pin is 1234', NOW).secret, true);
  assert.equal(parse('what is the meaning of life', NOW).intent, 'unknown');
  assert.equal(parse('', NOW).intent, 'empty');
});

// ---------- engine ----------
test('engine: addresses user as Sir and adds/list/completes tasks', () => {
  const { state, e } = engine();
  assert.match(e.handle('hello', { now: NOW }).reply, /Good morning, Sir/);
  e.handle('remind me to call the electrician tomorrow at 5pm', { now: NOW });
  e.handle('I have to study economics chapter 4 today', { now: NOW });
  assert.equal(state.tasks.length, 2);
  const today = e.handle('what do I have to do today', { now: NOW });
  assert.match(today.reply, /Sir, you have 1 task today/);
  const tm = e.handle('tasks tomorrow', { now: NOW });
  assert.equal(tm.list.length, 1);
  const done = e.handle('mark economics done', { now: NOW });
  assert.match(done.reply, /Marked complete/);
  assert.equal(tasksFor(state, 'today', NOW).length, 0);
});

test('engine: honorific preference is respected', () => {
  const { state, e } = engine();
  state.settings.honorific = 'Boss';
  assert.match(e.handle('thanks', { now: NOW }).reply, /Boss/);
});

test('engine: never stores secrets in tasks or memory', () => {
  const { state, e } = engine();
  e.handle('remember my password is hunter22', { now: NOW });
  e.handle('add task my card number 4111 1111 1111 1111', { now: NOW });
  assert.equal(state.memory.length, 0);
  assert.equal(state.tasks.length, 0);
});

test('engine: consequential actions are only proposed, never executed', () => {
  const { state, e } = engine();
  e.handle('add task pay electricity bill today', { now: NOW });
  const del = e.handle('delete task electricity', { now: NOW });
  assert.equal(del.cards[0].type, 'task_delete');
  assert.equal(state.tasks.length, 1, 'task must still exist until approval');
  const msg = e.handle('open whatsapp and text Ali to reach college early', { now: NOW });
  assert.equal(msg.cards[0].type, 'message');
  assert.match(msg.cards[0].href, /^intent:\/\/send\?text=Reach%20college%20early#Intent;scheme=whatsapp;package=com\.whatsapp;/);
  assert.match(decodeURIComponent(msg.cards[0].href), /browser_fallback_url=https:\/\/wa\.me\/\?text=Reach%20college%20early;end$/);
});

test('engine: unknown requests are not faked', () => {
  const { e } = engine();
  const r = e.handle('write me an essay about GST', { now: NOW });
  assert.match(r.reply, /no AI provider is connected/);
  assert.equal(r.cards[0].type, 'search');
});

// ---------- privacy ----------
test('privacy: meeting mode silences, public mode generic', () => {
  const s = defaultState().settings;
  const out = { speak: 'Sir, you have 2 tasks: X, Y', sensitive: true };
  assert.equal(speakable(out, { ...s, privacyMode: 'meeting' }), null);
  assert.equal(speakable(out, { ...s, silentMode: true }), null);
  assert.equal(speakable(out, { ...s, voiceOut: false }), null);
  assert.doesNotMatch(speakable(out, { ...s, privacyMode: 'public' }), /X/);
  assert.equal(speakable(out, s), out.speak);
  assert.doesNotMatch(notificationText({ title: 'Doctor' }, { ...s, privacyMode: 'public' }).body, /Doctor/);
});

// ---------- permissions ----------
test('permissions: confirm-level actions require a matching single-use token', () => {
  const a = { id: 'a1', type: 'task_delete' };
  assert.equal(check(a).allowed, false);
  assert.equal(check(a, 'forged').allowed, false);
  const wrong = issueApproval('other');
  assert.equal(check(a, wrong).allowed, false);
  const t = issueApproval('a1');
  assert.equal(check(a, t).allowed, true);
  assert.equal(check(a, t).allowed, false, 'token is single-use');
  assert.equal(check({ id: 'x', type: 'ai_request' }, issueApproval('x')).allowed, false, 'external AI blocked');
  assert.equal(check({ id: 'x', type: 'not_a_type' }).allowed, false, 'unknown types blocked');
  assert.equal(check({ id: 'x', type: 'open_app' }).allowed, true);
});

// ---------- store ----------
test('store: persists across restarts and survives corruption', () => {
  const mem = new Mem();
  const { state, e } = (() => { const s = defaultState(); return { state: s, e: createEngine({ getState: () => s, commit: () => save(mem, s) }) }; })();
  e.handle('add task revise accounts tomorrow', { now: NOW });
  const reloaded = load(mem);
  assert.equal(reloaded.fresh, false);
  assert.equal(reloaded.state.tasks[0].title, 'Revise accounts');
  mem.setItem(STORAGE_KEY, '{broken json');
  const r = load(mem);
  assert.equal(r.recovered, true);
  assert.ok([...mem.m.keys()].some((k) => k.includes('.corrupt.')), 'corrupt copy kept');
});

test('store: normalize strips unknown fields and blocks enabling external AI', () => {
  const n = normalize({ settings: { claudeEnabled: true, evil: 1, honorific: '<b>Sir</b>' }, tasks: [{ title: 'x', date: 'bad', priority: 'nope', extra: '<script>' }], hacker: true });
  assert.equal(n.settings.claudeEnabled, false);
  assert.equal(n.settings.evil, undefined);
  assert.equal(n.hacker, undefined);
  assert.equal(n.tasks[0].date, null);
  assert.equal(n.tasks[0].priority, 'normal');
  assert.equal(n.tasks[0].extra, undefined);
  assert.throws(() => normalize([]));
  assert.throws(() => normalize({ schema: 99 }));
});

// ---------- backup ----------
test('backup: plain backup round-trips exactly', async () => {
  const s = defaultState();
  s.tasks.push({ id: 't1', title: 'Exam prep', date: '2026-11-01', time: '09:00', priority: 'high', status: 'pending', reminder: true, notified: false, createdAt: NOW.toISOString(), doneAt: null, source: 'text' });
  s.memory.push({ id: 'm1', text: 'Exams start 15 Nov', source: 'text', createdAt: NOW.toISOString(), updatedAt: null });
  const b = await createBackup(s);
  const v = await verifyBackup(JSON.stringify(b));
  assert.equal(v.ok, true);
  assert.deepEqual(v.data.tasks, normalize(s).tasks);
  assert.deepEqual(v.data.memory, normalize(s).memory);
});

test('backup: encrypted backup needs correct passphrase; ciphertext hides content', async () => {
  const s = defaultState(); s.memory.push({ id: 'm1', text: 'Secret plan Alpha', source: 'text', createdAt: NOW.toISOString() });
  const b = await createBackup(s, 'correct horse battery');
  const text = JSON.stringify(b);
  assert.doesNotMatch(text, /Secret plan Alpha/);
  assert.equal((await verifyBackup(text)).needsPassphrase, true);
  assert.equal((await verifyBackup(text, 'wrong passphrase')).ok, false);
  const ok = await verifyBackup(text, 'correct horse battery');
  assert.equal(ok.ok, true);
  assert.equal(ok.data.memory[0].text, 'Secret plan Alpha');
  await assert.rejects(createBackup(s, 'short'));
});

test('backup: tampered, invalid and foreign files are rejected', async () => {
  const s = defaultState(); s.tasks.push({ title: 'Original', date: '2026-11-01' });
  const b = await createBackup(s);
  const tampered = structuredClone(b); tampered.payload.tasks[0].title = 'Hacked';
  assert.match((await verifyBackup(JSON.stringify(tampered))).error, /Integrity check failed/);
  assert.equal((await verifyBackup('not json')).ok, false);
  assert.equal((await verifyBackup('{"format":"other"}')).ok, false);
  assert.equal((await verifyBackup(JSON.stringify({ ...b, version: 99 }))).ok, false);
  assert.equal((await verifyBackup('x'.repeat(6 * 1024 * 1024))).ok, false);
  const enc = await createBackup(s, 'passphrase123');
  const t2 = structuredClone(enc); t2.payload.ciphertext = t2.payload.ciphertext.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await verifyBackup(JSON.stringify(t2), 'passphrase123')).ok, false);
});

test('restore: staged restore keeps pre-restore snapshot and rolls back on failure', () => {
  const mem = new Mem();
  const cur = defaultState(); cur.tasks.push({ title: 'Keep me' }); save(mem, normalize(cur));
  const next = normalize({ tasks: [{ title: 'Restored' }] });
  const r = applyRestore(mem, { STORAGE_KEY, PRE_RESTORE_KEY }, cur, next);
  assert.equal(r.ok, true);
  assert.match(mem.getItem(PRE_RESTORE_KEY), /Keep me/);
  assert.match(mem.getItem(STORAGE_KEY), /Restored/);
  // failure path: storage that rejects writes of new data
  const bad = new Mem(); save(bad, normalize(cur));
  const orig = bad.setItem.bind(bad);
  bad.setItem = (k, v) => { if (k === STORAGE_KEY && /Restored/.test(v)) throw new Error('Quota exceeded'); orig(k, v); };
  const r2 = applyRestore(bad, { STORAGE_KEY, PRE_RESTORE_KEY }, cur, next);
  assert.equal(r2.ok, false);
  assert.match(bad.getItem(STORAGE_KEY), /Keep me/, 'existing data preserved');
});

test('backup: contains no secret-like fields', async () => {
  const b = await createBackup(defaultState());
  assert.doesNotMatch(JSON.stringify(b), /apiKey|api_key|password|token|secret/i);
});

// ---------- android links ----------
test('apps: intent links, whatsapp and URL safety', () => {
  assert.match(appIntentUrl(findApp('instagram')), /package=com\.instagram\.android/);
  assert.equal(findApp('insta').name, 'Instagram');
  assert.match(whatsappUrl('9876543210', 'Hi Sir'), /^intent:\/\/send\?phone=919876543210&text=Hi%20Sir#Intent;scheme=whatsapp;package=com\.whatsapp;/);
  assert.equal(safeWebUrl('javascript:alert(1)'), null);
  assert.equal(safeWebUrl('example.com'), 'https://example.com/');
  assert.match(calendarUrl({ title: 'Test', date: '2026-10-30', time: '17:00' }), /dates=20261030T170000%2F20261030T180000/);
});

test('parser: WhatsApp phrasings from Sir', () => {
  const cases = [
    ['Open Whatsapp And Text To reach at college early', '', 'Reach at college early'],
    ['open whatsapp and send message I will be late', '', 'I will be late'],
    ['text Rahul on whatsapp I am coming', 'Rahul', 'I am coming'],
    ['message Mom on whatsapp that I am late', 'Mom', 'I am late'],
    ['send a whatsapp message saying hello', '', 'Hello'],
  ];
  for (const [input, contact, text] of cases) {
    const r = parse(input);
    assert.equal(r.intent, 'message', input);
    assert.equal(r.contact, contact, input);
    assert.equal(r.text, text, input);
  }
  assert.equal(parse('open whatsapp').intent, 'open_app');
});

test('voice: mic test phrases and in-app browser detection', async () => {
  for (const s of ['Mic test', 'test the microphone', 'check mic', 'can you hear me']) assert.equal(parse(s).intent, 'mic_test', s);
  const { inAppBrowser } = await import('../app/js/voice.js');
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), false);
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14; SM-A146B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36'), true);
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Instagram 300.0'), true);
});
