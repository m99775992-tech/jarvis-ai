// Central orchestrator ("brain") — Phase 1/2 local engine.
// input text -> intent (parser) -> plan -> safe local mutation OR proposed action -> reply.
// It never executes consequential actions itself; those are returned as proposals
// that must pass permissions.check() with a user-issued approval token.
import { parse, looksSecret } from './parser.js';
import { ymd, addDays, friendlyDate, friendlyTime, daysBetween } from './dates.js';
import { uid, addAudit } from './store.js';
import { findApp, appIntentUrl, whatsappUrl, smsUrl, telUrl, searchUrl, safeWebUrl, calendarUrl } from './apps.js';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function greetingWord(now) {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function pending(state) { return state.tasks.filter((t) => t.status === 'pending'); }

export function sortTasks(list) {
  const pr = { high: 0, normal: 1, low: 2 };
  return [...list].sort((a, b) =>
    (a.date || '9999').localeCompare(b.date || '9999') ||
    (a.time || '99:99').localeCompare(b.time || '99:99') ||
    pr[a.priority] - pr[b.priority] ||
    a.createdAt.localeCompare(b.createdAt));
}

export function tasksFor(state, scope, now = new Date()) {
  const today = ymd(now);
  const tomorrow = ymd(addDays(now, 1));
  const p = pending(state);
  switch (scope) {
    case 'today': return sortTasks(p.filter((t) => t.date === today));
    case 'tomorrow': return sortTasks(p.filter((t) => t.date === tomorrow));
    case 'overdue': return sortTasks(p.filter((t) => t.date && t.date < today));
    case 'week': return sortTasks(p.filter((t) => t.date && t.date >= today && daysBetween(today, t.date) <= 7));
    case 'upcoming': return sortTasks(p.filter((t) => t.date && t.date > tomorrow));
    case 'nodate': return sortTasks(p.filter((t) => !t.date));
    default: return sortTasks(p);
  }
}

function describe(t, now) {
  const when = [t.date ? friendlyDate(t.date, now) : null, t.time ? friendlyTime(t.time) : null].filter(Boolean).join(' at ');
  return `${t.title}${when ? ' — ' + when : ''}${t.priority === 'high' ? ' (high priority)' : ''}`;
}

function scopeLabel(scope) {
  return { today: 'today', tomorrow: 'tomorrow', overdue: 'overdue', week: 'over the next 7 days', all: 'in total' }[scope] || scope;
}

function matchTasks(state, query, lastList) {
  const q = query.toLowerCase().trim();
  const n = q.match(/^(?:number |no\.? |#)?(\d{1,3})$/);
  if (n && lastList) {
    const t = state.tasks.find((x) => x.id === lastList[Number(n[1]) - 1]);
    return t ? [t] : [];
  }
  const pool = state.tasks.filter((t) => t.status === 'pending');
  const exact = pool.filter((t) => t.title.toLowerCase() === q);
  if (exact.length) return exact;
  const inc = pool.filter((t) => t.title.toLowerCase().includes(q));
  if (inc.length) return inc;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  return pool.filter((t) => words.length && words.every((w) => t.title.toLowerCase().includes(w)));
}

export const HELP = [
  ['Plan your day', '“What do I have to do today?” · “What’s on tomorrow?”'],
  ['Add tasks', '“Remind me to call the CA tomorrow at 5 pm” · “I have to study economics on Friday”'],
  ['Finish tasks', '“Mark economics done” · “Done 2”'],
  ['Briefing', '“Brief me”'],
  ['Messages', '“Open WhatsApp and text Ali to reach college early”'],
  ['Apps & web', '“Open Instagram” · “Search GST registration” · “Play lo-fi on YouTube”'],
  ['Memory', '“Remember that my exams start on 15 November” · “What do you remember?”'],
  ['Privacy', '“Switch to meeting mode” · “Mute”'],
  ['Safety', '“Create backup” · “Stop”'],
];

/**
 * createEngine({ getState, commit }) -> { handle(text, opts) }
 * handle returns { reply, speak, sensitive, cards, list, intent }
 *  - reply: text shown on screen
 *  - speak: what may be spoken (privacy filter is applied later by the UI)
 *  - cards: proposed actions [{ id, type, title, detail, href, payload, cta }]
 */
export function createEngine({ getState, commit }) {
  let lastList = null;

  function handle(text, { source = 'text', now = new Date() } = {}) {
    const state = getState();
    const sir = state.settings.honorific || 'Sir';
    const p = parse(text, now);
    state.usage.localCommands++;
    if (source === 'voice') state.usage.voiceCommands++;
    const out = { intent: p.intent, reply: '', speak: null, sensitive: false, cards: [], list: null };
    const card = (type, title, detail, extra = {}) => { const c = { id: uid(), type, title, detail, status: 'suggested', ...extra }; out.cards.push(c); return c; };

    switch (p.intent) {
      case 'empty': out.reply = `Standing by, ${sir}.`; break;

      case 'greeting': {
        const today = tasksFor(state, 'today', now).length;
        out.reply = `${greetingWord(now)}, ${sir}. ${today ? `You have ${today} task${today > 1 ? 's' : ''} lined up for today.` : 'Your schedule for today is clear.'} How may I help?`;
        break;
      }
      case 'thanks': out.reply = `Always a pleasure, ${sir}.`; break;
      case 'identity':
        out.reply = `I am JARVIS — Just A Rather Very Intelligent System — built for Mizan Technology. At the moment I run entirely on this phone: tasks, reminders, memory, voice and app hand-offs. Deeper reasoning will arrive when an AI provider is connected, and only with your authorization, ${sir}.`;
        break;
      case 'help': out.reply = `Here is what I can do right now, ${sir}.`; out.help = HELP; break;
      case 'time': out.reply = `It is ${friendlyTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)}, ${sir}.`; break;
      case 'date': out.reply = `Today is ${WEEKDAY[now.getDay()]}, ${now.getDate()} ${MONTH[now.getMonth()]} ${now.getFullYear()}, ${sir}.`; break;
      case 'stop': out.reply = `Stopped, ${sir}.`; out.stop = true; break;
      case 'voice_off': state.settings.voiceOut = false; out.reply = `Voice output muted, ${sir}. I will reply on screen only.`; addAudit(state, 'voice_output_off', 'completed'); break;
      case 'voice_on': state.settings.voiceOut = true; out.reply = `Voice output restored, ${sir}.`; out.speak = out.reply; addAudit(state, 'voice_output_on', 'completed'); break;

      case 'privacy_mode': {
        state.settings.privacyMode = p.mode;
        const desc = { normal: 'I will speak normally.', private: 'Notifications will stay generic.', public: 'I will keep spoken replies and notifications generic.', meeting: 'I will stay silent and keep notifications generic.' }[p.mode];
        out.reply = `${p.mode[0].toUpperCase() + p.mode.slice(1)} mode engaged, ${sir}. ${desc}`;
        addAudit(state, 'privacy_mode', 'completed', p.mode);
        break;
      }

      case 'briefing': {
        const today = tasksFor(state, 'today', now), tomorrow = tasksFor(state, 'tomorrow', now), overdue = tasksFor(state, 'overdue', now);
        const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const next = today.find((t) => t.time && t.time >= nowHM);
        const high = today.filter((t) => t.priority === 'high').length;
        const lines = [`${greetingWord(now)}, ${sir}. It is ${WEEKDAY[now.getDay()]}, ${now.getDate()} ${MONTH[now.getMonth()]}.`];
        lines.push(today.length ? `You have ${today.length} task${today.length > 1 ? 's' : ''} today${high ? `, ${high} marked high priority` : ''}.` : 'Nothing is scheduled for today.');
        if (next) lines.push(`Next up: ${next.title} at ${friendlyTime(next.time)}.`);
        if (overdue.length) lines.push(`${overdue.length} item${overdue.length > 1 ? 's are' : ' is'} overdue.`);
        lines.push(tomorrow.length ? `Tomorrow holds ${tomorrow.length} task${tomorrow.length > 1 ? 's' : ''}.` : 'Tomorrow is clear so far.');
        const days = state.backups.last ? daysBetween(state.backups.last.slice(0, 10), ymd(now)) : null;
        if (days === null) lines.push('No backup has been made yet — I recommend one.');
        else if (days >= (state.settings.backupReminderDays || 7)) lines.push(`Your last backup was ${days} days ago.`);
        out.reply = lines.join(' ');
        out.sensitive = true;
        out.list = [...overdue, ...today].map((t) => t.id);
        lastList = out.list.length ? out.list : lastList;
        addAudit(state, 'briefing', 'completed');
        break;
      }

      case 'task_list': {
        const list = p.scope === 'today' ? [...tasksFor(state, 'overdue', now), ...tasksFor(state, 'today', now)] : tasksFor(state, p.scope, now);
        const core = p.scope === 'today' ? tasksFor(state, 'today', now) : list;
        if (!list.length) {
          out.reply = `You have nothing ${p.scope === 'overdue' ? 'overdue' : 'scheduled ' + scopeLabel(p.scope)}, ${sir}. Say “add task …” to plan something.`;
        } else {
          const over = list.length - core.length;
          out.reply = `${sir}, you have ${core.length} task${core.length !== 1 ? 's' : ''} ${scopeLabel(p.scope)}${over ? `, plus ${over} overdue` : ''}:`;
          out.list = list.map((t) => t.id);
          lastList = out.list;
          out.speak = `${out.reply} ${list.slice(0, 6).map((t, i) => `${i + 1}. ${describe(t, now)}`).join('. ')}`;
        }
        out.sensitive = true;
        break;
      }

      case 'task_add': {
        if (!p.title || p.title.length < 2) { out.reply = `What should the task be, ${sir}? For example: “Add task submit the accounts project tomorrow.”`; break; }
        if (looksSecret(p.title)) { out.reply = `${sir}, that looks like it contains a password, PIN or card number. For your safety I will not store it.`; addAudit(state, 'task_add', 'cancelled', 'blocked: possible secret'); break; }
        const task = { id: uid(), title: p.title, date: p.date || ymd(now), time: p.time, priority: p.priority, status: 'pending', reminder: !!(p.reminder || p.time), notified: false, createdAt: new Date().toISOString(), doneAt: null, source };
        state.tasks.push(task);
        addAudit(state, 'task_add', 'completed', task.title.slice(0, 60));
        out.reply = `Added, ${sir}: ${describe(task, now)}.${task.time ? ' I will alert you while JARVIS is open. For a guaranteed alarm, add it to your calendar too.' : ''}`;
        out.sensitive = true;
        out.list = [task.id];
        if (task.time) card('calendar', 'Add to Google Calendar', 'Real phone alarm, even when JARVIS is closed', { href: calendarUrl(task), cta: 'Add' });
        break;
      }

      case 'task_complete': {
        const found = matchTasks(state, p.query, lastList);
        if (!found.length) { out.reply = `I could not find a pending task matching “${p.query}”, ${sir}.`; break; }
        if (found.length > 1) { out.reply = `${found.length} tasks match “${p.query}”, ${sir}. Which one? Tap it below or say “done” followed by its number.`; out.list = found.map((t) => t.id); lastList = out.list; break; }
        const t = found[0];
        t.status = 'done'; t.doneAt = new Date().toISOString();
        addAudit(state, 'task_complete', 'completed', t.title.slice(0, 60));
        const left = tasksFor(state, 'today', now).length;
        out.reply = `Marked complete, ${sir}: ${t.title}. ${left ? `${left} left for today.` : 'That clears today’s list.'}`;
        out.sensitive = true;
        break;
      }

      case 'task_delete': {
        const found = matchTasks(state, p.query, lastList);
        if (!found.length) { out.reply = `No pending task matches “${p.query}”, ${sir}.`; break; }
        if (found.length > 1) { out.reply = `${found.length} tasks match, ${sir}. Please be more specific.`; out.list = found.map((t) => t.id); lastList = out.list; break; }
        card('task_delete', 'Delete task', found[0].title, { payload: { taskId: found[0].id }, cta: 'Review' });
        out.reply = `${sir}, I need your authorization before deleting “${found[0].title}”.`;
        addAudit(state, 'task_delete', 'awaiting_approval', found[0].title.slice(0, 60));
        break;
      }
      case 'task_delete_all': {
        const n = pending(state).length;
        card('task_delete_all', 'Delete all pending tasks', `${n} task(s) will be removed`, { cta: 'Review' });
        out.reply = `${sir}, that would delete ${n} pending task${n !== 1 ? 's' : ''}. This needs strong confirmation.`;
        addAudit(state, 'task_delete_all', 'awaiting_approval');
        break;
      }

      case 'message': {
        const contact = !p.contact ? null : (state.contacts.find((c) => c.name.toLowerCase() === p.contact.toLowerCase())
          || state.contacts.find((c) => c.name.toLowerCase().startsWith(p.contact.toLowerCase())));
        const href = p.channel === 'sms' ? smsUrl(contact?.phone, p.text) : whatsappUrl(contact?.phone, p.text);
        const app = p.channel === 'sms' ? 'Messages' : 'WhatsApp';
        card('message', `${app} → ${contact ? contact.name : (p.contact || 'choose chat')}`, `“${p.text}”`, {
          href, cta: 'Send via ' + app, auto: true,
          payload: { channel: p.channel, contact: contact ? contact.name : p.contact, known: !!contact, phone: contact?.phone || '', text: p.text },
        });
        out.reply = contact
          ? `Message to ${contact.name} is ready, ${sir}. Tap Authorize and ${app} opens with the text typed — you tap Send.`
          : !p.contact
            ? `Message ready, ${sir}. Tap Authorize and ${app} opens with it typed — pick the chat and tap Send.`
            : `Message ready, ${sir}. “${p.contact}” is not in my contacts yet, so ${app} will ask you to pick the chat. Save them under Memory → Contacts and next time it goes straight to their chat.`;
        out.sensitive = true;
        addAudit(state, 'message_prepare', 'awaiting_approval', `${app} → ${contact ? 'saved contact' : 'unsaved contact'}`);
        break;
      }

      case 'call': {
        const contact = !p.contact ? null : (state.contacts.find((c) => c.name.toLowerCase() === p.contact.toLowerCase())
          || state.contacts.find((c) => c.name.toLowerCase().startsWith(p.contact.toLowerCase())));
        const raw = p.contact.replace(/[^\d+]/g, '');
        const phone = contact?.phone || (raw.replace(/\D/g, '').length >= 7 ? raw : null);
        if (!phone) { out.reply = `I do not have a number for ${p.contact}, ${sir}. Save it under Memory → Contacts and ask again.`; break; }
        card('call', `Call ${contact ? contact.name : phone}`, 'Opens your dialer — you press call', { href: telUrl(phone), cta: 'Review', payload: { contact: contact ? contact.name : phone } });
        out.reply = `${sir}, authorize the call and I will open the dialer.`;
        addAudit(state, 'call_prepare', 'awaiting_approval');
        break;
      }

      case 'open_app': {
        const app = findApp(p.app);
        if (!app) {
          card('search', `Search “${p.app}”`, 'Not in my app list yet', { href: searchUrl('google', p.app), cta: 'Search' });
          out.reply = `${sir}, “${p.app}” is not in my app list yet. I can search for it instead.`;
          break;
        }
        card('open_app', `Open ${app.name}`, 'Opening now', { href: appIntentUrl(app), cta: 'Open again', auto: true, payload: { app: app.name } });
        out.reply = `Opening ${app.name}, ${sir}.`;
        addAudit(state, 'open_app', 'suggested', app.name);
        break;
      }

      case 'open_url': {
        const url = safeWebUrl(p.url);
        if (!url) { out.reply = `That address does not look safe or valid, ${sir}.`; break; }
        card('open_url', `Open ${new URL(url).hostname}`, url, { href: url, cta: 'Open' });
        out.reply = `Ready to open ${new URL(url).hostname}, ${sir}.`;
        break;
      }

      case 'search': {
        const eng = { google: 'Google', youtube: 'YouTube', maps: 'Google Maps', wikipedia: 'Wikipedia' }[p.engine] || 'Google';
        card('search', `${eng}: ${p.query}`, 'Opens in your browser', { href: searchUrl(p.engine, p.query), cta: 'Search' });
        out.reply = `Search prepared, ${sir}. Note: this opens ${eng} — I am not reading or summarising results myself yet.`;
        addAudit(state, 'search', 'suggested', eng);
        break;
      }

      case 'memory_add': {
        if (!state.settings.memoryEnabled) { out.reply = `Memory is switched off, ${sir}. You can enable it in Memory.`; break; }
        if (p.secret) { out.reply = `${sir}, that looks like a password, PIN, OTP or card number. I am designed not to store secrets — please keep it in a password manager.`; addAudit(state, 'memory_add', 'cancelled', 'blocked: possible secret'); break; }
        state.memory.unshift({ id: uid(), text: p.text, source, createdAt: new Date().toISOString(), updatedAt: null });
        out.reply = `Noted, ${sir}. I will remember: “${p.text}”. You can edit or delete it in Memory.`;
        out.sensitive = true;
        addAudit(state, 'memory_add', 'completed');
        break;
      }
      case 'memory_list': {
        if (!state.memory.length) { out.reply = `I have no saved memories yet, ${sir}. Say “remember that …” to add one.`; break; }
        out.reply = `${sir}, here is what I remember:`;
        out.memories = state.memory.slice(0, 10).map((m) => m.text);
        out.speak = `${out.reply} ${out.memories.slice(0, 5).join('. ')}`;
        out.sensitive = true;
        break;
      }
      case 'memory_forget': {
        const q = p.query.toLowerCase();
        const found = state.memory.filter((m) => m.text.toLowerCase().includes(q));
        if (!found.length) { out.reply = `I have nothing stored about “${p.query}”, ${sir}.`; break; }
        card('memory_forget', `Forget ${found.length} memor${found.length > 1 ? 'ies' : 'y'}`, found.map((m) => m.text).join(' · ').slice(0, 140), { payload: { ids: found.map((m) => m.id) }, cta: 'Review' });
        out.reply = `${sir}, please authorize deleting ${found.length > 1 ? 'these memories' : 'this memory'}.`;
        out.sensitive = true;
        break;
      }

      case 'backup': out.reply = `Opening backup, ${sir}. Choose plain or passphrase-encrypted.`; out.navigate = 'system:backup'; break;

      default: {
        out.reply = `${sir}, that needs reasoning beyond my local command set, and no AI provider is connected yet — so I will not guess. I can search the web for it, or say “help” to see what I can do.`;
        card('search', `Google: ${p.text.slice(0, 60)}`, 'Opens in your browser', { href: searchUrl('google', p.text), cta: 'Search' });
        addAudit(state, 'unknown_command', 'failed', 'no local handler');
      }
    }

    if (out.speak === null) out.speak = out.reply;
    commit();
    return out;
  }

  return { handle, get lastList() { return lastList; }, set lastList(v) { lastList = v; } };
}

/** Decide what (if anything) may be spoken, based on privacy settings. Pure. */
export function speakable(out, settings) {
  if (!settings.voiceOut || settings.silentMode || settings.privacyMode === 'meeting') return null;
  if (settings.privacyMode === 'public' && out.sensitive) return `${settings.honorific || 'Sir'}, I have put the details on your screen.`;
  return out.speak;
}

/** Notification text respecting privacy modes. Pure. */
export function notificationText(task, settings) {
  if (settings.privacyMode === 'normal') return { title: 'JARVIS · Reminder', body: `${settings.honorific}, it is time: ${task.title}` };
  return { title: 'JARVIS', body: `${settings.honorific}, you have a reminder.` };
}
