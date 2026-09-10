// Explicit opt-in live Windows verification. No model/provider credentials used.
import { executeToolCall } from '../server/toolExecutor.js';
import { routeRequest } from '../server/router.js';
const state = { tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} };
const reports = [];
async function call(toolName, args = {}, approvalId) {
  const start = performance.now();
  const result = await executeToolCall({ toolName, arguments: args, approvalId, requestedBy: 'desktop-verification' }, { state, request: `Controlled desktop test: ${toolName}` });
  reports.push({ tool: toolName, status: result.status, verified: result.verified, latencyMs: Math.round(performance.now() - start), error: result.error?.code });
  return result;
}
let createdWindow;
const appName = process.argv[2] || 'Calculator';
try {
  const before = await call('windows.list');
  if (!before.verified) throw new Error('Window baseline failed');
  const index = await call('apps.search', { query: appName });
  console.log(JSON.stringify({ discoveredMatches: index.output?.apps?.map(({name,confidence}) => ({name,confidence})) }));
  const route = routeRequest(`Open ${appName}`);
  const opened = await call(route.capability, route.args);
  if (!opened.verified) throw new Error(opened.error?.message || 'Launch verification failed');
  const evidence = opened.output.verification.windows;
  createdWindow = evidence.find((window) => !before.output.windows.some((old) => old.handle === window.handle));
  if (createdWindow) {
    const minimized = await call('windows.minimize', { target: createdWindow.handle });
    const restored = await call('windows.restore', { target: createdWindow.handle });
    if (!minimized.verified || !restored.verified) throw new Error('Window mutation not verified');
  }
} catch (error) { console.log(JSON.stringify({ failure: error.message })); process.exitCode = 1; }
finally {
  if (createdWindow) {
    const pending = await call('windows.close', { target: createdWindow.handle });
    if (pending.approval) { pending.approval.status = 'approved'; await call('windows.close', { target: createdWindow.handle }, pending.approval.id); }
  }
  console.log(JSON.stringify({ reports, runs: state.runs.length, scope: 'real Windows bridge; isolated in-memory Runs; no external services' }));
}
