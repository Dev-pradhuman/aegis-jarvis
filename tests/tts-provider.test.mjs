import test from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { PiperProvider } from '../server/ttsProvider.js';

test('Piper TTS Provider', async (t) => {
  await t.test('fails when model is missing', async () => {
    const provider = new PiperProvider({
      modelPath: join(process.cwd(), 'does-not-exist.onnx'),
      audioPlayback: { playStream: async () => {}, stop: () => {} }
    });
    await assert.rejects(
      provider.speak('Hello'),
      { code: 'MODEL_MISSING' }
    );
  });
});
