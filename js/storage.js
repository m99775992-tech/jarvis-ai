// Persistent storage adapter (on-device, per-site browser storage).
// The preview build swaps this file for an in-memory version (see tools/build-preview.sh).
const ls = globalThis.localStorage;
export const PERSISTENT = true;
export const storage = {
  getItem: (k) => ls.getItem(k),
  setItem: (k, v) => ls.setItem(k, v),
  removeItem: (k) => ls.removeItem(k),
  keys: () => Object.keys(ls),
};
