import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalOllamaMultimodalProvider, perceive } from '../server/perceptionProvider.js';

test('WP2: LocalOllamaMultimodalProvider local-only enforcement test', async (t) => {
  const provider = new LocalOllamaMultimodalProvider({ baseUrl: 'http://localhost:11434' });
  const fakeImage = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  // Test fails if it attempts to reach a non-local provider. We'll simulate fetch failure to localhost.
  await t.test('clean failure when no model installed', async () => {
    const fetchImpl = async () => {
      throw new Error('fetch failed');
    };
    await assert.rejects(
      provider.generate('test', fakeImage, fetchImpl),
      /Local perception provider unreachable \(no model installed or running\)/
    );
  });

  await t.test('perceive handles testMode with fake provider', async () => {
    const res = await perceive('test', fakeImage, { testMode: true });
    assert.strictEqual(res.reply, 'Fake perception response');
  });

  await t.test('enforces local provider usage, fails on non-local attempt', async () => {
    const nonLocalProvider = new LocalOllamaMultimodalProvider({ baseUrl: 'https://api.openai.com' });
    const fetchImpl = async (url) => {
      if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
         throw new Error('Test failed: Attempted to reach a non-local provider!');
      }
      return { ok: true, json: async () => ({ response: 'ok' }) };
    };

    await assert.rejects(
      nonLocalProvider.generate('test', fakeImage, fetchImpl),
      /Test failed: Attempted to reach a non-local provider!/
    );
  });
});
