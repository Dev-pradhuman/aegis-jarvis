import assert from 'node:assert/strict';
import test from 'node:test';
import { executeModelToolLoop } from '../server/modelToolLoop.js';
import { listTools } from '../server/registry.js';
import { modelCallableTools } from '../server/toolPolicy.js';
import { selectRelevantTools, toolFilterSettings } from '../server/toolFilter.js';
import { routeRequest } from '../server/router.js';
import { classifyForModel } from '../server/modelRouting.js';
import { BrowserManager } from '../server/browser/BrowserManager.js';
import { PatchrightEngine } from '../server/browser/engines.js';
import { assembleModelContext } from '../server/contextAssembler.js';

test('AC1: executeModelToolLoop executes a 7-step sequence without throwing TOOL_LIMIT_EXCEEDED', async () => {
  const steps = [
    { tool: 'browser__navigate', args: { url: 'https://web.whatsapp.com', mode: 'visual' } },
    { tool: 'browser__accessibility', args: {} },
    { tool: 'browser__click', args: { selector: 'div[contenteditable="true"][data-tab="3"]' } },
    { tool: 'browser__type', args: { selector: 'div[contenteditable="true"][data-tab="3"]', text: 'Alex' } },
    { tool: 'browser__press', args: { key: 'Enter' } },
    { tool: 'browser__type', args: { selector: 'div[contenteditable="true"][data-tab="10"]', text: 'Hello Alex' } },
    { tool: 'browser__press', args: { key: 'Enter' } },
  ];

  let currentStep = 0;
  const model = async () => {
    if (currentStep < steps.length) {
      const step = steps[currentStep];
      currentStep++;
      return {
        reply: '',
        toolCalls: [
          {
            id: `call-${currentStep}`,
            function: {
              name: step.tool,
              arguments: JSON.stringify(step.args),
            },
          },
        ],
        tokens: 10,
      };
    }
    return {
      reply: 'Message sent to Alex on WhatsApp.',
      toolCalls: [],
      tokens: 15,
    };
  };

  const executed = [];
  const invoke = async (_state, req) => {
    executed.push(req);
    return { status: 200, body: { ok: true, toolId: req.toolId, data: { status: 'ok' } } };
  };

  const result = await executeModelToolLoop(
    { request: 'message Alex on whatsapp saying Hello Alex', context: [], state: {} },
    { model, invoke }
  );

  assert.equal(result.reply, 'Message sent to Alex on WhatsApp.');
  assert.equal(result.executedToolCalls.length, 7);
  assert.equal(executed.length, 7);
  assert.equal(executed[0].toolId, 'browser.navigate');
  assert.equal(executed[1].toolId, 'browser.accessibility');
  assert.equal(executed[2].toolId, 'browser.click');
  assert.equal(executed[3].toolId, 'browser.type');
  assert.equal(executed[4].toolId, 'browser.press');
  assert.equal(executed[5].toolId, 'browser.type');
  assert.equal(executed[6].toolId, 'browser.press');
});

test('AC2: browser.press registration, schema, policy, and BrowserManager method', async () => {
  const tools = listTools();
  const pressTool = tools.find((t) => t.id === 'browser.press');
  assert.ok(pressTool, 'browser.press must be registered in tool registry');
  assert.equal(pressTool.module, 'browser');
  assert.equal(pressTool.requiresApproval, true, 'browser.press must require approval');
  assert.deepEqual(pressTool.inputSchema.required, ['key']);
  assert.ok(pressTool.inputSchema.properties.key);
  assert.ok(pressTool.inputSchema.properties.selector);
  assert.ok(pressTool.inputSchema.properties.mode);

  // Policy check
  const callable = modelCallableTools();
  assert.ok(callable.some((t) => t.id === 'browser.press'), 'browser.press must be in modelCallableTools');

  // Filter check
  const settings = toolFilterSettings();
  assert.ok(settings.coreTools.includes('browser.press'), 'browser.press must be in CORE_TOOLS');

  // BrowserManager press execution check
  let enginePressed = null;
  const mockEngine = {
    kind: 'firefox',
    isHealthy: () => true,
    url: () => 'https://web.whatsapp.com',
    press: async (key, selector) => {
      enginePressed = { key, selector };
      return { url: 'https://web.whatsapp.com', key, selector };
    },
    close: async () => {},
  };

  const bm = new BrowserManager({ createFirefox: () => mockEngine, createLightpanda: () => mockEngine });
  bm.engine = mockEngine;
  bm.state = 'FIREFOX_ACTIVE';

  const pressRes = await bm.press('Enter', 'div[contenteditable="true"]');
  assert.deepEqual(enginePressed, { key: 'Enter', selector: 'div[contenteditable="true"]' });
  assert.equal(pressRes.result.key, 'Enter');
});

test('AC2: PatchrightEngine.type focuses contenteditable / role="textbox" and types via keyboard', async () => {
  let focused = false;
  let sequentiallyTyped = null;
  let filled = false;

  const mockLocator = {
    evaluate: async (fn) => {
      // Simulate rich text element
      const mockEl = {
        isContentEditable: true,
        getAttribute: (attr) => (attr === 'contenteditable' ? 'true' : null),
      };
      return fn(mockEl);
    },
    click: async () => {
      focused = true;
    },
    pressSequentially: async (text, opts) => {
      sequentiallyTyped = { text, opts };
    },
    fill: async () => {
      filled = true;
    },
  };

  const engine = new PatchrightEngine();
  engine.page = {
    url: () => 'https://web.whatsapp.com',
    locator: () => mockLocator,
    keyboard: {
      press: async () => {},
    },
  };

  await engine.type('div[contenteditable="true"]', 'Hello world');
  assert.equal(focused, true, 'Element should have been focused via click');
  assert.equal(sequentiallyTyped?.text, 'Hello world', 'Text should have been typed via pressSequentially');
  assert.equal(sequentiallyTyped?.opts?.delay, 15, 'Typing delay should be 15ms');
  assert.equal(filled, false, 'fill() should NOT be called on rich contenteditable elements');
});

test('AC3: Social media DM queries route to MODEL, classify as computer_use (minimax-m3), and include browser tools', () => {
  const dmQueries = [
    'message John on whatsapp saying hey',
    'can you text Mom on whatsapp that I will be late',
    'dm Sarah on instagram saying hello',
    'send a dm to Alex on instagram saying are we meeting today?',
    'open headless browser and message Alex on whatsapp',
  ];

  for (const q of dmQueries) {
    // 1. Router check: falls through to MODEL
    const route = routeRequest(q);
    assert.equal(route.route, 'MODEL', `Query "${q}" should route to MODEL`);

    // 2. Model classifier check: computer_use, requiresTools, minimax-m3
    const classification = classifyForModel(q);
    assert.equal(classification.taskType, 'computer_use', `Query "${q}" should classify as computer_use`);
    assert.equal(classification.requiresTools, true, `Query "${q}" should require tools`);
    assert.equal(classification.primaryModel, 'minimax-m3', `Query "${q}" should target minimax-m3`);

    // 3. Tool filter check: browser tools selected
    const selected = selectRelevantTools(q, modelCallableTools()).tools;
    const ids = new Set(selected.map((t) => t.id));
    assert.ok(ids.has('browser.navigate'), `Query "${q}" must include browser.navigate`);
    assert.ok(ids.has('browser.click'), `Query "${q}" must include browser.click`);
    assert.ok(ids.has('browser.type'), `Query "${q}" must include browser.type`);
    assert.ok(ids.has('browser.press'), `Query "${q}" must include browser.press`);
    assert.ok(ids.has('browser.accessibility'), `Query "${q}" must include browser.accessibility`);
  }
});

test('AC3: contextAssembler includes WhatsApp and Instagram DM guidance in BROWSER INSTRUCTION', () => {
  const { context } = assembleModelContext({
    query: 'message John on whatsapp saying hello',
    history: [],
    includeTools: true,
  });

  const systemMsg = context.find((m) => m.role === 'system' && m.content.includes('BROWSER INSTRUCTION'));
  assert.ok(systemMsg, 'System message must contain BROWSER INSTRUCTION');
  assert.ok(systemMsg.content.includes('web.whatsapp.com'), 'Instruction must mention web.whatsapp.com');
  assert.ok(systemMsg.content.includes('instagram.com/direct/inbox'), 'Instruction must mention instagram.com/direct/inbox');
  assert.ok(systemMsg.content.includes('browser.press'), 'Instruction must advise browser.press');
  assert.ok(systemMsg.content.includes('HUMAN_ACTION_REQUIRED'), 'Instruction must advise HUMAN_ACTION_REQUIRED for login/QR');
});
