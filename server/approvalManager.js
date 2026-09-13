const approvePattern = /^(?:approve|approved|yes|yes\s+please|go\s+ahead|do\s+it|proceed|confirm)(?:\s+(?:it|this|that))?[.!]?$/i;
const rejectPattern = /^(?:reject|rejected|deny|denied|no|cancel|stop|don'?t)(?:\s+(?:it|this|that))?[.!]?$/i;

export function approvalUtterance(value) {
  const text = String(value || '').trim();
  if (approvePattern.test(text)) return 'approved';
  if (rejectPattern.test(text)) return 'rejected';
  return null;
}

export function activePendingApprovals(state = {}, { sessionId = null, now = Date.now() } = {}) {
  return (state.approvals || []).filter((item) => {
    if (item.status !== 'pending') return false;
    if (!Number.isFinite(Date.parse(item.expiresAt)) || Date.parse(item.expiresAt) <= now) return false;
    if (sessionId && item.jarvisSessionId && item.jarvisSessionId !== sessionId) return false;
    return true;
  });
}

export function pendingApprovalResolution(state, text, options = {}) {
  const outcome = approvalUtterance(text);
  if (!outcome) return null;
  const pending = activePendingApprovals(state, options);
  if (pending.length === 1) return { outcome, approval: pending[0] };
  return { outcome, approval: null, pending, error: pending.length ? 'MULTIPLE_PENDING_APPROVALS' : 'NO_PENDING_APPROVAL' };
}
