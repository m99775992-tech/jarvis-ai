# BACKUP AND RESTORATION

## Included / excluded
Included: tasks, memory, contacts, activity log, settings, usage counters, backup history.
Excluded: nothing secret exists to exclude — the app stores no passwords, keys or tokens. The passphrase is never saved.

## Make a backup (phone)
1. System → Backup & recovery.
2. Optional: type a passphrase (8+ characters) to encrypt. **Recommended**, because contacts are personal data.
3. Tap **Create backup**. JARVIS creates the file, re-verifies it, and saves it to Downloads (`jarvis-backup-YYYYMMDD-HHMM.json`).
4. Tap **Save to Drive / share** to keep a copy in Google Drive (your choice of destination).

## Restore
1. System → Backup & recovery. If encrypted, type the passphrase first.
2. Tap **Restore from file**, pick the backup.
3. JARVIS checks format, version, SHA-256 integrity, (decrypts), and validates every field. Nothing changes yet.
4. Review the summary → **Authorize**. Current data is kept as a safety copy first.
5. Changed your mind? **Undo last restore**.

## Disaster recovery
| Situation | What to do |
|---|---|
| Deleted a task/memory by mistake | Restore latest backup (then Undo if needed) |
| App shows "data could not be read" | A copy of the damaged data was kept automatically; restore a backup |
| Restore failed | Your previous data is kept unchanged; check passphrase / file |
| Phone lost or replaced | Install JARVIS on new phone, restore backup from Drive |
| Chrome data cleared | Same as above |
| Bad update | Redeploy previous version; data is unaffected |

## Tested
Plain round-trip, encrypted round-trip, wrong passphrase, altered ciphertext, tampered payload, garbage file, oversized file, future version, staged restore with simulated storage failure (existing data preserved), undo restore, offline backup/restore — all passing (`tests/core.test.js`, `tests/browser/flows.mjs`).
