import test from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { WhisperProvider, FakeSTTProvider } from '../server/sttProvider.js';

test('Whisper STT Provider', async (t) => {
  await t.test('fails cleanly when model is missing', async () => {
    const provider = new WhisperProvider({
      modelPath: join(process.cwd(), 'does-not-exist.bin')
    });
    await assert.rejects(
      provider.transcribe(Buffer.from('fake')),
      { code: 'MODEL_MISSING' }
    );
  });
});

test('Fake STT Provider', async (t) => {
  await t.test('returns mock text', async () => {
    const provider = new FakeSTTProvider({ mockText: 'hello' });
    const text = await provider.transcribe(Buffer.from('fake'));
    assert.strictEqual(text, 'hello');
  });

  await t.test('simulates failure', async () => {
    const provider = new FakeSTTProvider({ shouldFail: true, failCode: 'TIMEOUT' });
    await assert.rejects(
      provider.transcribe(Buffer.from('fake')),
      { code: 'TIMEOUT' }
    );
  });
});
