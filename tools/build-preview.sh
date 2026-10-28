#!/bin/sh
# Builds a non-persistent preview copy (for hosts that forbid browser storage).
set -e
cd "$(dirname "$0")/.."
rm -rf dist-preview && cp -r app dist-preview
cat > dist-preview/js/storage.js <<'JS'
// PREVIEW BUILD: in-memory only. Nothing is saved; data resets on reload.
const mem = new Map();
export const PERSISTENT = false;
export const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  keys: () => [...mem.keys()],
};
JS
# the preview has no offline worker
sed -i "s#navigator.serviceWorker.register('./sw.js')#Promise.resolve()#" dist-preview/js/app.js
rm -f dist-preview/sw.js
echo "preview built in dist-preview/"
