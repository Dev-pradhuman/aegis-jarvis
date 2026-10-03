
import { runWorkflow } from './workflowEngine.js';
import { claimDueReminders, deliverDesktopReminder } from './reminders.js';


function matchSegment(val, expr) {
  if (expr === '*') return true;
  if (expr.startsWith('*/')) return val % parseInt(expr.slice(2), 10) === 0;
  return expr.split(',').some(part => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return val >= start && val <= end;
    }
    return val === parseInt(part, 10);
  });
}

export function matchCron(cronStr, timeMs, timezone = 'UTC') {
  const d = new Date(timeMs);
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hourCycle: 'h23'
  });
  
  const formatted = formatter.formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  
  const min = parseInt(formatted.minute, 10);
  const hr = parseInt(formatted.hour, 10);
  const dom = parseInt(formatted.day, 10);
  const mon = parseInt(formatted.month, 10);
  
  const tzDate = new Date(Date.UTC(parseInt(formatted.year, 10), mon - 1, dom));
  let dow = tzDate.getUTCDay();
  
  return matchSegment(min, parts[0]) &&
         matchSegment(hr, parts[1]) &&
         matchSegment(dom, parts[2]) &&
         matchSegment(mon, parts[3]) &&
         (parts[4] === '*' || matchSegment(dow, parts[4]) || (dow === 0 && matchSegment(7, parts[4])));
}

export function due(workflow, now = Date.now()) {
  const schedule = workflow.schedule;
  if (!schedule?.enabled || workflow.state !== 'active' || workflow.lastRun?.state === 'waiting_approval') return false;
  const last = workflow.lastRun?.finishedAt ? Date.parse(workflow.lastRun.finishedAt) : 0;
  
  if (schedule.cron) {
    if (now - last < 60000) return false;
    const lastMin = Math.floor(last / 60000);
    const nowMin = Math.floor(now / 60000);
    if (lastMin === nowMin) return false;
    
    const start = Math.max(last, now - 24 * 60 * 60 * 1000);
    const minStart = Math.floor(start / 60000) * 60000;
    const minEnd = nowMin * 60000;
    for (let t = minEnd; t > minStart; t -= 60000) {
      if (matchCron(schedule.cron, t, schedule.timezone || 'UTC')) return true;
    }
    return false;
  }
  
  if (schedule.intervalSeconds) {
    return now - last >= Number(schedule.intervalSeconds) * 1000;
  }
  
  return false;
}

export async function tick(state, now = Date.now(), options = {}) {
  const runs = [];
  
  // 1. Process due workflows
  for (const workflow of state.workflows || []) {
    if (due(workflow, now)) {
      runs.push(await runWorkflow(state, workflow, { ...options, maxRetries: workflow.schedule.maxRetries || 0 }));
    }
  }
  
  // 2. Process due reminders
  const dueReminders = claimDueReminders(state, now);
  for (const reminder of dueReminders) {
    const result = await deliverDesktopReminder(reminder);
    const stored = (state.reminders || []).find(r => r.id === reminder.id);
    if (stored) stored.desktopDelivery = result.status;
  }
  
  return runs;
}
