import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserManager, BrowserError } from '../server/browser/BrowserManager.js';

function harness(options = {}) {
  const events = [];
  const settings = { lightpanda: {}, firefox: {}, ...options };
  function create(kind) {
    const config = settings[kind];
    return {
      kind, headed: false, currentUrl: null, closed: false,
      async start({ headed = false } = {}) { events.push(`${kind}:start`); const failure = config.startErrors?.shift() || config.startError; if (failure) throw Error(failure); this.headed = headed; },
      isHealthy() { return !this.closed && !config.unhealthy; },
      url() { return this.currentUrl; },
      async navigate(url) { events.push(`${kind}:navigate`); this.currentUrl = url; if (config.navigateError) throw Error(config.navigateError); return { url }; },
      async click() { events.push(`${kind}:click`); if (config.clickErrors?.length) throw Error(config.clickErrors.shift()); return { clicked: true }; },
      async type() { events.push(`${kind}:type`); return { typed: true }; },
      async read() { events.push(`${kind}:read`); return { title: 'Fixture' }; },
      async screenshot() { events.push(`${kind}:screenshot`); return { data: 'png' }; },
      async formState() { events.push(`${kind}:formState`); return [{ id: 'search', value: 'saved' }]; },
      async applyFormState(fields) { events.push(`${kind}:restore:${fields[0]?.value}`); },
      async challenge() { return config.challenge ? { title: 'Verify you are human' } : null; },
      async relaunchHeaded() { this.headed = true; events.push(`${kind}:headed`); },
      async bringToFront() { events.push(`${kind}:front`); },
      async close() { this.closed = true; events.push(`${kind}:close`); },
    };
  }
  const manager = new BrowserManager({ createLightpanda: () => create('lightpanda'), createFirefox: () => create('firefox'), maxRetries: 1, idleTimeoutMs: 100, logger: { info() {} } });
  return { manager, events, settings };
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
