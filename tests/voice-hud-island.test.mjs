import test from 'node:test';
import assert from 'node:assert/strict';
import { VoicePipeline } from '../server/voicePipeline.js';
import { voiceRoutes } from '../server/routes/voice.js';
import systemRoutes from '../server/routes/system.js';
import fs from 'node:fs';
import path from 'node:path';

test('AC1: VoicePipeline tracks lastTranscript, lastReply, activeTurnId, and updatedAt', async () => {
  const pipeline = new VoicePipeline({
    sttProvider: {
      transcribe: async (buf) => 'open visual studio code'
    }
  });

  assert.equal(pipeline.lastTranscript, '');
  assert.equal(pipeline.lastReply, '');
  assert.equal(pipeline.activeTurnId, null);
  assert.equal(pipeline.lastUpdatedAt, null);

  let emittedText = null;
  pipeline.on('transcription', (text) => {
    emittedText = text;
  });

  await pipeline.transcribe(Buffer.from('fake-audio'));

  assert.equal(emittedText, 'open visual studio code');
  assert.equal(pipeline.lastTranscript, 'open visual studio code');
  assert.equal(pipeline.lastReply, '');
  assert.ok(pipeline.activeTurnId?.startsWith('voice-'));
  assert.ok(pipeline.lastUpdatedAt);
  assert.equal(pipeline.updatedAt, pipeline.lastUpdatedAt);
  assert.equal(pipeline.lastRunId, pipeline.activeTurnId);

  // Test GET /api/voice/status endpoint returns all fields
  const route = voiceRoutes(pipeline);
  let resStatus = 0;
  let resHeaders = {};
  let resBody = null;

  const mockRes = {
    writeHead: (status, headers) => {
      resStatus = status;
      resHeaders = headers;
    },
    end: (body) => {
      resBody = JSON.parse(body);
    }
  };

  const mockReq = {
    url: '/api/voice/status',
    method: 'GET',
    headers: { host: '127.0.0.1:8787' }
  };

  await route(mockReq, mockRes);
  assert.equal(resStatus, 200);
  assert.equal(resBody.lastTranscript, 'open visual studio code');
  assert.equal(resBody.lastReply, '');
  assert.equal(resBody.activeTurnId, pipeline.activeTurnId);
  assert.equal(resBody.lastRunId, pipeline.activeTurnId);
  assert.equal(resBody.lastUpdatedAt, pipeline.lastUpdatedAt);
  assert.equal(resBody.updatedAt, pipeline.lastUpdatedAt);
});

test('AC2: scripts/jarvis-ptt.sh triggers jarvis-island.sh show on start and toggle', () => {
  const scriptPath = path.resolve('scripts/jarvis-ptt.sh');
  assert.ok(fs.existsSync(scriptPath), 'jarvis-ptt.sh must exist');
  const content = fs.readFileSync(scriptPath, 'utf8');

  assert.match(content, /jarvis-island\.sh.*show/, 'jarvis-ptt.sh must trigger jarvis-island.sh show');
  assert.match(content, /start\)/, 'jarvis-ptt.sh must handle start action');
  assert.match(content, /toggle\|\*\)/, 'jarvis-ptt.sh must handle toggle action');
});

test('AC3: src/components/DynamicIsland.jsx has live waveform, prompt & reply bubbles, and copy/replay actions', () => {
  const jsxPath = path.resolve('src/components/DynamicIsland.jsx');
  assert.ok(fs.existsSync(jsxPath), 'DynamicIsland.jsx must exist');
  const content = fs.readFileSync(jsxPath, 'utf8');

  assert.match(content, /island-voice-wave/, 'Must contain voice waveform markup');
  assert.match(content, /Listening\.\.\. Press Super\+J to send/, 'Must contain listening banner');
  assert.match(content, /\/api\/chats/, 'Must sync with /api/chats');
  assert.match(content, /\/api\/voice\/status/, 'Must sync with /api/voice/status');
  assert.match(content, /renderFormattedContent/, 'Must contain formatted content renderer');
  assert.match(content, /island-action-btn/, 'Must contain copy and action buttons');
  assert.match(content, /island-clear-btn/, 'Must contain clear history button');
});

test('AC4: POST /api/island/resize resizes window dimensions and jarvis-island.sh uses special scratchpad', async () => {
  let resStatus = 0;
  let resBody = null;
  const mockRes = {
    writeHead: (status) => { resStatus = status; },
    end: (body) => { resBody = JSON.parse(body); }
  };

  const makeCtx = (bodyObj) => ({
    json: (res, status, data) => { resStatus = status; resBody = data; return true; },
    body: async () => bodyObj,
    uptimeSeconds: () => 100,
    connectionStatus: () => ({}),
    desktopErrorStatus: () => 500,
    publicProvider: () => ({})
  });

  // Test expanded = true -> 500x380
  const reqExpanded = { method: 'POST' };
  const urlExpanded = new URL('http://127.0.0.1:8787/api/island/resize');
  const handledExpanded = await systemRoutes(reqExpanded, mockRes, urlExpanded, {}, makeCtx({ expanded: true }));
  assert.ok(handledExpanded, 'Route must be handled');
  assert.equal(resStatus, 200);
  assert.equal(resBody.ok, true);
  assert.equal(resBody.expanded, true);
  assert.equal(resBody.width, 500);
  assert.equal(resBody.height, 380);

  // Test expanded = false -> 460x64
  const reqCollapsed = { method: 'POST' };
  const urlCollapsed = new URL('http://127.0.0.1:8787/api/island/resize');
  const handledCollapsed = await systemRoutes(reqCollapsed, mockRes, urlCollapsed, {}, makeCtx({ expanded: false }));
  assert.ok(handledCollapsed, 'Route must be handled');
  assert.equal(resStatus, 200);
  assert.equal(resBody.ok, true);
  assert.equal(resBody.expanded, false);
  assert.equal(resBody.width, 460);
  assert.equal(resBody.height, 64);

  // Check scripts/jarvis-island.sh scratchpad handling
  const islandScriptPath = path.resolve('scripts/jarvis-island.sh');
  assert.ok(fs.existsSync(islandScriptPath), 'jarvis-island.sh must exist');
  const islandContent = fs.readFileSync(islandScriptPath, 'utf8');

  assert.match(islandContent, /special:jarvis_island/, 'jarvis-island.sh must use special:jarvis_island scratchpad');
  assert.match(islandContent, /find_island_address/, 'jarvis-island.sh must resolve island address');
  assert.match(islandContent, /find_island_workspace/, 'jarvis-island.sh must resolve island workspace');
  assert.match(islandContent, /movetoworkspacesilent/, 'jarvis-island.sh must use movetoworkspacesilent for instant toggle');
});

test('AC1 & AC2: Dynamic Island CSS flex containment, auto-sizing, and input/button visibility', () => {
  const cssPath = path.resolve('src/styles/island.css');
  assert.ok(fs.existsSync(cssPath), 'island.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  // AC1: .jarvis-island-container.expanded max-height: 380px; height: auto;
  assert.match(css, /\.jarvis-island-container\.expanded\s*\{[^}]*max-height:\s*380px;/, 'expanded container must use max-height: 380px');
  assert.match(css, /\.jarvis-island-container\.expanded\s*\{[^}]*height:\s*auto;/, 'expanded container must use height: auto');
  assert.ok(!css.includes('height: 320px;'), 'must not contain rigid height: 320px;');

  // AC1: .island-content has flex: 1; min-height: 0; overflow-y: auto;
  assert.match(css, /\.island-content\s*\{[^}]*flex:\s*1;/, 'island-content must have flex: 1');
  assert.match(css, /\.island-content\s*\{[^}]*min-height:\s*0;/, 'island-content must have min-height: 0');
  assert.match(css, /\.island-content\s*\{[^}]*overflow-y:\s*auto;/, 'island-content must have overflow-y: auto');

  // AC2: .island-input-wrap and .island-input have min-width: 0 to prevent pushing buttons
  assert.match(css, /\.island-input-wrap\s*\{[^}]*min-width:\s*0;/, 'island-input-wrap must have min-width: 0');
  assert.match(css, /\.island-input\s*\{[^}]*min-width:\s*0;/, 'island-input must have min-width: 0');

  // AC2: .island-actions and .island-icon-btn have flex-shrink: 0
  assert.match(css, /\.island-actions\s*\{[^}]*flex-shrink:\s*0;/, 'island-actions must have flex-shrink: 0');
  assert.match(css, /\.island-icon-btn\s*\{[^}]*flex-shrink:\s*0;/, 'island-icon-btn must have flex-shrink: 0');

  // AC2: JSX has accessible input and expand button
  const jsxPath = path.resolve('src/components/DynamicIsland.jsx');
  const jsx = fs.readFileSync(jsxPath, 'utf8');
  assert.match(jsx, /aria-label="Chat with JARVIS"/, 'input must have aria-label');
  assert.match(jsx, /aria-label=\{expanded \? 'Collapse Island' : 'Expand Island'\}/, 'expand/collapse button must have aria-label');
});
