// Backup creation, verification and restoration planning.
// Format: { format, version, app, createdAt, encrypted, sha256, payload }
//  - plain:     payload = state object; sha256 = SHA-256 of JSON.stringify(payload)
//  - encrypted: payload = { kdf, iterations, salt, iv, ciphertext } (AES-GCM 256, PBKDF2-SHA256)
//               sha256 = SHA-256 of the plaintext JSON (checked after decryption)
import { normalize } from './store.js';

export const FORMAT = 'jarvis-backup';
export const VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const ITERATIONS = 250000;
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256Hex(text) {
  const h = await subtle().digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(passphrase, salt) {
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Data that goes into a backup: the normalized state (no secrets exist in state by design). */
export function backupData(state) {
  const data = normalize(state);
  return data;
}

export async function createBackup(state, passphrase = '') {
  const data = backupData(state);
  const json = JSON.stringify(data);
  const sha256 = await sha256Hex(json);
  const base = { format: FORMAT, version: VERSION, app: 'JARVIS AI · Mizan Technology', createdAt: new Date().toISOString(), sha256 };
  if (!passphrase) return { ...base, encrypted: false, payload: data };
  if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json));
  return { ...base, encrypted: true, payload: { kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-GCM-256', salt: b64(salt), iv: b64(iv), ciphertext: b64(ct) } };
}

/**
 * Validate a backup file's text. Never mutates app state.
 * Returns { ok: true, data, encrypted, createdAt, counts } or { ok: false, error, needsPassphrase? }
 */
export async function verifyBackup(text, passphrase = '') {
  if (typeof text !== 'string') return { ok: false, error: 'File could not be read as text.' };
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'File is larger than 5 MB — not a JARVIS backup.' };
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'File is not valid JSON. It may be damaged or not a JARVIS backup.' }; }
  if (!obj || obj.format !== FORMAT) return { ok: false, error: 'This is not a JARVIS backup file.' };
  if (typeof obj.version !== 'number' || obj.version > VERSION) return { ok: false, error: `Backup version ${obj.version} is not supported by this JARVIS version.` };
  if (typeof obj.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(obj.sha256)) return { ok: false, error: 'Backup integrity checksum is missing.' };

  let json;
  if (obj.encrypted) {
    if (!passphrase) return { ok: false, needsPassphrase: true, error: 'This backup is encrypted. Enter its passphrase.' };
    const p = obj.payload || {};
    try {
      const key = await deriveKey(passphrase, unb64(p.salt));
      const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, key, unb64(p.ciphertext));
      json = dec.decode(pt);
    } catch {
      return { ok: false, needsPassphrase: true, error: 'Wrong passphrase, or the encrypted data was altered.' };
    }
  } else {
    if (!obj.payload || typeof obj.payload !== 'object') return { ok: false, error: 'Backup has no data.' };
    json = JSON.stringify(obj.payload);
  }

  const actual = await sha256Hex(json);
  if (actual !== obj.sha256) return { ok: false, error: 'Integrity check failed: the backup was modified or corrupted.' };

  let data;
  try { data = normalize(JSON.parse(json)); } catch (e) { return { ok: false, error: 'Backup data failed validation: ' + e.message }; }
  return {
    ok: true,
    data,
    encrypted: !!obj.encrypted,
    createdAt: obj.createdAt,
    counts: { tasks: data.tasks.length, memory: data.memory.length, contacts: data.contacts.length, audit: data.audit.length },
  };
}

/**
 * Staged restore: snapshot current state, write new state, verify, roll back on failure.
 * storage is a browser-storage-like object. Returns { ok, error? }.
 */
export function applyRestore(storage, keys, currentState, newState) {
  const { STORAGE_KEY, PRE_RESTORE_KEY } = keys;
  const previous = storage.getItem(STORAGE_KEY) ?? JSON.stringify(currentState);
  try {
    storage.setItem(PRE_RESTORE_KEY, previous);
    const json = JSON.stringify(newState);
    storage.setItem(STORAGE_KEY, json);
    if (storage.getItem(STORAGE_KEY) !== json) throw new Error('Write verification failed.');
    return { ok: true };
  } catch (e) {
    try { storage.setItem(STORAGE_KEY, previous); } catch {}
    return { ok: false, error: 'Restore failed and your previous data was kept: ' + (e.message || e) };
  }
}
