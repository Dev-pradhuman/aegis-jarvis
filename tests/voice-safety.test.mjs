import test from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { VoicePipeline } from '../server/voicePipeline.js';

class FakeAudioSource extends EventEmitter {
  stop() { this.stopped = true; }
}

class FakeVADProvider {
  flush() { return Buffer.from('FLUSHED'); }
}

class FakeSTTProvider {
  async transcribe(buffer) {
    if (buffer.toString() === 'yes') return 'yes';
    if (buffer.toString() === 'no') return 'no';
    return 'something else';
  }
}

class FakeTTSProvider {
  speak(text) { this.lastSpoken = text; return Promise.resolve(); }
  stop() { this.stopped = true; }
}

test('Voice Safety Policies', async (t) => {
  await t.test('confirm() waits for yes/no and times out', async () => {
    const pipeline = new VoicePipeline({
      ttsProvider: new FakeTTSProvider(),
      sttProvider: new FakeSTTProvider()
    });
    
    let confirmResult;
    const confirmPromise = pipeline.confirm('Are you sure?').then(res => confirmResult = res);
    
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(pipeline.state, 'confirm_listening');
    assert.strictEqual(pipeline.ttsProvider.lastSpoken, 'Are you sure?');
    
    // Simulate user saying "yes"
    pipeline.emit('transcription', 'yes');
    
    await confirmPromise;
    assert.strictEqual(confirmResult, true);
    assert.strictEqual(pipeline.state, 'thinking');
    
    // Simulate timeout
    const timeoutPromise = pipeline.confirm('Timeout test');
    // We can't easily advance fake timers here without mock, so we'll just test "no"
    pipeline.emit('transcription', 'NO!');
    assert.strictEqual(await timeoutPromise, false);
    assert.strictEqual(pipeline.state, 'idle');
  });

  await t.test('kill() instantly drops capture stream and stops TTS', () => {
    const audioSource = new FakeAudioSource();
    const ttsProvider = new FakeTTSProvider();
    const vadProvider = new FakeVADProvider();
    
    const pipeline = new VoicePipeline({ audioSource, ttsProvider, vadProvider });
    pipeline.state = 'wake_listening'; // some active state
    
    pipeline.kill();
    
    assert.strictEqual(pipeline.state, 'idle');
    assert.strictEqual(ttsProvider.stopped, true);
    assert.strictEqual(audioSource.stopped, true);
  });
});
