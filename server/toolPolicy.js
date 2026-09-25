import { listTools } from './registry.js';

const unattendedReadIds = new Set([
  'tasks.list', 'memory.search', 'runtime.telemetry', 'diagnostics',
  'models.list', 'projects.status', 'mcp.servers', 'browser.status', 'project.inspect', 'computer.capabilities',
]);

export function unattendedTools() {
  return listTools().filter((tool) => tool.enabled && unattendedReadIds.has(tool.id) && !tool.sideEffects && !tool.requiresApproval);
}

export function unattendedTool(id) {
  return unattendedTools().find((tool) => tool.id === id) || null;
}
