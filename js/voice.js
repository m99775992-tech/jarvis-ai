// Voice I/O using the browser's built-in Web Speech API (free, no key).
// IMPORTANT (disclosed in UI + PRIVACY.md): on Chrome for Android, speech recognition audio is
// processed by Google's speech service. Text-to-speech uses voices installed on the phone.

const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const synth = globalThis.speechSynthesis;

export const sttSupported = !!SR;
export const ttsSupported = !!synth;

let rec = null;

export function listen({ lang = 'en-IN', onInterim, onFinal, onEnd, onError }) {
  if (!SR) { onError?.('not-supported'); return null; }
  stopListening();
  rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    onInterim?.(finalText + interim);
  };
  rec.onerror = (e) => onError?.(e.error || 'error');
  rec.onend = () => { const t = finalText.trim(); rec = null; if (t) onFinal?.(t); onEnd?.(); };
  try { rec.start(); } catch (e) { onError?.('start-failed'); return null; }
  return rec;
}

export function stopListening() {
  if (rec) { try { rec.abort(); } catch {} rec = null; }
}

export function isListening() { return !!rec; }

let cachedVoices = [];
export function loadVoices() {
  return new Promise((resolve) => {
    if (!synth) return resolve([]);
    const v = synth.getVoices();
    if (v.length) { cachedVoices = v; return resolve(v); }
    const t = setTimeout(() => resolve(synth.getVoices()), 1500);
    synth.onvoiceschanged = () => { clearTimeout(t); cachedVoices = synth.getVoices(); resolve(cachedVoices); };
  });
}

/** Rank voices so a calm British-English male voice is preferred (closest free match to a "JARVIS" feel). */
export function rankVoices(voices) {
  const score = (v) => {
    let s = 0;
    const n = (v.name + ' ' + v.voiceURI).toLowerCase();
    if (/^en-gb|en_gb/i.test(v.lang)) s += 50;
    else if (/^en-in|en_in/i.test(v.lang)) s += 25;
    else if (/^en/i.test(v.lang)) s += 15;
    if (/male|daniel|arthur|george|oliver|ryan|thomas|rishi|gbd|gbc|-x-rjs|-x-gbd|-x-gbb/.test(n) && !/female/.test(n)) s += 30;
    if (/female|woman|samantha|serena|kate|susan|-x-gba|-x-gbc/.test(n)) s -= 10;
    if (/google|network|neural|natural/.test(n)) s += 5;
    if (v.localService) s += 3;
    return s;
  };
  return [...voices].filter((v) => /^en|^hi/i.test(v.lang)).sort((a, b) => score(b) - score(a));
}

export function speak(text, settings, { onStart, onEnd } = {}) {
  if (!synth || !text) { onEnd?.(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, '"').replace(/ — /g, ', '));
  const voices = cachedVoices.length ? cachedVoices : synth.getVoices();
  const chosen = voices.find((v) => v.voiceURI === settings.voiceURI) || rankVoices(voices)[0];
  if (chosen) { u.voice = chosen; u.lang = chosen.lang; } else u.lang = 'en-GB';
  u.rate = settings.rate; u.pitch = settings.pitch; u.volume = settings.volume;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function stopSpeaking() { if (synth) synth.cancel(); }
export function isSpeaking() { return !!(synth && synth.speaking); }
