// Intent recognition — deterministic and local. No AI provider is called here.
// parse(text, now) -> { intent, ...slots }
import { parseWhen } from './dates.js';

const SECRET_RE = /\b(password|passcode|pass code|pin|otp|cvv|api key|apikey|secret key|token|aadhaar|aadhar|card number|upi pin)\b/i;

export function looksSecret(text) {
  return SECRET_RE.test(text) || /\b\d{12,19}\b/.test(text.replace(/[\s-]/g, ''));
}

function clean(raw) {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function capitalise(s) {
  s = s.trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function stripLead(t) {
  return t
    .replace(/^(hey |ok |okay )?jarvis[,!.:]?\s*/i, '')
    .replace(/^(please|pls|plz|kindly|can you|could you|would you)\s+/i, '')
    .replace(/^(please|pls|plz)\s+/i, '')
    .replace(/[?!.]+$/, '')
    .trim();
}

function priorityOf(t) {
  if (/\b(urgent|important|asap|high priority)\b|!!/i.test(t)) return 'high';
  if (/\b(low priority|whenever|someday)\b/i.test(t)) return 'low';
  return 'normal';
}

function stripPriority(t) {
  return t.replace(/\b(urgent|important|asap|high priority|low priority|whenever|someday)\b|!+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function taskFrom(body, now, extra = {}) {
  const priority = priorityOf(body);
  const when = parseWhen(stripPriority(body), now);
  const title = capitalise(when.rest.replace(/^(a |an )?(task|todo|to-do|reminder)( to| for| about)?\s+/i, '').replace(/^(that|to)\s+/i, ''));
  return { intent: 'task_add', title, date: when.date, time: when.time, priority, ...extra };
}

export function parse(raw, now = new Date()) {
  const original = clean(raw);
  if (!original) return { intent: 'empty' };
  const t = stripLead(original);
  const l = t.toLowerCase();

  // --- control ---
  if (/^(stop|cancel|abort|quiet|silence|be quiet|shut up|enough|stop talking)$/.test(l)) return { intent: 'stop' };
  if (/^(help|commands|what can you do|what can i say|how do i use you|menu)/.test(l)) return { intent: 'help' };
  if (/^(mute|voice off|stop speaking|disable voice|turn off voice|don'?t speak)/.test(l)) return { intent: 'voice_off' };
  if (/^(unmute|voice on|enable voice|turn on voice|speak to me|talk to me)$/.test(l)) return { intent: 'voice_on' };

  let m;
  if ((m = l.match(/\b(normal|private|public|meeting)\s+mode\b/)) && /^(switch|go|change|set|enable|activate|turn on|use|enter|normal|private|public|meeting)/.test(l)) {
    return { intent: 'privacy_mode', mode: m[1] };
  }

  // --- small talk ---
  if (/^(hi|hello|hey|hii+|yo|namaste|salaam|assalamu alaikum|good (morning|afternoon|evening|night))\b/.test(l) && l.split(' ').length <= 5) {
    return { intent: 'greeting' };
  }
  if (/^(thanks|thank you|thx|ty|great job|well done|good job)\b/.test(l)) return { intent: 'thanks' };
  if (/^(who are you|what are you|what is your name|what'?s your name|introduce yourself)/.test(l)) return { intent: 'identity' };
  if (/\b(what('?s| is) the time|what time is it|time now|current time)\b/.test(l)) return { intent: 'time' };
  if (/\b(what('?s| is) (the |today'?s )?date|what day is (it|today)|today'?s date)\b/.test(l)) return { intent: 'date' };

  // --- briefing ---
  if (/^(brief me|briefing|daily briefing|morning briefing|status report|give me (a |my )?(briefing|update|summary|status)|what'?s up|summary|update me)/.test(l)) {
    return { intent: 'briefing' };
  }

  // --- messaging (WhatsApp / SMS) ---
  const channel = /\b(sms|text message)\b/.test(l) && !/whatsapp/.test(l) ? 'sms' : 'whatsapp';
  m = t.match(/^(?:open (?:whats ?app|wa) (?:and |then )?)?(?:send (?:a )?(?:whats ?app |wa |sms )?(?:message |msg |text )?to|whats ?app|text|message|msg|tell|sms)\s+(.+?)\s+(?:on (?:whats ?app|wa|sms)\s+)?(?:to say|saying|that|to|:|-)\s+(.+)$/i);
  if (m && !/^(me|myself)$/i.test(m[1])) {
    const contact = m[1].replace(/\b(on )?(whats ?app|wa|sms)\b/i, '').trim();
    return { intent: 'message', channel, contact: capitalise(contact), text: capitalise(m[2]) };
  }

  // --- calling ---
  if ((m = t.match(/^(?:call|phone|dial|ring)\s+(.+)$/i))) {
    return { intent: 'call', contact: capitalise(m[1].replace(/\bon (the )?phone\b/i, '').trim()) };
  }

  // --- search ---
  if ((m = t.match(/^(?:search|look up|lookup|find)\s+(youtube|google|maps|wikipedia)\s+for\s+(.+)$/i))) {
    return { intent: 'search', engine: m[1].toLowerCase(), query: m[2] };
  }
  if ((m = t.match(/^(?:search|google|look up|lookup|find)\s+(?:for\s+|about\s+)?(.+?)(?:\s+on\s+(youtube|google|maps|wikipedia))?$/i))) {
    return { intent: 'search', engine: (m[2] || 'google').toLowerCase(), query: m[1] };
  }
  if ((m = t.match(/^play\s+(.+?)(?:\s+on\s+youtube)?$/i))) return { intent: 'search', engine: 'youtube', query: m[1] };

  // --- open app / site ---
  if ((m = t.match(/^(?:open|launch|start|go to|goto|visit)\s+(?:the\s+)?(.+?)(?:\s+app)?$/i))) {
    const target = m[1].trim();
    if (/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(target)) return { intent: 'open_url', url: target };
    return { intent: 'open_app', app: target.toLowerCase() };
  }

  // --- memory ---
  if (/^(what do you (remember|know) about me|what do you remember|show (my )?memor(y|ies)|list (my )?memor(y|ies))/.test(l)) return { intent: 'memory_list' };
  if ((m = t.match(/^(?:remember|note|save|keep in mind)\s+(?:that\s+)?(.+)$/i)) && !/^(to )/i.test(m[1])) {
    return { intent: 'memory_add', text: capitalise(m[1]), secret: looksSecret(m[1]) };
  }
  if ((m = t.match(/^(?:forget|delete memory|remove memory)\s+(?:about\s+|that\s+)?(.+)$/i))) return { intent: 'memory_forget', query: m[1] };

  // --- backup ---
  if (/^(create|make|take|run|start)( a| an)? (backup|back up)|^backup( now)?$|^back up( now)?$/.test(l)) return { intent: 'backup' };

  // --- tasks: list ---
  if ((m = l.match(/^(?:what'?s|what is|anything)\s+(?:on|planned|happening|lined up|due)\s+(?:for\s+)?(today|tomorrow|tmrw|this week)/))) {
    return { intent: 'task_list', scope: m[1] === 'this week' ? 'week' : (m[1] === 'today' ? 'today' : 'tomorrow') };
  }
  const listy = /^(what|which|show|list|tell|read|any|do i have|what'?s)\b/.test(l) || /^(today|tomorrow|tmrw|this week|overdue|pending)('?s)?\b/.test(l) || /^(my |the )?(tasks?|to ?-?dos?|plan|schedule|agenda|reminders)\b/.test(l);
  if (listy && /\b(tasks?|to ?-?dos?|plan|plans|schedule|agenda|have to do|need to do|got to do|pending|overdue|have today|have tomorrow|on (my|the) list|reminders?)\b|^(today|tomorrow|tmrw)$/.test(l)) {
    let scope = 'today';
    if (/\b(tomorrow|tmrw|tmr)\b/.test(l)) scope = 'tomorrow';
    else if (/\b(this week|week|upcoming|next few days)\b/.test(l)) scope = 'week';
    else if (/\b(overdue|missed|late)\b/.test(l)) scope = 'overdue';
    else if (/\b(all|every|everything)\b/.test(l)) scope = 'all';
    return { intent: 'task_list', scope };
  }

  // --- tasks: complete / delete ---
  if ((m = t.match(/^(?:mark|tick|check off|complete|finish|finished|done(?: with)?)\s+(?:task\s+)?(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|finished))?$/i))
      || (m = t.match(/^i(?:'ve| have)? (?:finished|completed|done|did)\s+(.+)$/i))
      || (m = t.match(/^(.+?)\s+(?:is\s+)?(?:done|completed|finished)$/i))) {
    return { intent: 'task_complete', query: m[1].replace(/^(the|my)\s+/i, '').replace(/^task\s+/i, '').trim() };
  }
  if ((m = t.match(/^(?:delete|remove|cancel|drop|erase)\s+(?:the\s+|my\s+)?(?:task\s+)?(.+)$/i))) {
    if (/^(all|everything|all tasks)$/i.test(m[1])) return { intent: 'task_delete_all' };
    return { intent: 'task_delete', query: m[1].trim() };
  }

  // --- tasks: add ---
  if ((m = t.match(/^remind me\s+(?:to\s+|about\s+|that\s+)?(.+)$/i))) return taskFrom(m[1], now, { reminder: true });
  if ((m = t.match(/^(?:add|create|new|make|set|schedule)\s+(?:a\s+|an\s+)?(?:task|todo|to-do|to do|reminder|appointment|item)?\s*(?:to|for|:|-)?\s*(.+)$/i))) {
    return taskFrom(m[1], now, { reminder: /reminder|appointment/i.test(t) });
  }
  if ((m = t.match(/^(?:i\s+)?(?:have|need|got|must|should)\s+(?:to\s+)?(.+)$/i)) && m[1].split(' ').length >= 2) return taskFrom(m[1], now);
  if ((m = t.match(/^(?:todo|task|to do)[:\s-]+(.+)$/i))) return taskFrom(m[1], now);

  return { intent: 'unknown', text: original };
}
