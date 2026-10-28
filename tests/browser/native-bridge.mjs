// Simulates the Android app's window.AndroidJarvis bridge to test the JavaScript side of v0.2.0.
// (The Kotlin side is compiled by Gradle; it needs a real phone to test.)
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:8765/';
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 375, height: 760 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => {
  window.__calls = [];
  window.__nextSpeech = 'Testing JARVIS one two three';
  const emit = (t, d = '') => setTimeout(() => window.__jarvisNative && window.__jarvisNative(t, d), 30);
  window.AndroidJarvis = {
    version: () => '0.2.0', sttAvailable: () => true, voiceName: () => 'en-gb-x-rjs-local (en-GB)',
    micPermission: () => (window.__micGranted ? 'granted' : 'prompt'),
    requestMic: () => { __calls.push(['requestMic']); window.__micGranted = true; emit('mic-permission', 'granted'); },
    startListening: (lang) => { __calls.push(['startListening', lang]); emit('stt-ready'); setTimeout(() => { window.__jarvisNative('stt-interim', window.__nextSpeech.slice(0, 8)); window.__jarvisNative('stt-final', window.__nextSpeech); window.__jarvisNative('stt-end', ''); }, 80); },
    stopListening: () => __calls.push(['stopListening']),
    speak: (t, r, pi) => { __calls.push(['speak', t]); emit('tts-start'); setTimeout(() => window.__jarvisNative('tts-end', ''), 60); },
    stopSpeaking: () => __calls.push(['stopSpeaking']),
    openExternal: (u) => { __calls.push(['openExternal', u]); return true; },
    saveFile: (n, m, t) => { __calls.push(['saveFile', n, m, t.length]); return true; },
    openSettings: () => {},
  };
});
const results = []; const R = (n, ok) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n); };
const calls = () => p.evaluate(() => window.__calls);
await p.goto(URL, { waitUntil: 'networkidle' });
R('no service worker inside the app', !(await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r))));
// Mic test
await p.click('#quick button[data-cmd="Mic test"]'); await p.waitForTimeout(300);
await p.click('#cf-ok'); await p.waitForTimeout(800);
const convo = async () => (await p.textContent('#convo')).replace(/\s+/g, ' ');
R('mic test shows "JARVIS Android app"', (await convo()).includes('JARVIS Android app'));
R('mic test shows Android voice name', (await convo()).includes('en-gb-x-rjs-local'));
R('asked Android for mic permission', (await calls()).some((c) => c[0] === 'requestMic'));
R('mic test heard speech -> MIC-OK', (await convo()).includes('MIC-OK') && (await convo()).includes('Testing JARVIS one two three'));
R('spoke with Android voice', (await calls()).some((c) => c[0] === 'speak' && c[1].includes('Voice input is working')));
// Voice: open app directly
await p.evaluate(() => { window.__nextSpeech = 'open YouTube'; window.__calls.length = 0; });
await p.click('#mic'); await p.waitForTimeout(700);
R('voice "open YouTube" opens app with no extra tap', (await calls()).some((c) => c[0] === 'openExternal' && c[1].includes('package=com.google.android.youtube')));
// Voice: WhatsApp message
await p.evaluate(() => { window.__nextSpeech = 'Open WhatsApp and text to reach at college early'; window.__calls.length = 0; });
await p.click('#mic'); await p.waitForTimeout(700);
R('voice WhatsApp -> Authorize dialog opened, nothing sent yet', (await p.locator('#confirm').evaluate((d) => d.open)) && !(await calls()).some((c) => c[0] === 'openExternal'));
await p.click('#cf-ok'); await p.waitForTimeout(300);
R('after Authorize: WhatsApp opened with text', (await calls()).some((c) => c[0] === 'openExternal' && c[1].startsWith('intent://send?text=Reach%20at%20college%20early') && c[1].includes('package=com.whatsapp')));
// Backup save goes to Android "Save as"
await p.click('.tabbar button[data-view="system"]'); await p.waitForTimeout(300);
await p.click('#bk-create'); await p.waitForTimeout(400);
R('backup uses Android save screen', (await calls()).some((c) => c[0] === 'saveFile' && /\.json$/.test(c[1]) && c[3] > 50));
R('no JavaScript errors', errs.length === 0);
if (errs.length) console.log(errs);
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 1);
