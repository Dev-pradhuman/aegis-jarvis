#!/usr/bin/env python3

with open('server/scheduler.js', 'r') as f:
    content = f.read()

imports = """
import { runWorkflow } from './workflowEngine.js';
import { claimDueReminders, deliverDesktopReminder } from './reminders.js';
"""
content = content.replace("import { runWorkflow } from './workflowEngine.js';", imports)

tick_fn = """
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
"""
content = content.replace("""
export async function tick(state, now = Date.now(), options = {}) {
  const runs = [];
  for (const workflow of state.workflows || []) if (due(workflow, now)) runs.push(await runWorkflow(state, workflow, { ...options, maxRetries: workflow.schedule.maxRetries || 0 }));
  return runs;
}
""", tick_fn)

with open('server/scheduler.js', 'w') as f:
    f.write(content)
