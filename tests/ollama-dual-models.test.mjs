import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest, cleanConversationalPrompt } from '../server/router.js';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_VISION_MODEL, localOllamaPool } from '../server/modelPool.js';
import { canUseLocalStage, executeBrainWorkflow } from '../server/brainWorkflow.js';

test('AC1: Dual Ollama model constants and local pool definitions', () => {
  assert.equal(DEFAULT_OLLAMA_MODEL, 'maternion/spark-x2.5-heretic:4b');
  assert.equal(DEFAULT_OLLAMA_VISION_MODEL, 'moondream:latest');

  const pool = localOllamaPool();
  assert.ok(pool['agent_brain'], 'agent_brain pool must exist');
  assert.equal(pool['agent_brain'][0].modelId, 'maternion/spark-x2.5-heretic:4b');
  assert.ok(pool['agent_brain'][0].capabilities.includes('tools'));
  assert.ok(pool['agent_brain'][0].capabilities.includes('reasoning'));
  assert.ok(pool['agent_brain'][0].capabilities.includes('code'));

  assert.ok(pool['perception'], 'perception pool must exist');
  assert.equal(pool['perception'][0].modelId, 'moondream:latest');
  assert.ok(pool['perception'][0].capabilities.includes('image'));
  assert.ok(pool['perception'][0].modalities.includes('image'));
});

test('AC2: Natural screen activity and active window routing in router.js', () => {
  const desktopQueries = [
    'what am i doing',
    'what am i working on',
    'what is on my screen',
    'what\'s on my screen',
    'look at my screen',
    'check my screen',
    'inspect my screen',
    'describe my screen'
  ];
  for (const q of desktopQueries) {
    const res = routeRequest(q);
    assert.equal(res.route, 'TOOL_CALL', `Failed for query: ${q}`);
    assert.equal(res.capability, 'screen.describe', `Failed capability for query: ${q}`);
    assert.equal(res.args.target, 'desktop', `Failed target for query: ${q}`);
  }

  const windowQueries = [
    'describe the active window',
    'what is on my active window',
    'take a look at the current window',
    'inspect active window',
    'look at the active window'
  ];
  for (const q of windowQueries) {
    const res = routeRequest(q);
    assert.equal(res.route, 'TOOL_CALL', `Failed for query: ${q}`);
    assert.equal(res.capability, 'screen.describe', `Failed capability for query: ${q}`);
    assert.equal(res.args.target, 'window', `Failed target for query: ${q}`);
  }
});

test('AC3: Execution mode routing logic in brainWorkflow.js', async () => {
  // In local mode, canUseLocalStage is always true
  assert.equal(canUseLocalStage({ requiresVision: true, requiresStrongReasoning: true }, { state: { modelRouting: { executionMode: 'local' } } }), true);

  const route = { primaryModel: 'agent_brain', supportModels: [] };
  const calls = [];
  const mockExecute = async (options) => {
    calls.push(options.sourceTier);
    return {
      reply: `result from ${options.sourceTier}`,
      provider: 'test',
      logicalModel: 'test',
      routingTelemetry: { providerAttempts: [] }
    };
  };

  // 1. Local execution mode: runs runLocal exclusively without API or Web calls
  calls.length = 0;
  const localRes = await executeBrainWorkflow({
    request: 'Explain quantum computing',
    route,
    state: { modelRouting: { executionMode: 'local' } },
    execute: mockExecute,
    web: async () => { throw new Error('Web should not be called in local mode'); }
  });
  assert.deepEqual(calls, ['local']);
  assert.equal(localRes.result.reply, 'result from local');
  assert.equal(localRes.result.routingTelemetry.executionTier, 'LOCAL_MODEL');

  // 2. Cloud execution mode: cascades ZERO_COST_API -> LOCAL_MODEL
  calls.length = 0;
  const cloudRes = await executeBrainWorkflow({
    request: 'Explain quantum computing',
    route,
    state: { modelRouting: { executionMode: 'cloud' } },
    execute: mockExecute,
    web: async () => { throw new Error('Web should not be called'); }
  });
  assert.deepEqual(calls, ['api']);
  assert.equal(cloudRes.result.reply, 'result from api');
  assert.equal(cloudRes.result.routingTelemetry.executionTier, 'ZERO_COST_API');
});

test('AC4: Conversational prefix and suffix stripping in router.js', () => {
  // cleanConversationalPrompt
  assert.equal(cleanConversationalPrompt('hey jarvis whats my system volume right now?'), 'whats my system volume');
  assert.equal(cleanConversationalPrompt('can you snooze for 5 minutes please'), 'snooze for 5 minutes');
  assert.equal(cleanConversationalPrompt('could you please check my screen for me?'), 'check my screen');

  // Exact AC4 query verification
  // 1. "hey jarvis whats my system volume right now?" -> audio.get_volume
  const vol1 = routeRequest('hey jarvis whats my system volume right now?');
  assert.equal(vol1.route, 'TOOL_CALL');
  assert.equal(vol1.capability, 'audio.get_volume');

  // 2. "what is the system volume" -> audio.get_volume
  const vol2 = routeRequest('what is the system volume');
  assert.equal(vol2.route, 'TOOL_CALL');
  assert.equal(vol2.capability, 'audio.get_volume');

  // 3. "turn the volume down by 5 percent" -> audio.volume_down (step: 5)
  const volDown = routeRequest('turn the volume down by 5 percent');
  assert.equal(volDown.route, 'TOOL_CALL');
  assert.equal(volDown.capability, 'audio.volume_down');
  assert.equal(volDown.args.step, 5);

  // 4. "can you snooze for 5 minutes" -> reminders.snooze (minutes: 5)
  const snooze = routeRequest('can you snooze for 5 minutes');
  assert.equal(snooze.route, 'TOOL_CALL');
  assert.equal(snooze.capability, 'reminders.snooze');
  assert.equal(snooze.args.minutes, 5);

  // 5. "check what apps and windows i have open right now" -> windows.list
  const winList = routeRequest('check what apps and windows i have open right now');
  assert.equal(winList.route, 'TOOL_CALL');
  assert.equal(winList.capability, 'windows.list');

  // 6. "what timers or reminders do i have running" -> reminders.list
  const remList = routeRequest('what timers or reminders do i have running');
  assert.equal(remList.route, 'TOOL_CALL');
  assert.equal(remList.capability, 'reminders.list');

  // 7. "what files have changed in my git repo" -> projects.status
  const proj = routeRequest('what files have changed in my git repo');
  assert.equal(proj.route, 'TOOL_CALL');
  assert.equal(proj.capability, 'projects.status');

  // 8. "yo jarvis my speakers are way too loud, can you turn the volume down by 5 percent?" -> audio.volume_down (step: 5)
  const volComplex = routeRequest('yo jarvis my speakers are way too loud, can you turn the volume down by 5 percent?');
  assert.equal(volComplex.route, 'TOOL_CALL');
  assert.equal(volComplex.capability, 'audio.volume_down');
  assert.equal(volComplex.args.step, 5);
});

test('AC1 & AC2: Top-right execution mode switch and clean bottom-right corner', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Verify bottom-right floating CLOUD and VISION buttons removed from GlobalVision.jsx
  const globalVisionSrc = fs.readFileSync(path.resolve('src/components/GlobalVision.jsx'), 'utf8');
  assert.ok(!globalVisionSrc.includes('vision-btn-gear'), 'vision-btn-gear must be removed');
  assert.ok(!globalVisionSrc.includes('data-testid="vision-settings-btn"'), 'vision-settings-btn must be removed');
  assert.ok(!globalVisionSrc.includes('data-testid="vision-cloud-badge"'), 'vision-cloud-badge must be removed');

  const visionCss = fs.readFileSync(path.resolve('src/styles/vision.css'), 'utf8');
  assert.ok(!visionCss.includes('.vision-btn-gear'), '.vision-btn-gear must be removed from CSS');

  // Verify GalaxyHome.jsx renders the Cloud/Local toggle visibly in .topbar-right
  const galaxyHomeSrc = fs.readFileSync(path.resolve('src/components/GalaxyHome.jsx'), 'utf8');
  assert.ok(galaxyHomeSrc.includes('topbar-right'), 'GalaxyHome must contain topbar-right');
  assert.ok(galaxyHomeSrc.includes('execution-mode-btn'), 'GalaxyHome must render execution-mode-btn');
  assert.ok(galaxyHomeSrc.includes("executionMode === 'local' ? '💻 LOCAL' : '☁️ CLOUD'"), 'GalaxyHome must render mode toggle label');

  // Verify TopBar.jsx renders the Cloud/Local toggle in .topbar-right
  const topBarSrc = fs.readFileSync(path.resolve('src/components/TopBar.jsx'), 'utf8');
  assert.ok(topBarSrc.includes('topbar-right'), 'TopBar must contain topbar-right');
  assert.ok(topBarSrc.includes('execution-mode-btn'), 'TopBar must render execution-mode-btn');
});

test('AC1 & AC2: 5 essential sidebar tabs and full-page layout for non-Home views', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Verify GalaxyHome.jsx NAV pruned to 5 essential tabs
  const galaxyHomeSrc = fs.readFileSync(path.resolve('src/components/GalaxyHome.jsx'), 'utf8');
  assert.ok(galaxyHomeSrc.includes("id: 'home', label: 'Home'"), 'Must include Home tab');
  assert.ok(galaxyHomeSrc.includes("id: 'tasks', label: 'Tasks'"), 'Must include Tasks tab');
  assert.ok(galaxyHomeSrc.includes("id: 'memory', label: 'Memory'"), 'Must include Memory tab');
  assert.ok(galaxyHomeSrc.includes("id: 'activity', label: 'Activity'"), 'Must include Activity tab');
  assert.ok(galaxyHomeSrc.includes("id: 'settings', label: 'Settings'"), 'Must include Settings tab');

  // Ensure pruned tabs are not in NAV array
  assert.ok(!galaxyHomeSrc.includes("id: 'workflows', label: 'Workflows'"), 'Workflows tab should be pruned from NAV');
  assert.ok(!galaxyHomeSrc.includes("id: 'agents', label: 'Agents'"), 'Agents tab should be pruned from NAV');
  assert.ok(!galaxyHomeSrc.includes("id: 'research', label: 'Research'"), 'Research tab should be pruned from NAV');
  assert.ok(!galaxyHomeSrc.includes("id: 'phone', label: 'Phone'"), 'Phone tab should be pruned from NAV');
  assert.ok(!galaxyHomeSrc.includes("id: 'messaging', label: 'Messaging'"), 'Messaging tab should be pruned from NAV');

  // Verify Sidebar.jsx NAV_ITEMS pruned to 5 essential items
  const sidebarSrc = fs.readFileSync(path.resolve('src/components/Sidebar.jsx'), 'utf8');
  assert.ok(sidebarSrc.includes("id: 'overview', label: 'Home'"), 'Sidebar must include Home');
  assert.ok(sidebarSrc.includes("id: 'tasks', label: 'Tasks'"), 'Sidebar must include Tasks');
  assert.ok(sidebarSrc.includes("id: 'memory', label: 'Memory'"), 'Sidebar must include Memory');
  assert.ok(sidebarSrc.includes("id: 'activity', label: 'Activity'"), 'Sidebar must include Activity');
  assert.ok(sidebarSrc.includes("id: 'settings', label: 'Settings'"), 'Sidebar must include Settings');
  assert.ok(!sidebarSrc.includes("id: 'skills', label: 'Skills'"), 'Skills must be pruned from Sidebar');

  // Verify full-page workspace rendering in GalaxyHome.jsx
  assert.ok(galaxyHomeSrc.includes('galaxy-fullpage-workspace'), 'GalaxyHome must render galaxy-fullpage-workspace');
  assert.ok(galaxyHomeSrc.includes('<TasksWorkspace />'), 'GalaxyHome must render TasksWorkspace');
  assert.ok(galaxyHomeSrc.includes('<MemoryWorkspace />'), 'GalaxyHome must render MemoryWorkspace');
  assert.ok(galaxyHomeSrc.includes('<ActivityWorkspace />'), 'GalaxyHome must render ActivityWorkspace');
  assert.ok(galaxyHomeSrc.includes('<SettingsWorkspaceCombined />'), 'GalaxyHome must render SettingsWorkspaceCombined');
});

test('AC3: Ultra-transparent Home Chat and removed floating mic circle', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Verify GlobalVoice.jsx has floating button removed
  const globalVoiceSrc = fs.readFileSync(path.resolve('src/components/GlobalVoice.jsx'), 'utf8');
  assert.ok(!globalVoiceSrc.includes('global-voice-indicator'), 'GlobalVoice must not render global-voice-indicator');
  assert.ok(!globalVoiceSrc.includes("position: 'fixed'"), 'GlobalVoice must not have fixed position indicator');

  // Verify GalaxyHome.jsx renders embedded chat on home tab
  const galaxyHomeSrc = fs.readFileSync(path.resolve('src/components/GalaxyHome.jsx'), 'utf8');
  assert.ok(galaxyHomeSrc.includes('galaxy-home-chat-wrapper'), 'GalaxyHome must render galaxy-home-chat-wrapper');
  assert.ok(galaxyHomeSrc.includes('<Chat embedded={true} />'), 'GalaxyHome must embed Chat');

  // Verify chat.css has ultra-transparent styling
  const chatCss = fs.readFileSync(path.resolve('src/styles/chat.css'), 'utf8');
  assert.ok(chatCss.includes('.embedded-home-chat.chat-panel'), 'chat.css must style .embedded-home-chat');
  assert.ok(chatCss.includes('rgba(8, 12, 24, 0.12)'), 'chat.css must use ultra-transparent background');
  assert.ok(chatCss.includes('rgba(15, 23, 42, 0.22)'), 'chat.css must use semi-transparent message body');
  assert.ok(chatCss.includes('rgba(15, 23, 42, 0.25)'), 'chat.css must use transparent command input');
});

test('AC4: Model identity queries route cleanly and return clean human text', () => {
  const queries = [
    'which model are you?',
    'which model are you',
    'what model are you using?',
    'what model are you using',
    'what model are you',
    'who are you?',
    'who are you',
    'who r u',
    'identify yourself'
  ];

  for (const q of queries) {
    const res = routeRequest(q);
    assert.equal(res.route, 'TOOL_CALL', `Failed route for: ${q}`);
    assert.equal(res.capability, 'models.list', `Failed capability for: ${q}`);
  }
});
