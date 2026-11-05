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

export const DEFAULT_CLI_HOME = path.resolve(process.env.HOME || '/home/pradhuman', '.jarvis-cli-profile/home');
export const DEFAULT_CLI_WORKSPACE = path.resolve(process.env.HOME || '/home/pradhuman', '.jarvis-cli-profile/workspace');

/**
 * Ensures ~/.jarvis-cli-profile/home and workspace exist,
 * copies ONLY authentication files while strictly excluding all skills and plugins,
 * and configures agy with only the jarvis MCP server.
 */
export async function ensureIsolatedAgyProfile(options = {}) {
  const homeDir = options.homeDir || DEFAULT_CLI_HOME;
  const workspaceDir = options.workspaceDir || DEFAULT_CLI_WORKSPACE;
  const projectRoot = options.projectRoot || DEFAULT_PROJECT_ROOT;
  const realHome = process.env.HOME || '/home/pradhuman';

  // 1. Create directories
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  // 2. Ensure NO .agents directory or skills in homeDir
  const disallowed = [
    path.join(homeDir, '.agents'),
    path.join(homeDir, '.gemini', 'skills'),
    path.join(homeDir, '.gemini', 'config', 'plugins'),
    path.join(homeDir, '.gemini', 'config', 'skills'),
    path.join(homeDir, '.gemini', 'extensions'),
    path.join(homeDir, 'AGENTS.md'),
    path.join(homeDir, 'GEMINI.md'),
    path.join(homeDir, '.gemini', 'AGENTS.md'),
    path.join(homeDir, '.gemini', 'GEMINI.md')
  ];
  for (const p of disallowed) {
    if (fs.existsSync(p)) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  }

  // 3. Copy ONLY auth/settings from real ~/.gemini/antigravity-cli to isolated home
  const realCliDir = path.join(realHome, '.gemini', 'antigravity-cli');
  const isolatedCliDir = path.join(homeDir, '.gemini', 'antigravity-cli');
  fs.mkdirSync(isolatedCliDir, { recursive: true });

  const authFiles = [
    'antigravity-oauth-token',
    'installation_id',
    'jetski_state.pbtxt'
  ];

  for (const file of authFiles) {
    const src = path.join(realCliDir, file);
    const dst = path.join(isolatedCliDir, file);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, dst);
        fs.chmodSync(dst, 0o600);
      } catch (err) {
        console.warn(`[mcpBridge] Failed to copy ${file}:`, err.message);
      }
    }
  }

  // Copy bin directory if it has binaries
  const realBinDir = path.join(realCliDir, 'bin');
  const isolatedBinDir = path.join(isolatedCliDir, 'bin');
  if (fs.existsSync(realBinDir)) {
    try {
      fs.cpSync(realBinDir, isolatedBinDir, { recursive: true });
    } catch {}
  }

  // 4. Write optimized settings.json for agy
  const settingsFile = path.join(isolatedCliDir, 'settings.json');
  const settingsContent = {
    agentMode: 'accept-edits',
    model: 'gemini-3.8-flash-low',
    trustedWorkspaces: [workspaceDir],
    systemInstruction: 'You are JARVIS. Reply in 1-2 concise sentences suitable for spoken TTS.'
  };
  fs.writeFileSync(settingsFile, JSON.stringify(settingsContent, null, 2) + '\n', 'utf8');

  // 5. Ensure ONLY jarvis MCP server is registered in isolated home
  const scriptPath = path.resolve(projectRoot, 'scripts/jarvis-mcp-stdio.mjs');
  const agyBin = process.env.AGY_BIN || 'agy';
  const customEnv = {
    ...process.env,
    HOME: homeDir,
    PATH: process.env.PATH || '',
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || '',
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '',
    DISPLAY: process.env.DISPLAY || '',
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || ''
  };

  try {
    const { stdout: listOut } = await execFileAsync(agyBin, ['mcp', 'list'], { env: customEnv }).catch(() => ({ stdout: '' }));
    if (!listOut.includes('jarvis')) {
      await execFileAsync(agyBin, ['mcp', 'add', 'jarvis', 'node', scriptPath], { env: customEnv }).catch((err) => {
        console.warn('[mcpBridge] agy mcp add failed in isolated home:', err.message);
      });
    }
  } catch (err) {
    console.warn('[mcpBridge] agy MCP setup warning:', err.message);
  }

  return { homeDir, workspaceDir, ok: true };
}

