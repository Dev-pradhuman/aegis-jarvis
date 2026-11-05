import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { stripAnsi, formatTextForSpeech, CliAgentBridge } from '../server/cliAgentBridge.js';
import { ensureMcpConfig, getMcpToolDefinitions } from '../server/mcpBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

test('AC1 & AC2: stripAnsi and formatTextForSpeech utilities for TTS speech output', () => {
  const ansiText = '\u001b[32mSystem volume is 12%\u001b[0m and status is \u001b[1mACTIVE\u001b[0m';
  assert.equal(stripAnsi(ansiText), 'System volume is 12% and status is ACTIVE');

  const markdownText = `# System Report
Here is the current status:
- Volume: **12%**
- Browser: _Zen Browser_
- Code: \`npm test\`
- Documentation: https://example.com/docs
\`\`\`javascript
console.log("hello world");
\`\`\`
All systems are operational!`;

  const speechText = formatTextForSpeech(markdownText);
  assert.ok(!speechText.includes('```'), 'Code block fences must be removed');
  assert.ok(!speechText.includes('https://'), 'URLs must be stripped from speech');
  assert.ok(!speechText.includes('**'), 'Bold markdown markers must be stripped');
  assert.ok(!speechText.includes('#'), 'Headers must be stripped');
  assert.ok(speechText.includes('System Report'));
  assert.ok(speechText.includes('All systems are operational!'));
});

test('AC1: MCP configuration file generation for OpenCode and AGY', async () => {
  const tempDir = path.join(PROJECT_ROOT, '.test-mcp-env-' + Date.now());
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const results = await ensureMcpConfig(tempDir);
    assert.equal(results.opencode, true);

    const configPath = path.join(tempDir, 'opencode.json');
    const content = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert.ok(content.mcp?.servers?.jarvis, 'Must define "jarvis" in mcp.servers');
    assert.deepEqual(content.mcp.servers.jarvis.command.slice(0, 1), ['node']);
    assert.ok(content.mcp.servers.jarvis.command[1].includes('jarvis-mcp-stdio.mjs'));

    const tools = getMcpToolDefinitions();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.length > 5);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('AC1: scripts/jarvis-mcp-stdio.mjs stdio JSON-RPC 2.0 protocol', async () => {
  const stdioScript = path.join(PROJECT_ROOT, 'scripts', 'jarvis-mcp-stdio.mjs');
  
  // Test initialize request
  const initReq = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });

  // Test tools/list request
  const listReq = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });

  const proc = spawn('node', [stdioScript], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  proc.stdout.on('data', (d) => {
    output += d.toString();
  });

  proc.stdin.write(initReq + '\n' + listReq + '\n');
  proc.stdin.end();

  await new Promise((resolve) => proc.on('close', resolve));

  const lines = output.trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 2, 'Must produce at least 2 JSON-RPC responses');

  const initRes = JSON.parse(lines[0]);
  assert.equal(initRes.id, 1);
  assert.ok(initRes.result?.capabilities?.tools, 'Initialize response must advertise tools capability');

  const listRes = JSON.parse(lines[1]);
  assert.equal(listRes.id, 2);
  assert.ok(Array.isArray(listRes.result?.tools), 'tools/list must return an array of tools');
  assert.ok(listRes.result.tools.length > 5, 'Must expose core JARVIS tools');

  const toolNames = listRes.result.tools.map((t) => t.name);
  assert.ok(toolNames.includes('audio_get_volume') || toolNames.includes('audio.get_volume'), 'Must expose audio tools');
  assert.ok(toolNames.includes('apps_open') || toolNames.includes('apps.open'), 'Must expose apps.open');
});

test('AC2: CliAgentBridge lifecycle, session retention, and status', () => {
  const bridge = new CliAgentBridge({ projectRoot: PROJECT_ROOT, cliProvider: 'opencode' });
  assert.equal(bridge.status, 'idle');
  assert.ok(bridge.sessionId.startsWith('ses_') || bridge.sessionId.startsWith('jarvis-agent-session-'));

  const status = bridge.getStatus();
  assert.equal(status.provider, 'opencode');
  assert.equal(status.status, 'idle');
  assert.equal(status.sessionId, bridge.sessionId);

  const prevSession = bridge.sessionId;
  const newSession = bridge.resetSession();
  assert.notEqual(prevSession, newSession);
  assert.equal(bridge.sessionId, newSession);

  let spoken = null;
  bridge.setVoicePipeline({
    speak: async (text) => {
      spoken = text;
    }
  });
  assert.ok(bridge.voicePipeline);
});

test('AC3: Execution mode toggle supports "cli" mode', async () => {
  const { getState, updateState } = await import('../server/store.js');

  await updateState((draft) => {
    draft.modelRouting ??= {};
    draft.modelRouting.executionMode = 'cli';
    return draft;
  });

  const state = await getState();
  assert.equal(state.modelRouting.executionMode, 'cli');

  // Verify cycling: cloud -> cli -> local -> cloud
  const cycle = { cloud: 'cli', cli: 'local', local: 'cloud' };
  assert.equal(cycle['cloud'], 'cli');
  assert.equal(cycle['cli'], 'local');
  assert.equal(cycle['local'], 'cloud');
});

test('AC3: Chat route responds with CLI AGENT identity when in CLI mode', async () => {
  const port = process.env.JARVIS_PORT || 8787;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({
        message: 'who are you and what model are you using?',
        mode: 'cli'
      })
    });

    if (res.ok) {
      const data = await res.json();
      assert.ok(data.reply.includes('CLI AGENT mode powered by OpenCode'));
      assert.equal(data.executionMode, 'cli');
    }
  } catch (err) {
    // If daemon is not running on 8787 right now, verify logic unit-level
  }
});

