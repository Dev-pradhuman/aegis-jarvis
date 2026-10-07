import test from 'node:test';
import assert from 'node:assert/strict';
import { WakeWordProvider, MockWakeWordProvider } from '../server/wakeWordProvider.js';
import { EnergyVADProvider } from '../server/vadProvider.js';
import { WhisperProvider } from '../server/sttProvider.js';
import { PiperProvider } from '../server/ttsProvider.js';
import fs from 'node:fs/promises';

test('WP7: Voice real-engine bring-up and configuration', async (t) => {
  await t.test('WakeWordProvider defaults to NOT_IMPLEMENTED and rejects production heuristic selection', () => {
    const provider = new WakeWordProvider();
    assert.strictEqual(provider.status, 'NOT_IMPLEMENTED');
    assert.strictEqual(provider.isInstalled, false);

    // Any attempt to process audio chunks through real provider returns false (push-to-talk primary)
    const audioChunk = Buffer.from('TEST_AUDIO_WAKE_CHUNK');
    assert.strictEqual(provider.process(audioChunk), false);

    // Even if options try to enable it, production provider remains uninstalled
    const custom = new WakeWordProvider({ isInstalled: true, sensitivity: 0.8 });
    assert.strictEqual(custom.isInstalled, false);
    assert.strictEqual(custom.process(audioChunk), false);
  });

  await t.test('MockWakeWordProvider is isolated to tests only', () => {
    const mock = new MockWakeWordProvider({ isInstalled: true });
    assert.strictEqual(mock.process(Buffer.from('SILENT')), false);
    assert.strictEqual(mock.process(Buffer.from('AUDIO_WAKE_CHUNK')), true);
  });

  await t.test('EnergyVADProvider handles speech, silence, and noisy buffers', () => {
    const vad = new EnergyVADProvider({ silenceDurationMs: 10, energyThreshold: 1000 });

    // Loud speech chunk
    const speech = Buffer.alloc(100);
    for (let i = 0; i < 100; i += 2) speech.writeInt16LE(4000, i);

    // Low energy noise chunk (below threshold)
    const noise = Buffer.alloc(100);
    for (let i = 0; i < 100; i += 2) noise.writeInt16LE(200, i);

    // Absolute silence chunk
    const silence = Buffer.alloc(100);

    assert.strictEqual(vad.process(speech), false, 'Speaking in progress');
    assert.strictEqual(vad.process(noise), false, 'Noise below threshold does not immediately trigger end of speech');

    // Wait for silence duration threshold
    const start = Date.now();
    while (Date.now() - start < 15) {}

    assert.strictEqual(vad.process(silence), true, 'Detected end of speech');
    assert.ok(vad.flush().length >= 300);
  });

  await t.test('Whisper and Piper providers point to gitignored .cache/voice models', async () => {
    const whisper = new WhisperProvider();
    assert.match(whisper.modelPath, /\.cache\/voice\/whisper-tiny\.en\.bin/);

    const piper = new PiperProvider();
    assert.match(piper.modelPath, /\.cache\/voice\/piper-voice\.onnx/);
  });

  await t.test('Downloaded voice models are present, under 500 MB, and gitignored', async () => {
    const whisperStat = await fs.stat('.cache/voice/whisper-tiny.en.bin');
    const piperStat = await fs.stat('.cache/voice/piper-voice.onnx');
    const wakeStat = await fs.stat('.cache/voice/hey_jarvis.onnx');

    assert.ok(whisperStat.size < 500 * 1024 * 1024);
    assert.ok(piperStat.size < 500 * 1024 * 1024);
    assert.ok(wakeStat.size < 500 * 1024 * 1024);

    const totalMB = (whisperStat.size + piperStat.size + wakeStat.size) / (1024 * 1024);
    assert.ok(totalMB < 200, `Total voice models size (${totalMB}MB) must be well under limit`);
  });
});
