import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserManager, BrowserError, isStatefulDomain, STATEFUL_WEB_DOMAINS } from '../server/browser/BrowserManager.js';
import { listTools } from '../server/registry.js';
import { unattendedTools } from '../server/toolPolicy.js';

function harness(options = {}) {
  const events = [];
  const settings = { lightpanda: {}, firefox: {}, obscura: {}, ...options };
  function create(kind) {
    const config = settings[kind] || {};
    return {
      kind, headed: false, currentUrl: null, closed: false,
      lastSelector: null,
      async start({ headed = false } = {}) { events.push(`${kind}:start`); const failure = config.startErrors?.shift() || config.startError; if (failure) throw Error(failure); this.headed = headed; },
      isHealthy() { return !this.closed && !config.unhealthy; },
      url() { return this.currentUrl; },
      async navigate(url) {
        events.push(`${kind}:navigate`);
        this.currentUrl = url;
        if (config.navigateError) throw Error(config.navigateError);
        return {
          url,
          title: 'Fixture',
          snapshot: '- button "Submit" [ref=@e1]',
          refs: { e1: { ref: 'e1', role: 'button', name: 'Submit', selector: '[data-jarvis-ref="e1"]' } }
        };
      },
      async click(selector) { events.push(`${kind}:click`); this.lastSelector = selector; if (config.clickErrors?.length) throw Error(config.clickErrors.shift()); return { clicked: true, selector }; },
      async type(selector, text) { events.push(`${kind}:type`); this.lastSelector = selector; return { typed: true, selector, text }; },
      async press(key, selector) { events.push(`${kind}:press`); this.lastSelector = selector; return { pressed: true, key, selector }; },
      async read() { events.push(`${kind}:read`); return { title: 'Fixture' }; },
      async screenshot() { events.push(`${kind}:screenshot`); return { data: 'png' }; },
      async snapshot() { events.push(`${kind}:snapshot`); return { items: [{ ref: 'e1', role: 'button', name: 'Submit', selector: '[data-jarvis-ref="e1"]' }], refMap: { e1: { ref: 'e1', role: 'button', name: 'Submit', selector: '[data-jarvis-ref="e1"]' } }, text: '- button "Submit" [ref=@e1]' }; },
      async formState() { events.push(`${kind}:formState`); return [{ id: 'search', value: 'saved' }]; },
      async applyFormState(fields) { events.push(`${kind}:restore:${fields[0]?.value}`); },
      async challenge() { return config.challenge ? { title: 'Verify you are human' } : null; },
      async relaunchHeaded() { this.headed = true; events.push(`${kind}:headed`); },
      async bringToFront() { events.push(`${kind}:front`); },
      async close() { this.closed = true; events.push(`${kind}:close`); },
    };
  }
  const manager = new BrowserManager({
    createLightpanda: () => create('lightpanda'),
    createFirefox: () => create('firefox'),
    createObscura: () => create('obscura'),
    maxRetries: 1,
    idleTimeoutMs: 100,
    logger: { info() {} }
  });
  return { manager, events, settings, create };
}

test('normal navigation stays on Lightpanda and reuses one engine', async () => {
  const { manager, events } = harness();
  await manager.navigate('http://localhost:1234/'); await manager.read(); await manager.click('#go');
  assert.equal(manager.getStatus().engine, 'lightpanda');
  assert.equal(events.filter((event) => event === 'lightpanda:start').length, 1);
  assert.equal(events.some((event) => event.startsWith('firefox:')), false);
  assert.equal(manager.getStatus().active, true);
  manager.lastActionAt = Date.now() - 9000;
  assert.equal(manager.getStatus().active, false);
  await manager.close();
});

test('transient Lightpanda error retries without Firefox', async () => {
  const { manager, events } = harness({ lightpanda: { clickErrors: ['operation timed out'] } });
  await manager.navigate('http://localhost:1234/'); await manager.click('#go');
  assert.equal(events.filter((event) => event === 'lightpanda:click').length, 2);
  assert.equal(manager.getStatus().engine, 'lightpanda'); await manager.close();
});

test('incompatibility falls back once and preserves URL and safe form state', async () => {
  const { manager, events } = harness({ lightpanda: { clickErrors: ['unsupported browser API'] } });
  await manager.navigate('http://localhost:1234/page'); await manager.click('#complex');
  assert.equal(manager.getStatus().engine, 'firefox');
  assert.ok(events.includes('firefox:navigate'));
  assert.ok(events.includes('firefox:restore:saved'));
  assert.equal(manager.getStatus().history.length, 1); await manager.close();
});

test('visual screenshot routes directly to Firefox and avoids Lightpanda', async () => {
  const { manager, events } = harness(); await manager.screenshot();
  assert.equal(manager.getStatus().engine, 'firefox'); assert.equal(events.includes('lightpanda:start'), false); await manager.close();
});

test('authorized website sign-in opens headed Firefox without Lightpanda', async () => {
  const { manager, events } = harness();
  const result = await manager.openHeaded('https://chatgpt.com/');
  assert.equal(result.status.engine, 'firefox');
  assert.equal(result.status.headed, true);
  assert.ok(events.includes('firefox:front'));
  assert.equal(events.some((event) => event.startsWith('lightpanda:')), false);
  await manager.close();
});

test('Firefox launch failure has a structured error', async () => {
  const { manager } = harness({ firefox: { startError: 'binary unavailable' } });
  await assert.rejects(manager.screenshot(), (error) => error instanceof BrowserError && error.code === 'FIREFOX_START_FAILED');
});

test('unavailable Lightpanda starts Firefox without a separate tool path', async () => {
  const { manager, events } = harness({ lightpanda: { startError: 'binary unavailable' } });
  await manager.navigate('http://localhost:1234/');
  assert.equal(manager.getStatus().engine, 'firefox');
  assert.ok(events.includes('firefox:navigate'));
  await manager.close();
});

test('human challenge pauses, opens headed Firefox, and resumes only when cleared', async () => {
  const { manager, settings, events } = harness({ lightpanda: { challenge: true }, firefox: { challenge: true } });
  const result = await manager.navigate('http://localhost:1234/challenge');
  assert.equal(result.code, 'HUMAN_ACTION_REQUIRED'); assert.equal(manager.getStatus().engine, 'firefox');
  assert.equal(manager.getStatus().headed, true);
  await manager.handoff(); assert.ok(events.includes('firefox:front'));
  assert.equal((await manager.resume()).code, 'HUMAN_ACTION_REQUIRED');
  settings.firefox.challenge = false;
  assert.equal((await manager.resume()).status.state, 'FIREFOX_ACTIVE'); await manager.close();
});

test('unhealthy engine gets bounded recovery', async () => {
  const { manager, events, settings } = harness(); await manager.navigate('http://localhost:1234/');
  settings.lightpanda.unhealthy = true;
  await manager.read();
  assert.equal(events.filter((event) => event === 'lightpanda:start').length, 2);
  assert.equal(manager.getStatus().history[0].reason, 'crash recovery');
  await manager.close();
});

test('failed Lightpanda crash recovery falls back to Firefox', async () => {
  const { manager, settings } = harness({ lightpanda: { startErrors: [null, 'restart failed'] } });
  await manager.navigate('http://localhost:1234/');
  settings.lightpanda.unhealthy = true;
  await manager.read();
  assert.equal(manager.getStatus().engine, 'firefox');
  assert.equal(manager.getStatus().url, 'http://localhost:1234/');
  await manager.close();
});

test('idle Firefox closes while preserving last URL', async () => {
  const { manager, events } = harness(); await manager.navigate('http://localhost:1234/'); await manager.screenshot();
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(manager.getStatus().state, 'IDLE'); assert.equal(manager.getStatus().url, 'http://localhost:1234/');
  await manager.read();
  assert.equal(manager.getStatus().engine, 'firefox');
  assert.equal(events.filter((event) => event === 'firefox:start').length, 2);
  await manager.close();
});

test('navigation rejects non-web schemes', async () => {
  const { manager } = harness(); await assert.rejects(manager.navigate('file:///etc/passwd'), (error) => error.code === 'NAVIGATION_FAILED');
});

test('AC1: isStatefulDomain identifies WhatsApp, Instagram, and stateful web apps', () => {
  assert.ok(isStatefulDomain('https://web.whatsapp.com/'));
  assert.ok(isStatefulDomain('https://www.instagram.com/direct/inbox/'));
  assert.ok(isStatefulDomain('https://chatgpt.com/'));
  assert.ok(isStatefulDomain('https://claude.ai/'));
  assert.ok(isStatefulDomain('https://gemini.google.com/'));
  assert.ok(isStatefulDomain('https://x.com/messages'));
  assert.ok(isStatefulDomain('https://discord.com/channels/@me'));
  assert.equal(isStatefulDomain('https://news.ycombinator.com/'), false);
  assert.equal(isStatefulDomain('https://example.com/'), false);
});

test('AC1 & AC2: stateful domains route directly to Firefox/Camoufox engine', async () => {
  const { manager, events } = harness();
  await manager.navigate('https://web.whatsapp.com/');
  assert.equal(manager.getStatus().engine, 'firefox');
  assert.ok(events.includes('firefox:start'));
  assert.equal(events.some((e) => e.startsWith('lightpanda:')), false);
  await manager.close();
});

test('AC2: Obscura engine is selected when available for stateless browsing', async () => {
  const prevUrl = process.env.OBSCURA_CDP_URL;
  try {
    process.env.OBSCURA_CDP_URL = 'http://127.0.0.1:9222';
    const { manager, events } = harness();
    await manager.navigate('https://example.com/');
    assert.equal(manager.getStatus().engine, 'obscura');
    assert.ok(events.includes('obscura:start'));
    await manager.close();
  } finally {
    if (prevUrl !== undefined) process.env.OBSCURA_CDP_URL = prevUrl;
    else delete process.env.OBSCURA_CDP_URL;
  }
});

test('AC3: snapshot ref indexer resolves @e1 and e1 to [data-jarvis-ref="..."]', async () => {
  const { manager } = harness();
  assert.equal(manager.resolveSelector('@e1'), '[data-jarvis-ref="e1"]');
  assert.equal(manager.resolveSelector('@e42'), '[data-jarvis-ref="e42"]');
  assert.equal(manager.resolveSelector('e5'), '[data-jarvis-ref="e5"]');
  assert.equal(manager.resolveSelector('#custom-btn'), '#custom-btn');
  assert.equal(manager.resolveSelector('button.primary'), 'button.primary');
});

test('AC3: perform resolves @e1 selectors for click, type, and press', async () => {
  const { manager, events } = harness();
  const navRes = await manager.navigate('https://example.com/');
  assert.ok(navRes.result.snapshot.includes('@e1'));
  assert.ok(navRes.result.refs.e1);

  await manager.click('@e1');
  assert.equal(manager.engine.lastSelector, '[data-jarvis-ref="e1"]');

  await manager.type('@e1', 'hello world');
  assert.equal(manager.engine.lastSelector, '[data-jarvis-ref="e1"]');

  const snapRes = await manager.snapshot();
  assert.ok(snapRes.result.text.includes('@e1'));
  assert.equal(snapRes.result.items[0].ref, 'e1');
  await manager.close();
});

test('AC3: browser.snapshot is registered in registry and allowed in toolPolicy', () => {
  const tools = listTools();
  const snapTool = tools.find((t) => t.id === 'browser.snapshot');
  assert.ok(snapTool, 'browser.snapshot should be in listTools()');
  assert.equal(snapTool.riskLevel, 'READ_ONLY');

  const allowed = unattendedTools();
  assert.ok(allowed.some((t) => t.id === 'browser.snapshot'), 'browser.snapshot should be unattended allowed');
});
