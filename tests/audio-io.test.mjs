import test from 'node:test';
import assert from 'node:assert';
import { AudioCapture, AudioPlayback } from '../server/audioIo.js';

test('AudioCapture', async (t) => {
  await t.test('spawns capture process and stops gracefully', () => {
    return new Promise(resolve => {
      const capture = new AudioCapture({ captureCommand: 'echo', captureArgs: ['TEST_AUDIO'] });
      capture.on('data', () => {});
      capture.start();
      capture.stop();
      assert.strictEqual(capture.process, null);
      resolve();
    });
  });
});

test('AudioPlayback', async (t) => {
  await t.test('spawns play process and stops gracefully', async () => {
    const play = new AudioPlayback({ playCommand: 'cat', playArgs: [] });
    const { PassThrough } = await import('node:stream');
    const fakeStream = new PassThrough();
    
    play.playStream(fakeStream).catch(() => {});
    play.stop();
    assert.strictEqual(play.process, null);
  });
});
