import crypto from 'node:crypto';
import { runWorkflow } from './workflowEngine.js';
import { activityEntry } from './store.js';

function getPath(value, path) {
  return String(path || '').split('.').filter(Boolean).reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value);
}

function matchesCondition(event, condition) {
  const actual = getPath(event, condition.path);
  const expected = condition.value;
  switch (condition.operator || 'eq') {
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    case 'exists': return condition.value === false ? actual === undefined : actual !== undefined;
    case 'contains': return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    default: return false;
  }
}

export function triggerMatches(workflow, event) {
  const type = String(event.type || '');
  if (workflow.state !== 'active' || ![type, `event:${type}`].includes(workflow.trigger)) return false;
  const conditions = Array.isArray(workflow.triggerConditions) ? workflow.triggerConditions.slice(0, 10) : [];
  if (!conditions.length) return true;
  const results = conditions.map((condition) => matchesCondition(event, condition));
  return workflow.conditionMode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

export function eventReceiptKey(event) {
  if (event.id) return `id:${String(event.id)}`;
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify({ type: event.type, payload: event.payload || null, source: event.source || null })).digest('hex')}`;
}

export async function dispatchWorkflowEvent(state, input, options = {}) {
  const event = { id: input.id ? String(input.id) : null, type: String(input.type || '').trim(), source: String(input.source || 'api'), payload: input.payload && typeof input.payload === 'object' ? structuredClone(input.payload) : {}, receivedAt: new Date(options.now || Date.now()).toISOString() };
  if (!event.type) throw new Error('type is required');
  state.eventReceipts ??= [];
  const receiptKey = eventReceiptKey(event);
  const prior = state.eventReceipts.find((receipt) => receipt.key === receiptKey);
  if (prior) return { accepted: true, duplicate: true, event, runs: [], receipt: prior };
  const receipt = { key: receiptKey, eventId: event.id, type: event.type, source: event.source, receivedAt: event.receivedAt, runIds: [] };
  state.eventReceipts.unshift(receipt);
  state.eventReceipts = state.eventReceipts.slice(0, 1000);
  const runs = [];
  for (const workflow of state.workflows || []) {
    if (!triggerMatches(workflow, event)) continue;
    const run = await runWorkflow(state, workflow, { requestedBy: `event:${event.source}`, triggerEvent: event });
    runs.push(run);
    receipt.runIds.push(run.runId || run.id);
  }
  state.activity = [activityEntry('event.received', event.type, { eventId: event.id, source: event.source, runs: runs.length, duplicate: false }), ...(state.activity || [])].slice(0, 200);
  return { accepted: true, duplicate: false, event, runs, receipt };
}
