// Permission manager. Enforced in code — NOT by the language/intent layer.
// The engine can only PROPOSE actions. Execution requires a single-use approval token
// that is created only from a real user tap on the confirmation dialog.

export const POLICY = {
  open_app:        { level: 'tap',     risk: 'low',    label: 'Open app' },
  open_url:        { level: 'tap',     risk: 'low',    label: 'Open website' },
  search:          { level: 'tap',     risk: 'low',    label: 'Web search' },
  calendar:        { level: 'tap',     risk: 'low',    label: 'Add to Google Calendar' },
  message:         { level: 'confirm', risk: 'medium', label: 'Prepare message' },
  call:            { level: 'confirm', risk: 'medium', label: 'Place call' },
  task_delete:     { level: 'confirm', risk: 'medium', label: 'Delete task' },
  task_delete_all: { level: 'strong',  risk: 'high',   label: 'Delete all tasks' },
  memory_forget:   { level: 'confirm', risk: 'medium', label: 'Delete memory' },
  audit_clear:     { level: 'confirm', risk: 'medium', label: 'Clear activity log' },
  restore:         { level: 'confirm', risk: 'high',   label: 'Restore backup' },
  erase_all:       { level: 'strong',  risk: 'high',   label: 'Erase all JARVIS data' },
  ai_request:      { level: 'blocked', risk: 'high',   label: 'Send to external AI' },
};

const issued = new Map(); // token -> { actionId, exp }

function token() {
  const a = new Uint8Array(16);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Called ONLY by the confirmation dialog's Authorize handler. */
export function issueApproval(actionId) {
  const t = token();
  issued.set(t, { actionId, exp: Date.now() + 60000 });
  return t;
}

/** Returns { allowed, reason }. Consumes the token (single use). */
export function check(action, approvalToken) {
  const p = POLICY[action.type];
  if (!p) return { allowed: false, reason: 'Unknown action type — blocked by default.' };
  if (p.level === 'blocked') return { allowed: false, reason: 'External AI is disabled in this build. Nothing was sent.' };
  if (p.level === 'tap') return { allowed: true };
  const rec = approvalToken && issued.get(approvalToken);
  if (approvalToken) issued.delete(approvalToken);
  if (!rec) return { allowed: false, reason: 'No approval was given for this action.' };
  if (rec.actionId !== action.id) return { allowed: false, reason: 'Approval belongs to a different action.' };
  if (rec.exp < Date.now()) return { allowed: false, reason: 'Approval expired. Please authorize again.' };
  return { allowed: true };
}

export function needsConfirm(type) {
  const p = POLICY[type];
  return !p || p.level === 'confirm' || p.level === 'strong';
}

export function _reset() { issued.clear(); }
