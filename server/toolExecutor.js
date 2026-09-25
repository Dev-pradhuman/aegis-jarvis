import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composioActionHash, composioToolRisk, executeComposioTool } from './composioAdapter.js';
import { osPlatform } from './platform/index.js';
import { computerCapabilities } from './platform/capabilities.js';
import { browserManager } from './browser/index.js';
import { listProjectStatus } from './projectIntelligence.js';
import { callMcpTool, discoverMcpServers, mcpActionHash } from './mcpDiscovery.js';
import { modelRegistry } from './modelRouting.js';
import { publicPools } from './modelPool.js';
import { calendarRequest, messageActionHash, sendMessage } from './liveAdapters.js';
import { planGroundedResearch } from './researchWorkflow.js';
import { getTool } from './registry.js';
import { validateToolInput, validateToolOutput } from './toolSchema.js';
import { actionFingerprint } from './idempotency.js';
import { diagnostics, researchSearch, searchMemory } from './systemModules.js';
import { generateMedia } from './mediaGeneration.js';

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const blockedRoots = new Set(['node_modules', 'dist', '.git', 'server/data']);

function safePath(input = '.') {
  const candidate = path.resolve(workspaceRoot, input);
  if (candidate !== workspaceRoot && !candidate.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error('Path is outside the JARVIS workspace');
  return candidate;
}

function protectedFile(relative) {
  return relative.split('/').some((part) => ['.git', 'node_modules', '.env'].includes(part) || /^\.env\./.test(part) && part !== '.env.example' || /\.(pem|key|p12|pfx)$/i.test(part)) || relative.startsWith('server/data/');
}

async function inspectDirectory(root, relative = '.', depth = 0) {
  if (depth > 2) return [];
  const current = safePath(relative);
  const entries = await readdir(current, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || blockedRoots.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push({ path: child.replaceAll('\\', '/'), type: 'directory', children: await inspectDirectory(root, child, depth + 1) });
    else result.push({ path: child.replaceAll('\\', '/'), type: 'file' });
  }
  return result;
}

export const implementedToolIds = [
  'projects.status', 'models.list', 'research.plan', 'mcp.servers', 'mcp.call',
  'messages.send', 'browser.open', 'browser.navigate', 'browser.click', 'browser.type',
  'browser.read', 'browser.content', 'browser.accessibility', 'browser.screenshot',
  'browser.wait', 'browser.evaluate', 'browser.status', 'browser.handoff',
  'browser.resume', 'browser.close', 'apps.list', 'apps.open', 'project.inspect',
  'files.read', 'command.execute', 'composio.execute', 'tasks.list', 'tasks.manage',
  'memory.search', 'runtime.telemetry', 'diagnostics', 'gmail.latest',
  'media.generate', 'research.search', 'calendar.create', 'audio.get_volume',
  'audio.set_volume', 'audio.volume_up', 'audio.volume_down', 'audio.mute', 'audio.unmute',
  'media.status', 'media.play', 'media.pause', 'media.toggle', 'media.next', 'media.previous',
  'clipboard.read', 'clipboard.write', 'computer.capabilities', 'computer.keypress', 'computer.type', 'screen.capture',
];

function requireExactApproval(toolId, input, approval, runId = null, hash = actionFingerprint(toolId, input)) {
  if (!approval || approval.status !== 'approved' || approval.toolName !== toolId ||
      approval.actionHash !== hash || approval.consumedAt ||
      Date.parse(approval.expiresAt || 0) <= Date.now() ||
      (approval.runId || null) !== (runId || null)) {
    throw new Error(`This tool requires an approved approvalId bound to the exact ${toolId} action`);
  }
}

async function runTool(toolId, input = {}, context = {}) {
  if (toolId === 'tasks.list') return { ok: true, toolId, data: { tasks: context.state?.tasks || [] } };
  if (toolId === 'tasks.manage') {
    if (!context.state) throw new Error('Task state is unavailable');
    const tasks = context.state.tasks ||= [];
    if (input.id) {
      const task = tasks.find((item) => item.id === input.id);
      if (!task) throw new Error('Task not found');
      if (input.title !== undefined) task.title = input.title;
      if (input.status !== undefined) task.status = input.status;
      task.updatedAt = new Date().toISOString();
      return { ok: true, toolId, data: { task } };
    }
    if (!input.title) throw new Error('Task title is required');
    const task = { id: `task-${crypto.randomUUID()}`, title: input.title, status: input.status || 'pending', createdAt: new Date().toISOString() };
    tasks.unshift(task);
    return { ok: true, toolId, data: { task } };
  }
  if (toolId === 'memory.search') return { ok: true, toolId, data: { results: searchMemory(context.state?.memories || [], input.query) } };
  if (toolId === 'runtime.telemetry') return { ok: true, toolId, data: { telemetry: context.state?.telemetry || {}, runtime: context.state?.runtime || {} } };
  if (toolId === 'diagnostics') return { ok: true, toolId, data: diagnostics(context.state || {}) };
  if (toolId === 'gmail.latest') {
    const result = await executeComposioTool({ toolSlug: 'GMAIL_FETCH_EMAILS', arguments: { user_id: 'me', max_results: input.limit || 10, verbose: false, include_payload: false, label_ids: ['INBOX'] } }, context.fetchImpl || fetch);
    if (!result.successful) throw new Error(result.error || 'Gmail request failed');
    return { ok: true, toolId, data: result.data };
  }
  if (toolId === 'calendar.create') {
    requireExactApproval(toolId, input, context.approval, context.runId);
    const data = await calendarRequest('POST', input.payload);
    return { ok: Boolean(data.configured), toolId, data };
  }
  if (toolId === 'media.generate') return { ok: true, toolId, data: await generateMedia(input.kind, input.prompt, context.fetchImpl || fetch) };
  if (toolId === 'research.search') return { ok: true, toolId, data: await researchSearch(input.query) };
  if (toolId === 'audio.get_volume') return { ok: true, toolId, data: await osPlatform.audio.getVolume() };
  if (toolId === 'audio.set_volume') return { ok: true, toolId, data: await osPlatform.audio.setVolume(input.volume) };
  if (toolId === 'audio.volume_up') return { ok: true, toolId, data: await osPlatform.audio.volumeUp(input.step || 5) };
  if (toolId === 'audio.volume_down') return { ok: true, toolId, data: await osPlatform.audio.volumeDown(input.step || 5) };
  if (toolId === 'audio.mute') return { ok: true, toolId, data: await osPlatform.audio.setMuted(true) };
  if (toolId === 'audio.unmute') return { ok: true, toolId, data: await osPlatform.audio.setMuted(false) };
  if (toolId === 'clipboard.read') return { ok: true, toolId, data: await osPlatform.clipboard.read() };
  if (toolId === 'clipboard.write') return { ok: true, toolId, data: await osPlatform.clipboard.write(input.text) };
  if (toolId === 'computer.capabilities') return { ok: true, toolId, data: await computerCapabilities() };
  if (toolId === 'computer.keypress' || toolId === 'computer.type') {
    if (!getTool(toolId)?.enabled) throw new Error('Desktop input requires JARVIS_DESKTOP_INPUT=1 and JARVIS_AUTH_TOKEN');
    requireExactApproval(toolId, input, context.approval, context.runId);
    const data = toolId === 'computer.keypress' ? await osPlatform.input.keypress(input.keys) : await osPlatform.input.type(input.text);
    return { ok: data.sent > 0, toolId, data };
  }
  if (toolId === 'screen.capture') return { ok: true, toolId, data: await osPlatform.screen.capture(input) };
  if (toolId === 'media.status') return { ok: true, toolId, data: await osPlatform.media.status(input.player) };
  if (toolId.startsWith('media.') && toolId !== 'media.generate') {
    const action = toolId.split('.')[1];
    const data = await osPlatform.media[action](input.player);
    return { ok: data.verified === true, toolId, data };
  }
  if (toolId === 'projects.status') return { ok: true, toolId, data: { projects: await listProjectStatus() } };
  if (toolId === 'models.list') return { ok: true, toolId, data: { models: modelRegistry(), providerPools: publicPools() } };
  if (toolId === 'research.plan') { const data = await planGroundedResearch(input); return { ok: data.status === 'sources_collected', toolId, data }; }
  if (toolId === 'mcp.servers') return { ok: true, toolId, data: { servers: await discoverMcpServers() } };
  if (toolId === 'mcp.call') {
    requireExactApproval(toolId, input, context.approval, context.runId, mcpActionHash(input));
    const data = await callMcpTool(input, { fetchImpl: context.fetchImpl || fetch });
    return { ok: !data.isError, toolId, data };
  }
  if (toolId === 'messages.send') {
    requireExactApproval(toolId, input, context.approval, context.runId, messageActionHash(input));
    const data = await sendMessage(input);
    return { ok: Boolean(data.delivered), toolId, data };
  }
  if (toolId.startsWith('browser.')) {
    if (toolId === 'browser.status') return { ok: true, toolId, data: browserManager.getStatus() };
    if (toolId === 'browser.evaluate') requireExactApproval(toolId, input, context.approval, context.runId);
    const actions = {
      'browser.open': () => browserManager.navigate(input.url),
      'browser.navigate': () => browserManager.navigate(input.url, { mode: input.mode }),
      'browser.click': () => browserManager.click(input.selector, { mode: input.mode }),
      'browser.type': () => browserManager.type(input.selector, input.text),
      'browser.read': () => browserManager.read(),
      'browser.content': () => browserManager.getPageContent(),
      'browser.accessibility': () => browserManager.getAccessibilityTree(),
      'browser.screenshot': () => browserManager.screenshot(),
      'browser.wait': () => browserManager.waitFor(input.selector, input.timeout),
      'browser.evaluate': () => browserManager.evaluate(input.code),
      'browser.handoff': () => browserManager.handoff(),
      'browser.resume': () => browserManager.resume(),
      'browser.close': () => browserManager.close(),
    };
    if (actions[toolId]) { const data = await actions[toolId](); return { ok: !data.humanActionRequired, toolId, data }; }
  }
  if (toolId === 'apps.list') return { ok: true, toolId, data: { apps: await osPlatform.apps.list(), platform: osPlatform.os } };
  if (toolId === 'apps.open') {
    const name = String(input.name || '').trim();
    if (!name || name.length > 120) throw new Error('Application name must contain 1 to 120 characters');
    const result = await osPlatform.apps.open(name);
    return { ok: result.status === 'launched', toolId, data: result };
  }
  if (toolId === 'project.inspect') return { ok: true, toolId, data: { root: workspaceRoot, entries: await inspectDirectory(workspaceRoot) } };
  if (toolId === 'files.read') {
    const file = safePath(input.path);
    if (protectedFile(path.relative(workspaceRoot, file).replaceAll('\\', '/'))) throw new Error('Requested file is protected');
    const actual = await realpath(file);
    if (actual !== workspaceRoot && !actual.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error('Path is outside the JARVIS workspace');
    const relative = path.relative(workspaceRoot, actual).replaceAll('\\', '/');
    if (protectedFile(relative)) throw new Error('Requested file is protected');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Requested path is not a file');
    if (info.size > 1_000_000) throw new Error('File exceeds the 1 MB read limit');
    return { ok: true, toolId, data: { path: relative, content: await readFile(actual, 'utf8'), bytes: info.size } };
  }
  if (toolId === 'command.execute') {
    const command = String(input.command || '').trim();
    if (!command || /[;&|`<>]/.test(command)) throw new Error('Only a single executable command without shell operators is allowed');
    requireExactApproval(toolId, input, context.approval, context.runId);
    const [executable, ...args] = command.split(/\s+/);
    const result = await execFileAsync(executable, args, { cwd: workspaceRoot, timeout: 30_000, windowsHide: true, maxBuffer: 1_000_000 });
    return { ok: true, toolId, data: { stdout: result.stdout, stderr: result.stderr, code: 0 } };
  }
  if (toolId === 'composio.execute') {
    if (composioToolRisk(input.toolSlug) !== 'READ_ONLY') {
      requireExactApproval(toolId, input, context.approval, context.runId, composioActionHash(input));
    }
    const result = await executeComposioTool(input, context.fetchImpl || fetch);
    if (!result.successful) throw new Error(result.error || 'Composio tool execution failed');
    return { ok: true, toolId, data: result.data, meta: { toolSlug: result.toolSlug, logId: result.logId } };
  }
  throw new Error(`Unknown or unavailable tool: ${toolId}`);
}

export async function executeTool(toolId, input = {}, context = {}) {
  const tool = getTool(toolId);
  if (!tool || !implementedToolIds.includes(toolId)) throw new Error(`Unknown or unavailable tool: ${toolId}`);
  validateToolInput(tool.inputSchema, input);
  const result = await runTool(toolId, input, context);
  return validateToolOutput(tool.outputSchema, result);
}
