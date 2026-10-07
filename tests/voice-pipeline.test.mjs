import test from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { VoicePipeline } from '../server/voicePipeline.js';

class FakeAudioSource extends EventEmitter {
  emitData(chunk) {
    this.emit('data', chunk);
  }
}

class FakeWakeWordProvider {
  process(chunk) {
    return chunk === 'WAKE';
  }
}

class FakeVADProvider {
  process(chunk) {
    return chunk === 'SILENCE';
  }
  flush() {
    return Buffer.from('FAKE_AUDIO');
  }
}

class FakeSTTProvider {
  async transcribe(buffer) {
    if (buffer.toString() === 'FAKE_AUDIO') return 'hello jarvis';
    throw new Error('Transcription failed');
  }
}

class FakeTTSProvider {
  async speak(text) {
    return true;
  }
}

test('Voice Pipeline State Machine', async (t) => {
  await t.test('initializes to idle', () => {
    const pipeline = new VoicePipeline();
    assert.strictEqual(pipeline.state, 'idle');
  });

  await t.test('transitions through the full lifecycle successfully', async () => {
    const audioSource = new FakeAudioSource();
    const pipeline = new VoicePipeline({
      audioSource,
      wakeWordProvider: new FakeWakeWordProvider(),
      vadProvider: new FakeVADProvider(),
      sttProvider: new FakeSTTProvider(),
      ttsProvider: new FakeTTSProvider()
    });

    const states = [];
    pipeline.on('stateChange', state => states.push(state));

    let transcribedText = '';
    pipeline.on('transcription', text => transcribedText = text);

    pipeline.startListening();
    assert.strictEqual(pipeline.state, 'wake_listening');

    audioSource.emitData('NOISE');
    assert.strictEqual(pipeline.state, 'wake_listening');

    audioSource.emitData('WAKE');
    assert.strictEqual(pipeline.state, 'capturing');

    audioSource.emitData('SPEECH');
    assert.strictEqual(pipeline.state, 'capturing');

    audioSource.emitData('SILENCE');
    assert.strictEqual(pipeline.state, 'transcribing');

    // Transcribe is async, wait a tick
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(pipeline.state, 'thinking');
    assert.strictEqual(transcribedText, 'hello jarvis');

    await pipeline.speak('I am here');
    assert.strictEqual(pipeline.state, 'idle');

    assert.deepStrictEqual(states, [
      'wake_listening',
      'capturing',
      'transcribing',
      'thinking',
      'speaking',
      'idle'
    ]);
  });
});
