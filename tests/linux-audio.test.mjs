import assert from 'node:assert/strict';
import test from 'node:test';
import { createLinuxAudio } from '../server/platform/linux/audio.js';

test('PipeWire audio provider sets volume and verifies the actual state', async () => {
  let volume = 0.42;
  let muted = false;
  const calls = [];
  const run = async (program, args) => {
    calls.push([program, ...args]);
    if (args[0] === 'get-volume') return { stdout: `Volume: ${volume.toFixed(2)}${muted ? ' [MUTED]' : ''}` };
    if (args[0] === 'set-volume') volume = Number.parseInt(args[2], 10) / 100;
    if (args[0] === 'set-mute') muted = args[2] === '1';
    return { stdout: '' };
  };
  const audio = createLinuxAudio(run);
  assert.deepEqual(await audio.getVolume(), { volume: 42, muted: false, backend: 'pipewire' });
  assert.equal((await audio.setVolume(55)).volume, 55);
  assert.equal((await audio.setMuted(true)).muted, true);
  assert.ok(calls.some((call) => call[0] === 'wpctl' && call[1] === 'set-volume'));
  await assert.rejects(audio.setVolume(101), { code: 'TOOL_INPUT_INVALID' });
});

test('PulseAudio fallback works when wpctl is unavailable', async () => {
  const run = async (program, args) => {
    if (program === 'wpctl') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    if (args[0] === 'get-sink-volume') return { stdout: 'front-left: 32768 / 50% / -18.06 dB' };
    if (args[0] === 'get-sink-mute') return { stdout: 'Mute: no' };
    return { stdout: '' };
  };
  assert.deepEqual(await createLinuxAudio(run).getVolume(), { volume: 50, muted: false, backend: 'pulseaudio' });
});
