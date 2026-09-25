import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const runDefault = promisify(execFile);
const options = { timeout: 5000, maxBuffer: 100_000, windowsHide: true };

function parseWpctl(text) {
  const match = String(text).match(/Volume:\s*([0-9.]+)/);
  if (!match) throw new Error('Could not parse WirePlumber volume');
  return { volume: Math.round(Number(match[1]) * 100), muted: /\bMUTED\b/.test(text), backend: 'pipewire' };
}

function parsePactl(volumeText, muteText) {
  const match = String(volumeText).match(/(\d+)%/);
  if (!match) throw new Error('Could not parse PulseAudio volume');
  return { volume: Number(match[1]), muted: /yes/i.test(muteText), backend: 'pulseaudio' };
}

export function createLinuxAudio(run = runDefault) {
  const call = async (program, args) => (await run(program, args, options)).stdout;
  async function getVolume() {
    try { return parseWpctl(await call('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'])); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const [volume, mute] = await Promise.all([call('pactl', ['get-sink-volume', '@DEFAULT_SINK@']), call('pactl', ['get-sink-mute', '@DEFAULT_SINK@'])]);
      return parsePactl(volume, mute);
    }
  }
  async function setVolume(value) {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw Object.assign(new Error('Volume must be an integer from 0 to 100'), { code: 'TOOL_INPUT_INVALID' });
    const current = await getVolume();
    if (current.backend === 'pipewire') await call('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', `${value}%`]);
    else await call('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${value}%`]);
    const actual = await getVolume();
    if (Math.abs(actual.volume - value) > 2) throw Object.assign(new Error('Volume change could not be verified'), { code: 'ACTION_NOT_VERIFIED' });
    return actual;
  }
  async function setMuted(muted) {
    const current = await getVolume();
    if (current.backend === 'pipewire') await call('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', muted ? '1' : '0']);
    else await call('pactl', ['set-sink-mute', '@DEFAULT_SINK@', muted ? '1' : '0']);
    const actual = await getVolume();
    if (actual.muted !== muted) throw Object.assign(new Error('Mute change could not be verified'), { code: 'ACTION_NOT_VERIFIED' });
    return actual;
  }
  return { getVolume, setVolume, setMuted, volumeUp: async (step = 5) => setVolume(Math.min(100, (await getVolume()).volume + step)), volumeDown: async (step = 5) => setVolume(Math.max(0, (await getVolume()).volume - step)) };
}
