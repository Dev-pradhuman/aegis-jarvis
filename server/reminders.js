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
    const category = ['timer', 'alarm', 'reminder'].includes(input.category) ? input.category : 'reminder';
    const repeat = ['daily', 'weekly', 'none'].includes(input.repeat) ? input.repeat : 'none';
    const reminder = {
      id: `reminder-${crypto.randomUUID()}`,
      title,
      dueAt: futureTime(input.dueAt, now),
      category,
      repeat,
      ringing: false,
      status: 'scheduled',
      createdAt: new Date(now).toISOString(),
      firedAt: null,
      triggeredAt: null,
      completedAt: null
    };
    state.reminders.unshift(reminder);
    return { reminder };
  }
  let reminderIndex = -1;
  if (input.id) {
    reminderIndex = state.reminders.findIndex((item) => item.id === input.id);
  } else {
    reminderIndex = state.reminders.findIndex((item) => item.status === 'due' && item.ringing);
    if (reminderIndex === -1) {
      reminderIndex = state.reminders.findIndex((item) => item.status === 'due');
    }
    if (reminderIndex === -1) {
      reminderIndex = state.reminders.findIndex((item) => item.status === 'scheduled');
    }
  }
  if (reminderIndex === -1) fail('REMINDER_NOT_FOUND', 'Reminder does not exist');
  const reminder = state.reminders[reminderIndex];

  if (action === 'delete') {
    state.reminders.splice(reminderIndex, 1);
    return { deleted: true, id: input.id };
  }

  if (action === 'complete' || action === 'cancel' || action === 'dismiss') {
    if (!['scheduled', 'due'].includes(reminder.status)) fail('REMINDER_STATE_INVALID', 'Reminder is already completed, dismissed, or cancelled');
    reminder.ringing = false;
    reminder.status = action === 'complete' ? 'completed' : action === 'dismiss' ? 'dismissed' : 'cancelled';
    reminder.completedAt = new Date(now).toISOString();
  } else if (action === 'snooze' || action === 'update') {
    if (!['scheduled', 'due'].includes(reminder.status)) fail('REMINDER_STATE_INVALID', 'Reminder cannot be rescheduled');
    if (action === 'update' && input.title === undefined && input.dueAt === undefined && input.category === undefined) {
      fail('REMINDER_ACTION_INVALID', 'Provide a title, due time, or category to update');
    }
    if (action === 'snooze') {
      const minutes = Number(input.snoozeMinutes || 10);
      const snoozeTarget = input.dueAt || new Date(now + Math.max(1, minutes) * 60_000).toISOString();
      reminder.dueAt = futureTime(snoozeTarget, now);
      reminder.ringing = false;
    } else if (input.dueAt !== undefined) {
      reminder.dueAt = futureTime(input.dueAt, now);
    }
    if (action === 'update' && input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title || title.length > 300) fail('REMINDER_TITLE_INVALID', 'Reminder title must contain 1 to 300 characters');
      reminder.title = title;
    }
    if (action === 'update' && input.category !== undefined) {
      reminder.category = ['timer', 'alarm', 'reminder'].includes(input.category) ? input.category : reminder.category;
    }
    reminder.status = 'scheduled';
    reminder.ringing = false;
    reminder.firedAt = null;
  } else fail('REMINDER_ACTION_INVALID', 'Unsupported reminder action');
  reminder.updatedAt = new Date(now).toISOString();
  return { reminder };
}

// Returns active ringing reminders
export function getRingingReminders(state) {
  return (state.reminders || []).filter((r) => r.status === 'due' && r.ringing === true);
}

// Claim before attempting delivery. A restart cannot fire the same reminder a
// second time; the UI remains a durable delivery path if desktop notification fails.
export function claimDueReminders(state, now = Date.now()) {
  const claimed = [];
  for (const reminder of state.reminders || []) {
    const due = Date.parse(reminder.dueAt);
    if (reminder.status !== 'scheduled' || !Number.isFinite(due) || due > now) continue;
    reminder.status = 'due';
    reminder.ringing = true;
    reminder.triggeredAt = new Date(now).toISOString();
    reminder.firedAt = new Date(now).toISOString();
    reminder.desktopDelivery = 'pending';
    state.activity = [activityEntry('reminder.due', reminder.title, { reminderId: reminder.id }), ...(state.activity || [])].slice(0, 200);
    claimed.push({ id: reminder.id, title: reminder.title, dueAt: reminder.dueAt, category: reminder.category || 'reminder' });
  }
  return claimed;
}

export async function deliverDesktopReminder(reminder, options = {}) {
  const execute = typeof options === 'function' ? options : (options.execute || execFileAsync);
  const voicePipeline = typeof options === 'object' ? options.voicePipeline : null;

  if (process.platform !== 'linux') return { status: 'unsupported' };
  try {
    const alertPrefix = reminder.category === 'timer' ? '⏱️ JARVIS Timer' : reminder.category === 'alarm' ? '⏰ JARVIS Alarm' : '🔔 JARVIS Reminder';
    await execute('notify-send', ['--app-name=JARVIS', '-u', 'critical', alertPrefix, reminder.title], { timeout: 5000, windowsHide: true });
    
    // Pop dynamic island in Hyprland if script exists
    if (process.env.HYPRLAND_INSTANCE_SIGNATURE || process.env.WAYLAND_DISPLAY) {
      try {
        execute('/home/pradhuman/projects/aegis-jarvis/scripts/jarvis-island.sh', ['show'], { timeout: 4000 }).catch(() => {});
      } catch {}
    }

    // Speak proactive TTS alert if voice pipeline is available
    if (voicePipeline?.speak) {
      try {
        const spokenMsg = reminder.category === 'timer' ? `Timer complete: ${reminder.title}` : `Reminder: ${reminder.title}`;
        voicePipeline.speak(spokenMsg).catch(() => {});
      } catch {}
    }

    return { status: 'delivered' };
  } catch (error) { return { status: 'unavailable', code: error.code || 'NOTIFY_FAILED' }; }
}
