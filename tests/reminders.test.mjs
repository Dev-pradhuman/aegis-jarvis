import assert from 'node:assert/strict';
import test from 'node:test';
import { claimDueReminders, reminderAction } from '../server/reminders.js';
import { routeRequest } from '../server/router.js';
import { invokeToolRequest } from '../server/toolRuntime.js';

test('natural reminder commands choose the deterministic canonical tool', () => {
  const relative = routeRequest('Remind me in 2 minutes to test the reminder');
  assert.equal(relative.capability, 'reminders.create');
  assert.equal(relative.args.title, 'test the reminder');
  assert.ok(Date.parse(relative.args.dueAt) > Date.now());
  assert.equal(routeRequest('List my reminders').capability, 'reminders.list');
});

test('canonical reminder create persists once and rejects invalid times', async () => {
  const state = { reminders: [], runs: [], approvals: [], activity: [], toolExecutions: [] };
  const persist = async (mutator) => mutator(state);
  const request = { toolId: 'reminders.create', input: { title: 'Check physics', dueAt: new Date(Date.now() + 60_000).toISOString() }, idempotencyKey: 'reminder-test-1' };
  const first = await invokeToolRequest(state, request, { persist });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.reminder.status, 'scheduled');
  const second = await invokeToolRequest(state, request, { persist });
  assert.equal(second.body.replayed, true);
  assert.equal(state.reminders.length, 1);
  assert.throws(() => reminderAction(state, 'create', { title: 'Expired', dueAt: new Date(Date.now() - 1000).toISOString() }), { code: 'REMINDER_TIME_INVALID' });
});

test('scheduler claim is once across restart; snooze makes only a new due cycle', () => {
  const now = Date.now();
  const state = { reminders: [], activity: [] };
  const { reminder } = reminderAction(state, 'create', { title: 'Local test', dueAt: new Date(now + 1000).toISOString() }, now);
  assert.equal(claimDueReminders(state, now + 500).length, 0);
  assert.deepEqual(claimDueReminders(state, now + 1000).map((item) => item.id), [reminder.id]);
  assert.equal(claimDueReminders(structuredClone(state), now + 2000).length, 0);
  reminderAction(state, 'snooze', { id: reminder.id, dueAt: new Date(now + 12_000).toISOString() }, now + 2000);
  assert.equal(claimDueReminders(state, now + 12_000).length, 1);
  reminderAction(state, 'complete', { id: reminder.id }, now + 12_500);
  assert.equal(claimDueReminders(state, now + 20_000).length, 0);
  state.reminders.push({ id: 'corrupt-time', status: 'scheduled', dueAt: 'not-a-date' });
  assert.equal(claimDueReminders(state, now + 30_000).length, 0);
});
