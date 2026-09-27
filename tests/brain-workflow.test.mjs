import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyExecutionTier } from '../server/executionTier.js';
import { executeBrainWorkflow } from '../server/brainWorkflow.js';
import { openWebAiSession, runWebAi } from '../server/webAiProvider.js';
import { routeRequest } from '../server/router.js';
import { paidApiUsageEnabled, pricingClass, zeroSpendEligible } from '../server/spendPolicy.js';
import { executeModelPool } from '../server/modelPool.js';

const route = { primaryModel: 'muse-spark-1.2', supportModels: [] };
const response = (tier) => ({ reply: tier, provider: tier, logicalModel: tier, routingTelemetry: { providerAttempts: [] } });

test('local intent handles exact desktop actions before web or model inference', () => {
  assert.equal(routeRequest('Open Spotify').capability, 'apps.open');
  assert.equal(routeRequest('Type hello into Firefox').capability, 'computer.type');
  assert.equal(classifyExecutionTier('Explain RAM').preferredExecutionTier, 'LOCAL_MODEL');
  assert.equal(classifyExecutionTier('Give me a deep architecture review of JARVIS').preferredExecutionTier, 'HEADLESS_WEB');
  assert.equal(classifyExecutionTier('Use Claude for this').preferredSite, 'claude');
  assert.equal(classifyExecutionTier('Analyze this', { attachments: [{ type: 'image/png' }] }).preferredExecutionTier, 'ZERO_COST_API');
});

test('normal conversation uses local first and does not open web or API', async () => {
  const calls = [];
  const result = await executeBrainWorkflow({ request: 'Explain RAM', route, state: {}, execute: async ({ sourceTier }) => { calls.push(sourceTier); return response(sourceTier); }, web: async () => { throw new Error('Web should not start'); } });
  assert.deepEqual(calls, ['local']);
  assert.equal(result.result.reply, 'local');
  assert.equal(result.result.routingTelemetry.executionTier, 'LOCAL_MODEL');
});

test('complex request prefers authorized web and falls to zero-cost API only if needed', async () => {
  const calls = [];
  const input = { request: 'Give me a deep architecture review of JARVIS', route, state: {}, execute: async ({ sourceTier }) => { calls.push(sourceTier); return response(sourceTier); } };
  const webAnswer = await executeBrainWorkflow({ ...input, web: async () => ({ status: 'READY', site: 'chatgpt', reply: 'Web answer', provider: 'chatgpt-web', model: 'UI_SELECTED_UNVERIFIED', attempts: [{ site: 'chatgpt', status: 'READY' }] }) });
  assert.equal(webAnswer.result.reply, 'Web answer');
  assert.deepEqual(calls, []);
  const apiAnswer = await executeBrainWorkflow({ ...input, web: async () => ({ status: 'UNAVAILABLE' }) });
  assert.equal(apiAnswer.result.reply, 'api');
  assert.deepEqual(calls, ['api']);
});

test('hard request does not claim a text-only local answer when web and free APIs are unavailable', async () => {
  const calls = [];
  await assert.rejects(executeBrainWorkflow({ request: 'Give me a deep architecture review of JARVIS', route, state: {}, execute: async ({ sourceTier }) => {
    calls.push(sourceTier);
    throw Object.assign(new Error('No free API'), { code: 'NO_ZERO_COST_MODEL_AVAILABLE' });
  }, web: async () => ({ status: 'UNAVAILABLE' }) }), { code: 'NO_ZERO_COST_MODEL_AVAILABLE' });
  assert.deepEqual(calls, ['api']);
});

test('human verification pauses without silently falling through to another model', async () => {
  await assert.rejects(executeBrainWorkflow({ request: 'Use Claude for this', route, state: {}, execute: async () => { throw new Error('Must not run'); }, web: async () => ({ status: 'HUMAN_ACTION_REQUIRED' }) }), { code: 'HUMAN_ACTION_REQUIRED' });
});

test('zero spend requires current zero price for all reported usage dimensions', async () => {
  assert.equal(paidApiUsageEnabled({}), false);
  assert.equal(paidApiUsageEnabled({ ZERO_SPEND_MODE: 'false', ALLOW_PAID_API_USAGE: 'true' }), true);
  assert.equal(pricingClass({ pricing: { input: '0', output: '0' } }), 'FREE_MODEL');
  assert.equal(pricingClass({ pricing: { prompt: '0', completion: '0', request: '0.01' } }), 'PAID_DISABLED');
  assert.equal(pricingClass({ pricing: { input: '0' } }), 'UNKNOWN_PRICING_DISABLED');
  const provider = { type: 'API', provider: 'vercel', baseUrl: 'https://ai-gateway.vercel.sh/v1', modelId: 'free-test' };
  let inferenceCalls = 0;
  const fetchImpl = async (url) => { assert.match(url, /\/models$/); inferenceCalls += 1; return { ok: true, json: async () => ({ data: [{ id: 'free-test', pricing: { input: '0', output: '0' } }, { id: 'paid-test', pricing: { input: '0.1', output: '0.2' } }] }) }; };
  assert.equal(await zeroSpendEligible(provider, { fetchImpl, now: 10 }), true);
  assert.equal(await zeroSpendEligible({ ...provider, modelId: 'paid-test' }, { fetchImpl, now: 10 }), false);
  assert.equal(inferenceCalls, 1);
  assert.equal(await zeroSpendEligible({ ...provider, modelId: 'unknown-test' }, { fetchImpl, now: 10 }), false);
});

test('model pool never sends a paid completion under default zero-spend mode', async () => {
  const provider = { id: 'brain-paid-fixture', sourceId: 'paid-fixture', type: 'API', provider: 'vercel', presetId: 'vercel', baseUrl: 'https://ai-gateway.vercel.sh/v1', modelId: 'paid-fixture', credentialId: 'paid-fixture-key', capabilities: ['text'], modalities: ['text'], priority: 1 };
  const catalog = { list: () => [], poolEntries: () => [{ ...provider, logicalModel: 'muse-spark-1.2' }], credentialSecret: () => 'fixture-secret' };
  let completions = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'paid-fixture', pricing: { input: '0.2', output: '0.8' } }] }) };
    completions += 1;
    throw new Error('A paid completion must never be sent');
  };
  await assert.rejects(executeModelPool({ logicalModel: 'muse-spark-1.2', request: 'test', state: {}, catalog, fetchImpl, allowFallback: false, sourceTier: 'api' }), { code: 'NO_ZERO_COST_MODEL_AVAILABLE' });
  assert.equal(completions, 0);
});

test('model pool sends a completion only after live catalog verifies a free model', async () => {
  const provider = { id: 'brain-free-fixture', sourceId: 'free-fixture', type: 'API', provider: 'vercel', presetId: 'vercel', baseUrl: 'https://ai-gateway.vercel.sh/v1', modelId: 'free-fixture', credentialId: 'free-fixture-key', capabilities: ['text'], modalities: ['text'], priority: 1 };
  const catalog = { list: () => [], poolEntries: () => [{ ...provider, logicalModel: 'muse-spark-1.2' }], credentialSecret: () => 'fixture-secret' };
  const urls = [];
  const result = await executeModelPool({ logicalModel: 'muse-spark-1.2', request: 'test', state: {}, catalog, allowFallback: false, sourceTier: 'api', fetchImpl: async (url) => {
    urls.push(url);
    return url.endsWith('/models')
      ? { ok: true, json: async () => ({ data: [{ id: 'free-fixture', pricing: { input: '0', output: '0' } }] }) }
      : { ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: 'Verified free answer' } }] }) };
  } });
  assert.deepEqual(urls, ['https://ai-gateway.vercel.sh/v1/models', 'https://ai-gateway.vercel.sh/v1/chat/completions']);
  assert.equal(result.reply, 'Verified free answer');
});

test('web adapter reports login required and never submits a prompt without visible controls', async () => {
  let submitted = false;
  const manager = {
    navigate: async () => ({ result: { url: 'https://chatgpt.com/' } }),
    evaluate: async () => ({ result: { composer: null, send: null, answers: [], pageText: 'Log in to continue' } }),
    type: async () => { submitted = true; },
    click: async () => { submitted = true; },
  };
  const result = await runWebAi('A harmless test', { manager, timeoutMs: 100 });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.deepEqual(result.attempts.map((item) => item.status), ['LOGIN_REQUIRED', 'LOGIN_REQUIRED']);
  assert.equal(submitted, false);
});

test('opening a headed web session reports observed readiness, not assumed login', async () => {
  const manager = {
    openHeaded: async () => ({ status: { state: 'FIREFOX_ACTIVE', headed: true } }),
    evaluate: async () => ({ result: { composer: '#prompt-textarea', send: '[data-testid="send-button"]', answers: [], pageText: '' } }),
  };
  const result = await openWebAiSession('chatgpt', manager);
  assert.equal(result.status, 'READY');
  assert.equal(result.browser.headed, true);
});

test('web adapter submits through visible controls and reads a completed visible answer', async () => {
  const events = [];
  let submitted = false;
  const manager = {
    navigate: async () => ({ result: { url: 'https://chatgpt.com/' } }),
    evaluate: async () => ({ result: { composer: '#prompt-textarea', send: '[data-testid="send-button"]', answers: submitted ? ['Visible answer'] : [], pageText: '' } }),
    type: async (selector, prompt) => { events.push([selector, prompt]); },
    click: async (selector) => { events.push([selector]); submitted = true; },
  };
  const result = await runWebAi('Harmless question', { manager, timeoutMs: 5_000 });
  assert.equal(result.status, 'READY');
  assert.equal(result.reply, 'Visible answer');
  assert.deepEqual(events, [['#prompt-textarea', 'Harmless question'], ['[data-testid="send-button"]']]);
});
