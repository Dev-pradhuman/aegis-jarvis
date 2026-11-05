import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { listTools } from './registry.js';
import { unattendedTools } from './toolPolicy.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Returns formatted MCP tool definitions from JARVIS's tool registry.
 */
export function getMcpToolDefinitions() {
  const tools = unattendedTools ? unattendedTools() : listTools();
  const mcpTools = [];
  const seen = new Set();

  for (const t of tools) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      mcpTools.push({
        name: t.id,
        description: t.description || `JARVIS ${t.id} tool`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} }
      });
    }
    const underName = t.id.replace(/\./g, '_');
    if (underName !== t.id && !seen.has(underName)) {
      seen.add(underName);
      mcpTools.push({
        name: underName,
        description: t.description || `JARVIS ${t.id} tool`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} }
      });
    }
  }
  return mcpTools;
}

/**
 * Generates and updates MCP configuration for OpenCode and agy CLI agents.
 */
export async function ensureMcpConfig(projectRoot = DEFAULT_PROJECT_ROOT) {
  const scriptPath = path.resolve(projectRoot, 'scripts/jarvis-mcp-stdio.mjs');
  const results = { opencode: false, agy: false };

  // 1. Update opencode.json and .opencode.json
  const configFiles = [
    path.join(projectRoot, 'opencode.json'),
    path.join(projectRoot, '.opencode.json')
  ];

  for (const file of configFiles) {
    try {
      let cfg = {};
      if (fs.existsSync(file)) {
        try {
          cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
          cfg = {};
        }
      }

      cfg.mcp ??= {};
      cfg.mcp.servers ??= {};
      cfg.mcp.servers.jarvis = {
        type: 'local',
        command: ['node', scriptPath]
      };

      fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      results.opencode = true;
    } catch (err) {
      console.warn(`[mcpBridge] Failed to write ${file}:`, err.message);
    }
  }

  // 2. Configure agy MCP if agy CLI is present
  try {
    const agyBin = process.env.AGY_BIN || 'agy';
    const { stdout: listOut } = await execFileAsync(agyBin, ['mcp', 'list']).catch(() => ({ stdout: '' }));
    if (!listOut.includes('jarvis')) {
      await execFileAsync(agyBin, ['mcp', 'add', 'jarvis', 'node', scriptPath]).catch((err) => {
        console.warn('[mcpBridge] agy mcp add failed:', err.message);
      });
    }
    results.agy = true;
  } catch (err) {
    // agy not installed or failed, not fatal
    results.agy = false;
  }

  return results;
}
