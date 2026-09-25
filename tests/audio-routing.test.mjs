import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest } from '../server/router.js';

test('simple audio commands route deterministically without a model', () => {
  assert.deepEqual(routeRequest('volume 50'), { route: 'TOOL_CALL', capability: 'audio.set_volume', args: { volume: 50 }, confidence: 0.99 });
  assert.equal(routeRequest('mute').capability, 'audio.mute');
  assert.equal(routeRequest('unmute').capability, 'audio.unmute');
  assert.equal(routeRequest('volume up').capability, 'audio.volume_up');
  assert.equal(routeRequest('what is the volume?').capability, 'audio.get_volume');
  assert.equal(routeRequest('volume 999').route, 'MODEL');
});
