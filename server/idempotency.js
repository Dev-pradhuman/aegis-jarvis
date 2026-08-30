import crypto from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function actionFingerprint(toolId, input) {
  return crypto.createHash('sha256').update(JSON.stringify({ toolId, input: stable(input) })).digest('hex');
}

export function findToolReplay(state, idempotencyKey, toolId, input) {
  if (!idempotencyKey) return null;
  const execution = (state.toolExecutions || []).find((item) => item.idempotencyKey === idempotencyKey);
  if (!execution) return null;
  if (execution.fingerprint !== actionFingerprint(toolId, input)) {
    const error = new Error('Idempotency key was already used for a different tool action');
    error.code = 'IDEMPOTENCY_CONFLICT';
    throw error;
  }
  return execution;
}

export function rememberToolResult(state, { idempotencyKey, runId = null, toolId, input, result }) {
  if (!idempotencyKey) return null;
  const execution = {
    idempotencyKey,
    runId,
    toolId,
    fingerprint: actionFingerprint(toolId, input),
    result,
    completedAt: new Date().toISOString(),
  };
  state.toolExecutions ??= [];
  state.toolExecutions = [execution, ...state.toolExecutions.filter((item) => item.idempotencyKey !== idempotencyKey)].slice(0, 500);
  return execution;
}
