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

test('timers, alarms, snooze and dismiss route cleanly via natural language', () => {
  const timer = routeRequest('set a timer for 15 minutes');
  assert.equal(timer.capability, 'reminders.create');
  assert.equal(timer.args.category, 'timer');
  assert.match(timer.args.title, /Timer/);
  assert.ok(Date.parse(timer.args.dueAt) > Date.now());

  const alarm = routeRequest('wake me up at 6:30 am');
  assert.equal(alarm.capability, 'reminders.create');
  assert.equal(alarm.args.category, 'alarm');
  assert.match(alarm.args.title, /Alarm/);

  const snooze = routeRequest('snooze reminder for 10 minutes');
  assert.equal(snooze.capability, 'reminders.snooze');
  assert.equal(snooze.args.snoozeMinutes, 10);

  const dismiss = routeRequest('dismiss ringing alarm');
  assert.equal(dismiss.capability, 'reminders.complete');
});

test('reminderAction supports categories, delete, dismiss, and relative snoozeMinutes', () => {
  const now = Date.now();
  const state = { reminders: [], activity: [] };

  // Create timer
  const { reminder } = reminderAction(state, 'create', { title: 'Egg timer', dueAt: new Date(now + 180_000).toISOString(), category: 'timer' }, now);
  assert.equal(reminder.category, 'timer');
  assert.equal(reminder.ringing, false);

  // Claim when due
  const claimed = claimDueReminders(state, now + 200_000);
  assert.equal(claimed.length, 1);
  assert.equal(state.reminders[0].ringing, true);
  assert.equal(state.reminders[0].status, 'due');

  // Snooze for 5 minutes
  const snoozed = reminderAction(state, 'snooze', { id: reminder.id, snoozeMinutes: 5 }, now + 200_000);
  assert.equal(snoozed.reminder.ringing, false);
  assert.equal(snoozed.reminder.status, 'scheduled');
  assert.ok(Date.parse(snoozed.reminder.dueAt) >= now + 200_000 + 300_000);

  // Dismiss
  state.reminders[0].status = 'due';
  state.reminders[0].ringing = true;
  const dismissed = reminderAction(state, 'dismiss', { id: reminder.id }, now + 600_000);
  assert.equal(dismissed.reminder.status, 'dismissed');
  assert.equal(dismissed.reminder.ringing, false);

  // Delete
  const deleted = reminderAction(state, 'delete', { id: reminder.id });
  assert.equal(deleted.deleted, true);
  assert.equal(state.reminders.length, 0);
});

