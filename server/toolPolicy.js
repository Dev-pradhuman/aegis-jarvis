import { listTools } from './registry.js';

const unattendedAllowedIds = new Set([
  'tasks.list', 'reminders.list', 'memory.search', 'runtime.telemetry', 'diagnostics',
  'models.list', 'projects.status', 'mcp.servers', 'browser.status', 'project.inspect', 'computer.capabilities',
  'audio.get_volume', 'audio.set_volume', 'media.status', 'windows.list', 'windows.get_active', 'windows.focus',
  'apps.list', 'apps.open', 'browser.navigate', 'browser.read', 'browser.screenshot',
  'gmail.latest', 'calendar.upcoming', 'composio.read',
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
