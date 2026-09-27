import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { activityEntry } from './store.js';

const execFileAsync = promisify(execFile);
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

function futureTime(value, now = Date.now()) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > now + 10 * 365 * 86400_000) fail('REMINDER_TIME_INVALID', 'Choose a future reminder time within ten years');
  return new Date(timestamp).toISOString();
}

export function reminderAction(state, action, input = {}, now = Date.now()) {
  state.reminders ??= [];
  if (action === 'list') return { reminders: state.reminders };
  if (action === 'create') {
    const title = String(input.title || '').trim();
    if (!title || title.length > 300) fail('REMINDER_TITLE_INVALID', 'Reminder title must contain 1 to 300 characters');
    const reminder = { id: `reminder-${crypto.randomUUID()}`, title, dueAt: futureTime(input.dueAt, now), status: 'scheduled', createdAt: new Date(now).toISOString(), firedAt: null, completedAt: null };
    state.reminders.unshift(reminder);
    return { reminder };
  }
  const reminder = state.reminders.find((item) => item.id === input.id);
  if (!reminder) fail('REMINDER_NOT_FOUND', 'Reminder does not exist');
  if (action === 'complete' || action === 'cancel') {
    if (!['scheduled', 'due'].includes(reminder.status)) fail('REMINDER_STATE_INVALID', 'Reminder is already completed or cancelled');
    reminder.status = action === 'complete' ? 'completed' : 'cancelled';
    reminder.completedAt = new Date(now).toISOString();
  } else if (action === 'snooze' || action === 'update') {
    if (!['scheduled', 'due'].includes(reminder.status)) fail('REMINDER_STATE_INVALID', 'Reminder cannot be rescheduled');
    if (action === 'update' && input.title === undefined && input.dueAt === undefined) fail('REMINDER_ACTION_INVALID', 'Provide a title or due time to update');
    if (action === 'snooze' || input.dueAt !== undefined) reminder.dueAt = futureTime(input.dueAt, now);
    if (action === 'update' && input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title || title.length > 300) fail('REMINDER_TITLE_INVALID', 'Reminder title must contain 1 to 300 characters');
      reminder.title = title;
    }
    reminder.status = 'scheduled'; reminder.firedAt = null;
  } else fail('REMINDER_ACTION_INVALID', 'Unsupported reminder action');
  reminder.updatedAt = new Date(now).toISOString();
  return { reminder };
}

// Claim before attempting delivery. A restart cannot fire the same reminder a
// second time; the UI remains a durable delivery path if desktop notification fails.
export function claimDueReminders(state, now = Date.now()) {
  const claimed = [];
  for (const reminder of state.reminders || []) {
    const due = Date.parse(reminder.dueAt);
    if (reminder.status !== 'scheduled' || !Number.isFinite(due) || due > now) continue;
    reminder.status = 'due'; reminder.firedAt = new Date(now).toISOString();
    reminder.desktopDelivery = 'pending';
    state.activity = [activityEntry('reminder.due', reminder.title, { reminderId: reminder.id }), ...(state.activity || [])].slice(0, 200);
    claimed.push({ id: reminder.id, title: reminder.title, dueAt: reminder.dueAt });
  }
  return claimed;
}

export async function deliverDesktopReminder(reminder, execute = execFileAsync) {
  if (process.platform !== 'linux') return { status: 'unsupported' };
  try {
    await execute('notify-send', ['--app-name=JARVIS', 'JARVIS reminder', reminder.title], { timeout: 5000, windowsHide: true });
    return { status: 'delivered' };
  } catch (error) { return { status: 'unavailable', code: error.code || 'NOTIFY_FAILED' }; }
}
