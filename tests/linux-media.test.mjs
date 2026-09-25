import assert from 'node:assert/strict';
import test from 'node:test';
import { createLinuxMedia } from '../server/platform/linux/media.js';

const bus = 'org.mpris.MediaPlayer2.Fixture';

test('MPRIS provider reads real-shaped player metadata and verifies playback', async () => {
  let state = 'Paused';
  let calls = 0;
  const run = async (program, args) => {
    assert.equal(program, 'busctl');
    if (args.includes('list')) return { stdout: JSON.stringify([{ name: bus }]) };
    if (args.includes('get-property')) {
      const key = args.at(-1);
      const data = key === 'PlaybackStatus' ? state : key === 'Metadata' ? { 'xesam:title': { type: 's', data: 'Fixture Song' }, 'xesam:artist': { type: 'as', data: ['Fixture Artist'] }, 'mpris:trackid': { type: 's', data: '/track/1' } } : true;
      return { stdout: JSON.stringify({ data }) };
    }
    if (args.includes('call')) { calls += 1; state = 'Playing'; return { stdout: '' }; }
    throw new Error(`Unexpected busctl args: ${args.join(' ')}`);
  };
  const media = createLinuxMedia(run);
  const before = await media.status();
  assert.equal(before.title, 'Fixture Song');
  assert.deepEqual(before.artist, ['Fixture Artist']);
  assert.equal(before.state, 'paused');
  const after = await media.play();
  assert.equal(after.status, 'completed');
  assert.equal(after.verified, true);
  assert.equal(calls, 1);
});

test('MPRIS provider refuses to guess among multiple paused players', async () => {
  const run = async (_program, args) => {
    if (args.includes('list')) return { stdout: JSON.stringify([{ name: bus }, { name: 'org.mpris.MediaPlayer2.Other' }]) };
    if (args.includes('get-property')) return { stdout: JSON.stringify({ data: args.at(-1) === 'PlaybackStatus' ? 'Paused' : {} }) };
    throw new Error('Media control must not run for ambiguous players');
  };
  const result = await createLinuxMedia(run).play();
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.verified, false);
});
