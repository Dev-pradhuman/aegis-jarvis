import test from 'node:test';
import assert from 'node:assert/strict';
import { browserManager } from '../server/browser/index.js';

test('browserManager challenge state and resume flow', async () => {
  // Simulate challenge state
  browserManager.state = 'HUMAN_ACTION_REQUIRED';
  browserManager.pending = {
    action: 'navigate',
    url: 'https://example.com/login',
    challenge: { title: 'Cloudflare Turnstile' },
    headed: true,
  };

  const status = browserManager.getStatus();
  assert.equal(status.humanActionRequired, true);
  assert.equal(status.state, 'HUMAN_ACTION_REQUIRED');
  assert.equal(status.pending.url, 'https://example.com/login');
  assert.equal(status.pending.challenge.title, 'Cloudflare Turnstile');

  // When engine.challenge() is false (solved), resume succeeds
  browserManager.engine = {
    kind: 'firefox',
    headed: true,
    url: () => 'https://example.com/dashboard',
    challenge: async () => null,
    close: async () => {},
  };

  const resumed = await browserManager.resume();
  assert.equal(resumed.status.state, 'FIREFOX_ACTIVE');
  assert.equal(browserManager.getStatus().humanActionRequired, false);

  await browserManager.close();
});
