import { listTools } from './registry.js';

const unattendedAllowedIds = new Set([
  'tasks.list', 'tasks.manage', 'reminders.list', 'reminders.create', 'reminders.update', 'reminders.snooze', 'reminders.complete', 'reminders.cancel',
  'memory.search', 'runtime.telemetry', 'diagnostics',
  'models.list', 'projects.status', 'mcp.servers', 'browser.status', 'project.inspect', 'computer.capabilities',
  'audio.get_volume', 'audio.set_volume', 'audio.mute', 'audio.unmute', 'audio.volume_up', 'audio.volume_down',
  'media.status', 'media.play', 'media.pause', 'media.toggle', 'media.next', 'media.previous',
  'windows.list', 'windows.get_active', 'windows.focus',
  'apps.list', 'apps.open', 'browser.navigate', 'browser.read', 'browser.screenshot', 'browser.handoff',
  'gmail.latest', 'calendar.upcoming', 'composio.read',
  'screen.describe', 'camera.describe', 'clipboard.read', 'clipboard.write', 'files.read',
]);

const modelApprovalGatedIds = new Set([
  'calendar.create', 'gmail.send'
]);

export function unattendedTools(state = {}) {
  const customDenies = new Set(
    (state?.approvalPolicy?.mode === 'CUSTOM' && Array.isArray(state?.approvalPolicy?.rules))
      ? state.approvalPolicy.rules.filter((r) => r.effect === 'deny' && !r.appId && !r.deviceId && !r.destination && !r.runId).map((r) => r.toolId)
      : []
  );
  return listTools().filter((tool) =>
    tool.enabled &&
    unattendedAllowedIds.has(tool.id) &&
    !tool.requiresApproval &&
    !customDenies.has(tool.id)
  );
}

export function unattendedTool(id, state = {}) {
  return unattendedTools(state).find((tool) => tool.id === id) || null;
}

export function modelCallableTools(state = {}) {
  const customDenies = new Set(
    (state?.approvalPolicy?.mode === 'CUSTOM' && Array.isArray(state?.approvalPolicy?.rules))
      ? state.approvalPolicy.rules.filter((r) => r.effect === 'deny' && !r.appId && !r.deviceId && !r.destination && !r.runId).map((r) => r.toolId)
      : []
  );
  return listTools().filter((tool) =>
    tool.enabled &&
    (unattendedAllowedIds.has(tool.id) || modelApprovalGatedIds.has(tool.id)) &&
    !customDenies.has(tool.id)
  );
}
