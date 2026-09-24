import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composioActionHash, composioToolRisk, executeComposioTool } from './composioAdapter.js';
import { osPlatform } from './platform/index.js';
import { browserManager } from './browser/index.js';
import { listProjectStatus } from './projectIntelligence.js';
import { callMcpTool, discoverMcpServers, mcpActionHash } from './mcpDiscovery.js';
import { modelRegistry } from './modelRouting.js';
import { publicPools } from './modelPool.js';
import { messageActionHash, sendMessage } from './liveAdapters.js';
import { planGroundedResearch } from './researchWorkflow.js';

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const blockedRoots = new Set(['node_modules', 'dist', '.git', 'server/data']);

function safePath(input = '.') {
  const candidate = path.resolve(workspaceRoot, input);
  if (candidate !== workspaceRoot && !candidate.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error('Path is outside the JARVIS workspace');
  return candidate;
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

export async function executeTool(toolId, input = {}, context = {}) {
  if (toolId === 'projects.status') return { ok: true, toolId, data: { projects: await listProjectStatus() } };
  if (toolId === 'models.list') return { ok: true, toolId, data: { models: modelRegistry(), providerPools: publicPools() } };
  if (toolId === 'research.plan') { const data = await planGroundedResearch(input); return { ok: data.status === 'sources_collected', toolId, data }; }
  if (toolId === 'mcp.servers') return { ok: true, toolId, data: { servers: await discoverMcpServers() } };
  if (toolId === 'mcp.call') {
    const approval = context.approval;
    if (!approval || approval.status !== 'approved' || approval.toolName !== 'mcp.call' || approval.actionHash !== mcpActionHash(input) || approval.consumedAt || Date.parse(approval.expiresAt || 0) <= Date.now()) throw new Error('MCP calls require current approval bound to the exact server, tool and arguments');
    const data = await callMcpTool(input, { fetchImpl: context.fetchImpl || fetch });
    return { ok: !data.isError, toolId, data };
  }
  if (toolId === 'messages.send') {
    const approval = context.approval;
    if (!approval || approval.status !== 'approved' || approval.toolName !== 'messages.send' || approval.actionHash !== messageActionHash(input) || approval.consumedAt || Date.parse(approval.expiresAt || 0) <= Date.now()) throw new Error('Message sending requires current approval bound to the exact recipient and content');
    const data = await sendMessage(input);
    return { ok: Boolean(data.delivered), toolId, data };
  }
  if (toolId.startsWith('browser.')) {
    if (toolId === 'browser.status') return { ok: true, toolId, data: browserManager.getStatus() };
    if (toolId === 'browser.evaluate' && context.approval?.status !== 'approved') throw new Error('This tool requires an approved approvalId');
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
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Requested path is not a file');
    if (info.size > 1_000_000) throw new Error('File exceeds the 1 MB read limit');
    return { ok: true, toolId, data: { path: path.relative(workspaceRoot, file).replaceAll('\\', '/'), content: await readFile(file, 'utf8'), bytes: info.size } };
  }
  if (toolId === 'command.execute') {
    if (context.approval?.status !== 'approved') throw new Error('This tool requires an approved approvalId');
    const command = String(input.command || '').trim();
    if (!command || /[;&|`<>]/.test(command)) throw new Error('Only a single executable command without shell operators is allowed');
    const [executable, ...args] = command.split(/\s+/);
    const result = await execFileAsync(executable, args, { cwd: workspaceRoot, timeout: 30_000, windowsHide: true, maxBuffer: 1_000_000 });
    return { ok: true, toolId, data: { stdout: result.stdout, stderr: result.stderr, code: 0 } };
  }
  if (toolId === 'composio.execute') {
    if (composioToolRisk(input.toolSlug) !== 'READ_ONLY') {
      const approval = context.approval;
      if (!approval || approval.status !== 'approved' || approval.toolName !== 'composio.execute' || approval.actionHash !== composioActionHash(input) || approval.consumedAt || Date.parse(approval.expiresAt || 0) <= Date.now()) throw new Error('This external Composio action requires a current approval bound to its exact arguments');
    }
    const result = await executeComposioTool(input, context.fetchImpl || fetch);
    if (!result.successful) throw new Error(result.error || 'Composio tool execution failed');
    return { ok: true, toolId, data: result.data, meta: { toolSlug: result.toolSlug, logId: result.logId } };
  }
  throw new Error(`Unknown or unavailable tool: ${toolId}`);
}
