import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest } from '../server/router.js';

test('high-confidence deterministic routes avoid model calls', () => {
  const started = performance.now();
  const route = routeRequest('show my tasks');
  const elapsed = performance.now() - started;
  assert.deepEqual(route, { route: 'TOOL_CALL', capability: 'tasks.list', args: {}, confidence: 0.99 });
  assert.ok(elapsed < 50);
});

test('ambiguous requests use the model route instead of guessing a tool', () => {
  assert.equal(routeRequest('help me think through this').route, 'MODEL');
});

test('known browser destinations route deterministically', () => {
  const route = routeRequest('open youtube');
  assert.equal(route.capability, 'browser.open');
  assert.equal(route.args.url, 'https://www.youtube.com');
  assert.equal(route.confidence, 1);
});

test('application launch requests route through the canonical tool path', () => {
  assert.deepEqual(routeRequest('Open Spotify'), { route: 'TOOL_CALL', capability: 'apps.open', args: { name: 'Spotify' }, confidence: 0.99 });
});

test('latest email requests route directly to grounded Gmail', () => {
  assert.deepEqual(routeRequest('can you tell me latest 4 mails?'), { route: 'TOOL_CALL', capability: 'gmail.latest', args: { limit: 4 }, confidence: 0.99 });
  assert.equal(routeRequest('show my latest 99 emails').args.limit, 20);
});
