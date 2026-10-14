import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite, safeEnd } from '../server/streamUtils.js';
import { BrowserManager, BrowserError } from '../server/browser/BrowserManager.js';
import { routeRequest } from '../server/router.js';
import { assembleModelContext } from '../server/contextAssembler.js';

test('safeWrite and safeEnd handle broken and closed streams gracefully', () => {
  // Test destroyed stream
  const destroyedStream = {
    destroyed: true,
    writableEnded: false,
    write() { throw new Error('write after destroy'); },
    end() { throw new Error('end after destroy'); }
  };
  assert.equal(safeWrite(destroyedStream, 'hello'), false);
  assert.equal(safeEnd(destroyedStream, 'bye'), false);

  // Test writableEnded stream
  const endedStream = {
    destroyed: false,
    writableEnded: true,
    write() { throw new Error('ERR_STREAM_WRITE_AFTER_END'); },
    end() { throw new Error('ERR_STREAM_ALREADY_ENDED'); }
  };
  assert.equal(safeWrite(endedStream, 'data'), false);
  assert.equal(safeEnd(endedStream), false);

  // Test stream throwing EPIPE
  const epipeStream = {
    destroyed: false,
    writableEnded: false,
    write() {
      const err = new Error('write EPIPE');
      err.code = 'EPIPE';
      throw err;
    },
    end() {
      const err = new Error('write EPIPE');
      err.code = 'EPIPE';
      throw err;
    }
  };
  assert.equal(safeWrite(epipeStream, 'test'), false);
  assert.equal(safeEnd(epipeStream), false);

  // Test valid healthy stream
  let writtenData = '';
  let ended = false;
  const healthyStream = {
    destroyed: false,
    writableEnded: false,
    write(chunk) { writtenData += chunk; return true; },
    end(chunk) { if (chunk) writtenData += chunk; ended = true; return true; }
  };
  assert.equal(safeWrite(healthyStream, 'chunk1-'), true);
  assert.equal(safeEnd(healthyStream, 'chunk2'), true);
  assert.equal(writtenData, 'chunk1-chunk2');
  assert.equal(ended, true);
});

test('BrowserManager handoff, challenge detection, and resume with pendingContinuation', async () => {
  const events = [];
  let challengeActive = true;

  const mockEngine = {
    kind: 'firefox',
    headed: false,
    currentUrl: 'https://example.com/login',
    async start({ headed = false } = {}) {
      this.headed = headed;
      events.push(`start:headed=${headed}`);
    },
    isHealthy() { return true; },
    url() { return this.currentUrl; },
    async navigate(url) {
      this.currentUrl = url;
      events.push(`navigate:${url}`);
      return { url };
    },
    async click() { return { ok: true }; },
    async type() { return { ok: true }; },
    async read() { return { title: 'Test Page' }; },
    async challenge() {
      return challengeActive ? { type: 'BOT_WALL', title: 'Verify you are human' } : null;
    },
    async bringToFront() { events.push('front'); },
    async relaunchHeaded() {
      this.headed = true;
      events.push('relaunchHeaded');
    },
    async relaunchHeadless() {
      this.headed = false;
      events.push('relaunchHeadless');
    },
    async close() { events.push('close'); }
  };

  const manager = new BrowserManager({
    createLightpanda: () => mockEngine,
    createFirefox: () => mockEngine,
    maxRetries: 1,
    idleTimeoutMs: 1000,
    logger: { info() {} }
  });

  // 1. Trigger navigation to challenge page
  const handoffResult = await manager.navigate('https://example.com/protected');
  assert.equal(handoffResult.code, 'HUMAN_ACTION_REQUIRED');
  assert.equal(manager.state, 'HUMAN_ACTION_REQUIRED');
  assert.equal(manager.getStatus().humanActionRequired, true);
  assert.ok(events.includes('relaunchHeaded'));
  assert.ok(events.includes('front'));
  assert.ok(manager.pendingContinuation);
  assert.equal(manager.pendingContinuation.action, 'navigate');

  // 2. Resume while challenge is still present returns 409 status code contract
  const pendingResume = await manager.resume();
  assert.equal(pendingResume.code, 'HUMAN_ACTION_REQUIRED');
  assert.equal(manager.state, 'HUMAN_ACTION_REQUIRED');

  // 3. Clear challenge and resume: switches headless, pins domain, auto-continues
  challengeActive = false;
  const successfulResume = await manager.resume();
  assert.equal(successfulResume.status.state, 'FIREFOX_ACTIVE');
  assert.ok(events.includes('relaunchHeadless'));
  assert.equal(manager.isDomainAuthenticated('https://example.com/protected'), true);
  assert.equal(manager.getStatus().authenticatedDomains.includes('example.com'), true);

  // 4. Test explicit handoff for user sign-in to a domain
  const userHandoff = await manager.handoff('https://github.com/login');
  assert.equal(manager.state, 'HUMAN_ACTION_REQUIRED');
  assert.ok(events.includes('navigate:https://github.com/login'));
  assert.equal(manager.getStatus().pending.challenge.type, 'LOGIN_SIGNIN');

  await manager.close();
});

test('natural language browser sign-in requests route deterministically to browser.handoff', () => {
  const r1 = routeRequest('open the headless browser so I can sign into github.com');
  assert.equal(r1.route, 'TOOL_CALL');
  assert.equal(r1.capability, 'browser.handoff');
  assert.equal(r1.args.url, 'https://github.com');

  const r2 = routeRequest('open the browser to sign into chatgpt.com');
  assert.equal(r2.route, 'TOOL_CALL');
  assert.equal(r2.capability, 'browser.handoff');
  assert.equal(r2.args.url, 'https://chatgpt.com');

  const r3 = routeRequest('sign into notion.so in the browser');
  assert.equal(r3.route, 'TOOL_CALL');
  assert.equal(r3.capability, 'browser.handoff');
  assert.equal(r3.args.url, 'https://notion.so');

  const r4 = routeRequest('open browser so I can sign in');
  assert.equal(r4.route, 'TOOL_CALL');
  assert.equal(r4.capability, 'browser.handoff');
  assert.equal(r4.args.url, null);
});

test('context assembler includes persistent Patchright browser guidance when browser tools are active', () => {
  const browserTools = [
    { id: 'browser.open', name: 'Open URL', description: 'Open URL', enabled: true, riskLevel: 'READ_ONLY', inputSchema: {} },
    { id: 'browser.navigate', name: 'Navigate', description: 'Navigate', enabled: true, riskLevel: 'READ_ONLY', inputSchema: {} }
  ];

  const result = assembleModelContext({
    query: 'open github.com and check notifications',
    conversations: [],
    memories: [],
    includeTools: true,
    tools: browserTools
  });

  const systemMessage = result.context.find((m) => m.role === 'system' && m.content.includes('BROWSER INSTRUCTION'));
  assert.ok(systemMessage, 'System message with BROWSER INSTRUCTION should be present');
  assert.match(systemMessage.content, /Patchright/i);
  assert.match(systemMessage.content, /browser\.handoff/);
  assert.match(systemMessage.content, /Terms of Service/);
});
