import test from 'node:test';
import assert from 'node:assert';
import { resetCaches } from './testHelper.mjs';

test('scheduler.matchCron', async (t) => {
  const { matchCron } = await import('../server/scheduler.js');
  // Fixed UTC time: 2026-10-06T12:30:00.000Z (Tuesday, October 6)
  const timeMs = 1791289800000;
  
  assert.strictEqual(matchCron('30 12 6 10 *', timeMs), true);
  assert.strictEqual(matchCron('30 12 6 10 2', timeMs), true);
  assert.strictEqual(matchCron('* * * * *', timeMs), true);
  assert.strictEqual(matchCron('*/15 * * * *', timeMs), true);
  assert.strictEqual(matchCron('*/7 * * * *', timeMs), false);
  assert.strictEqual(matchCron('20-40 10-14 1-10 10-12 *', timeMs), true);
  assert.strictEqual(matchCron('0,30,45 12 6 10 *', timeMs), true);
  assert.strictEqual(matchCron('invalid cron', timeMs), false);
  assert.strictEqual(matchCron('30 12 6', timeMs), false);
});

test('agentManager functions', async (t) => {
  const { spawnAgent, updateAgentMemory, completeAgentTask, createGoal } = await import('../server/agentManager.js');
  const state = {};
  const goal = createGoal(state, 'Test Goal', 'Description');
  assert.strictEqual(state.goals.length, 1);
  assert.strictEqual(goal.title, 'Test Goal');
  
  const agent = spawnAgent(state, 'Coder', goal.id);
  assert.strictEqual(state.agents.length, 1);
  assert.strictEqual(agent.role, 'Coder');
  
  updateAgentMemory(state, agent.id, { key: 'value' });
  assert.strictEqual(agent.memoryScope.length, 1);
  assert.strictEqual(agent.memoryScope[0].data.key, 'value');
  
  completeAgentTask(state, agent.id, 'Success');
  assert.strictEqual(agent.status, 'completed');
  assert.strictEqual(agent.lastResult, 'Success');
});

test('cameraUnderstanding', async (t) => {
  resetCaches();
  const { osPlatform } = await import('../server/platform/index.js');
  const { describeCamera } = await import('../server/cameraUnderstanding.js');
  
  const originalCapture = osPlatform.camera.capture;
  osPlatform.camera.capture = async () => ({ path: '/tmp/cam.jpg', timestamp: '2026-01-01' });

  const mockFetch = async (url, options) => {
    if (url.endsWith('/models')) {
      return { ok: true, json: async () => ({ data: [
        { id: 'nvidia/perception', pricing: { prompt: 0, completion: 0 } }
      ] }) };
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'A test view' } }], usage: { total_tokens: 10 } }) };
  };
  process.env.OPENROUTER_API_KEY = 'test-key';

  try {
    const res = await describeCamera({}, { fetchImpl: mockFetch });
    assert.strictEqual(res.description, 'A test view');
  } finally {
    osPlatform.camera.capture = originalCapture;
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('screenUnderstanding', async (t) => {
  resetCaches();
  const { osPlatform } = await import('../server/platform/index.js');
  const { describeScreen, locateElement, readRegion } = await import('../server/screenUnderstanding.js');

  const originalCapture = osPlatform.screen.capture;
  osPlatform.screen.capture = async () => ({ path: '/tmp/screen.png', timestamp: '2026-01-01' });

  const mockFetch = async (url, options) => {
    if (url.endsWith('/models')) {
      return { ok: true, json: async () => ({ data: [
        { id: 'nvidia/perception', pricing: { prompt: 0, completion: 0 } }
      ] }) };
    }
    const body = options.body ? JSON.parse(options.body) : {};
    let content = 'A test screen';
    const msg = body.messages && body.messages[0] && body.messages[0].content;
    if (typeof msg === 'string') {
      if (msg.includes('Locate the UI element')) content = '{"found": true}';
      else if (msg.includes('Read all text')) content = 'EMPTY';
    } else if (Array.isArray(msg) && msg.find(m => m.type === 'text' && m.text.includes('Locate the UI element'))) {
      content = '{"found": true}';
    } else if (Array.isArray(msg) && msg.find(m => m.type === 'text' && m.text.includes('Read all text'))) {
      content = 'EMPTY';
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }) };
  };
  process.env.OPENROUTER_API_KEY = 'test-key';

  try {
    const desc = await describeScreen({}, { fetchImpl: mockFetch });
    assert.strictEqual(desc.description, 'A test screen');
    
    const loc = await locateElement({ description: 'button' }, { fetchImpl: mockFetch });
    assert.strictEqual(loc.found, true);
    
    const read = await readRegion({ x: 0, y: 0, width: 1, height: 1 }, { fetchImpl: mockFetch });
    assert.strictEqual(read.text, '');
  } finally {
    osPlatform.screen.capture = originalCapture;
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('morningBriefing', async (t) => {
  resetCaches();
  const { generateMorningBriefing } = await import('../server/morningBriefing.js');

  const mockFetch = async (url, options) => {
    if (url.endsWith('/models')) {
      return { ok: true, json: async () => ({ data: [
        { id: 'muse/spark-1.2', pricing: { prompt: 0, completion: 0 } }
      ] }) };
    }
    if (url.includes('calendar')) return { ok: true, json: async () => ({ events: [] }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Morning Briefing Test' } }], usage: { total_tokens: 10 } }) };
  };
  process.env.OPENROUTER_API_KEY = 'test-key';

  try {
    const res = await generateMorningBriefing({}, { fetchImpl: mockFetch });
    assert.strictEqual(res, 'Morning Briefing Test');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('toolExecutor bindings', async (t) => {
  const { getTool } = await import('../server/registry.js');
  assert.ok(getTool('routine.morning_briefing'));
  assert.ok(getTool('camera.describe'));
});
