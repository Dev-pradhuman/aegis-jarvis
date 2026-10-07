import test from 'node:test';
import assert from 'node:assert';
import { WakeWordProvider } from '../server/wakeWordProvider.js';
import { VoicePipeline } from '../server/voicePipeline.js';

test('Wake Word Provider', async (t) => {
  await t.test('detects wake word', () => {
    const provider = new WakeWordProvider({ cooldownMs: 0 });
    assert.strictEqual(provider.process(Buffer.from('NOISE')), false);
    assert.strictEqual(provider.process(Buffer.from('WAKE')), true);
  });

  await t.test('respects cooldown', () => {
    const provider = new WakeWordProvider({ cooldownMs: 1000 });
    assert.strictEqual(provider.process(Buffer.from('WAKE')), true);
    assert.strictEqual(provider.process(Buffer.from('WAKE')), false); // blocked by cooldown
  });

  await t.test('push-to-talk works without wake word installed', () => {
    const provider = new WakeWordProvider({ isInstalled: false });
    assert.strictEqual(provider.process(Buffer.from('WAKE')), false);
    
    const pipeline = new VoicePipeline({ wakeWordProvider: provider });
    assert.strictEqual(pipeline.state, 'idle');
    pipeline.pushToTalk();
    assert.strictEqual(pipeline.state, 'capturing');
  });
});
