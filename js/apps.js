// Android hand-off links. A web app cannot control other apps; it can only ask Android
// to open them (intent links / app links). The user then completes the action in that app.

export const APPS = {
  whatsapp: { name: 'WhatsApp', pkg: 'com.whatsapp', web: 'https://web.whatsapp.com' },
  'whatsapp business': { name: 'WhatsApp Business', pkg: 'com.whatsapp.w4b', web: 'https://web.whatsapp.com' },
  instagram: { name: 'Instagram', pkg: 'com.instagram.android', web: 'https://www.instagram.com' },
  insta: { alias: 'instagram' },
  youtube: { name: 'YouTube', pkg: 'com.google.android.youtube', web: 'https://www.youtube.com' },
  yt: { alias: 'youtube' },
  gmail: { name: 'Gmail', pkg: 'com.google.android.gm', web: 'https://mail.google.com' },
  mail: { alias: 'gmail' },
  maps: { name: 'Google Maps', pkg: 'com.google.android.apps.maps', web: 'https://maps.google.com' },
  'google maps': { alias: 'maps' },
  chrome: { name: 'Chrome', pkg: 'com.android.chrome', web: 'https://www.google.com' },
  google: { name: 'Google', pkg: 'com.google.android.googlequicksearchbox', web: 'https://www.google.com' },
  telegram: { name: 'Telegram', pkg: 'org.telegram.messenger', web: 'https://web.telegram.org' },
  facebook: { name: 'Facebook', pkg: 'com.facebook.katana', web: 'https://www.facebook.com' },
  fb: { alias: 'facebook' },
  snapchat: { name: 'Snapchat', pkg: 'com.snapchat.android', web: 'https://www.snapchat.com' },
  x: { name: 'X', pkg: 'com.twitter.android', web: 'https://x.com' },
  twitter: { alias: 'x' },
  linkedin: { name: 'LinkedIn', pkg: 'com.linkedin.android', web: 'https://www.linkedin.com' },
  spotify: { name: 'Spotify', pkg: 'com.spotify.music', web: 'https://open.spotify.com' },
  calendar: { name: 'Google Calendar', pkg: 'com.google.android.calendar', web: 'https://calendar.google.com' },
  'google calendar': { alias: 'calendar' },
  drive: { name: 'Google Drive', pkg: 'com.google.android.apps.docs', web: 'https://drive.google.com' },
  'google drive': { alias: 'drive' },
  keep: { name: 'Google Keep', pkg: 'com.google.android.keep', web: 'https://keep.google.com' },
  classroom: { name: 'Google Classroom', pkg: 'com.google.android.apps.classroom', web: 'https://classroom.google.com' },
  'google classroom': { alias: 'classroom' },
  meet: { name: 'Google Meet', pkg: 'com.google.android.apps.meetings', web: 'https://meet.google.com' },
  'google meet': { alias: 'meet' },
  zoom: { name: 'Zoom', pkg: 'us.zoom.videomeetings', web: 'https://zoom.us' },
  messages: { name: 'Messages', pkg: 'com.google.android.apps.messaging', web: null },
  sms: { alias: 'messages' },
  clock: { name: 'Clock', pkg: 'com.google.android.deskclock', web: null },
  alarm: { alias: 'clock' },
  'play store': { name: 'Play Store', pkg: 'com.android.vending', web: 'https://play.google.com' },
  playstore: { alias: 'play store' },
  netflix: { name: 'Netflix', pkg: 'com.netflix.mediaclient', web: 'https://www.netflix.com' },
  amazon: { name: 'Amazon', pkg: 'in.amazon.mShop.android.shopping', web: 'https://www.amazon.in' },
  flipkart: { name: 'Flipkart', pkg: 'com.flipkart.android', web: 'https://www.flipkart.com' },
  'google pay': { name: 'Google Pay', pkg: 'com.google.android.apps.nbu.paisa.user', web: null },
  gpay: { alias: 'google pay' },
  phonepe: { name: 'PhonePe', pkg: 'com.phonepe.app', web: null },
  paytm: { name: 'Paytm', pkg: 'net.one97.paytm', web: null },
  truecaller: { name: 'Truecaller', pkg: 'com.truecaller', web: null },
  chatgpt: { name: 'ChatGPT', pkg: 'com.openai.chatgpt', web: 'https://chatgpt.com' },
  claude: { name: 'Claude', pkg: 'com.anthropic.claude', web: 'https://claude.ai' },
  perplexity: { name: 'Perplexity', pkg: 'ai.perplexity.app.android', web: 'https://www.perplexity.ai' },
};

export function findApp(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  let a = APPS[key] || APPS[key.replace(/ /g, '')];
  if (a && a.alias) a = APPS[a.alias];
  return a || null;
}

export function appIntentUrl(app) {
  const fallback = encodeURIComponent(app.web || `https://play.google.com/store/apps/details?id=${app.pkg}`);
  return `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${app.pkg};S.browser_fallback_url=${fallback};end`;
}

export function digits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d; // assume India when no country code
  return d;
}

export function whatsappUrl(phone, text) {
  const t = encodeURIComponent(text || '');
  return phone ? `https://wa.me/${digits(phone)}?text=${t}` : `https://wa.me/?text=${t}`;
}

export function smsUrl(phone, text) {
  return `sms:${phone ? '+' + digits(phone) : ''}?body=${encodeURIComponent(text || '')}`;
}

export function telUrl(phone) {
  return `tel:+${digits(phone)}`;
}

export function searchUrl(engine, q) {
  const e = encodeURIComponent(q);
  switch (engine) {
    case 'youtube': return `https://www.youtube.com/results?search_query=${e}`;
    case 'maps': return `https://www.google.com/maps/search/${e}`;
    case 'wikipedia': return `https://en.wikipedia.org/w/index.php?search=${e}`;
    default: return `https://www.google.com/search?q=${e}`;
  }
}

export function safeWebUrl(input) {
  let u = String(input || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const p = new URL(u);
    if (p.protocol !== 'https:' && p.protocol !== 'http:') return null;
    return p.href;
  } catch { return null; }
}

/** Google Calendar "create event" link — the most reliable free way to get a real phone alarm. */
export function calendarUrl(task) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: task.title, details: 'Added from JARVIS AI' });
  if (task.date) {
    const d = task.date.replace(/-/g, '');
    if (task.time) {
      const [h, m] = task.time.split(':').map(Number);
      const start = `${d}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
      const endH = (h + 1) % 24;
      const end = `${endH < h ? nextDay(task.date) : d}T${String(endH).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
      p.set('dates', `${start}/${end}`);
    } else {
      p.set('dates', `${d}/${nextDay(task.date)}`);
    }
  }
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function nextDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(y, m - 1, d + 1);
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
}
