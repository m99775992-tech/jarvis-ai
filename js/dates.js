// Date helpers. Pure functions, no DOM. Dates are stored as local "YYYY-MM-DD" strings
// and times as "HH:MM" (24h) so tasks are easy to read in backups.

export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  x.setDate(x.getDate() + n);
  return x;
}

export function fromYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(a, b) {
  // whole days from date-string a to date-string b
  return Math.round((fromYmd(b) - fromYmd(a)) / 86400000);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD_SHORT = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function weekdayIndex(word) {
  const i = WEEKDAYS.indexOf(word);
  if (i >= 0) return i;
  return WD_SHORT[word] ?? -1;
}

function monthIndex(word) {
  return MONTHS.indexOf(word.slice(0, 3));
}

function to24(h, m, ap) {
  h = Number(h); m = Number(m || 0);
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 6) h += 12; // "at 5" most likely means 5 pm
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Extracts a date/time from free text.
 * Returns { date: 'YYYY-MM-DD' | null, time: 'HH:MM' | null, rest: string }
 * where rest is the text with the date/time words removed.
 */
export function parseWhen(input, now = new Date()) {
  let text = ` ${input} `;
  let date = null;
  let time = null;
  const cut = (re) => { text = text.replace(re, ' '); };

  // relative minutes/hours: "in 30 minutes", "in 2 hours"
  let m = text.match(/\bin (\d{1,3}) ?(minutes?|mins?|hours?|hrs?)\b/i);
  if (m) {
    const n = Number(m[1]);
    const ms = /^h/i.test(m[2]) ? n * 3600000 : n * 60000;
    const t = new Date(now.getTime() + ms);
    date = ymd(t);
    time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    cut(m[0]);
  }

  if (!date) {
    if ((m = text.match(/\b(the )?day after (tomorrow|tmrw|tmr)\b/i))) { date = ymd(addDays(now, 2)); cut(m[0]); }
    else if ((m = text.match(/\b(tomorrow|tmrw|tmr|tommorow|tomorow)\b/i))) { date = ymd(addDays(now, 1)); cut(m[0]); }
    else if ((m = text.match(/\b(today|tonight)\b/i))) {
      date = ymd(now);
      if (m[1].toLowerCase() === 'tonight') time = '20:00';
      cut(m[0]);
    }
    else if ((m = text.match(/\bin (\d{1,3}) days?\b/i))) { date = ymd(addDays(now, Number(m[1]))); cut(m[0]); }
    else if ((m = text.match(/\b(next week)\b/i))) { date = ymd(addDays(now, 7)); cut(m[0]); }
    else if ((m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { date = `${m[1]}-${m[2]}-${m[3]}`; cut(m[0]); }
    else if ((m = text.match(/\b(?:on )?(\d{1,2})(?:st|nd|rd|th)?(?: of)? (jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i))
          || (m = text.match(/\b(?:on )?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/i))) {
      const dayNum = Number(/\d/.test(m[1]) ? m[1] : m[2]);
      const mon = monthIndex((/\d/.test(m[1]) ? m[2] : m[1]).toLowerCase());
      let d = new Date(now.getFullYear(), mon, dayNum);
      if (d.getMonth() === mon && d.getDate() === dayNum) {
        if (ymd(d) < ymd(now)) d = new Date(now.getFullYear() + 1, mon, dayNum);
        date = ymd(d);
        cut(m[0]);
      }
    }
    else if ((m = text.match(/\b(?:on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)\b/i))) {
      const target = weekdayIndex(m[1].toLowerCase());
      if (target >= 0) {
        let diff = (target - now.getDay() + 7) % 7;
        if (diff === 0) diff = /this/i.test(m[0]) ? 0 : 7;
        if (/next/i.test(m[0]) && diff < 7 && diff !== 0) diff += 0; // "next friday" = coming friday
        date = ymd(addDays(now, diff));
        cut(m[0]);
      }
    }
  }

  if (!time) {
    if ((m = text.match(/\b(?:at|by|@) ?(\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a\.m\.|p\.m\.)?\b/i))
        || (m = text.match(/\b(\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a\.m\.|p\.m\.)\b/i))) {
      const ap = m[3] ? m[3].replace(/\./g, '').toLowerCase() : null;
      const t = to24(m[1], m[2], ap);
      if (t) { time = t; cut(m[0]); }
    }
    else if ((m = text.match(/\b(in the )?(morning)\b/i))) { time = '09:00'; cut(m[0]); }
    else if ((m = text.match(/\b(in the )?(afternoon)\b/i))) { time = '14:00'; cut(m[0]); }
    else if ((m = text.match(/\b(in the )?(evening)\b/i))) { time = '18:00'; cut(m[0]); }
  }

  if (time && !date) {
    const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    date = time > nowHM ? ymd(now) : ymd(addDays(now, 1));
  }

  const rest = text.replace(/\s+/g, ' ').trim().replace(/^(to|for|on|at)\s+/i, '').replace(/\s+(on|at|by|for)$/i, '').trim();
  return { date, time, rest };
}

export function friendlyDate(dateStr, now = new Date()) {
  if (!dateStr) return 'No date';
  const diff = daysBetween(ymd(now), dateStr);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = fromYmd(dateStr);
  const wd = WEEKDAYS[d.getDay()];
  const label = wd[0].toUpperCase() + wd.slice(1, 3);
  return `${label}, ${d.getDate()} ${MONTHS[d.getMonth()][0].toUpperCase()}${MONTHS[d.getMonth()].slice(1)}`;
}

export function friendlyTime(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
