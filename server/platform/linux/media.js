import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const runDefault = promisify(execFile);
const path = '/org/mpris/MediaPlayer2';
const playerInterface = 'org.mpris.MediaPlayer2.Player';
const dbusProperties = 'org.freedesktop.DBus.Properties';
const options = { timeout: 5000, maxBuffer: 500_000, windowsHide: true };

export function createLinuxMedia(run = runDefault) {
  const call = async (args) => JSON.parse((await run('busctl', ['--user', '--json=short', ...args], options)).stdout);
  const property = async (name, key) => (await call(['get-property', name, path, playerInterface, key])).data;
  async function listPlayers() {
    const rows = await call(['list']);
    return rows.filter((item) => item.name?.startsWith('org.mpris.MediaPlayer2.')).map((item) => ({ busName: item.name, application: item.name.slice('org.mpris.MediaPlayer2.'.length) }));
  }
  async function details(player) {
    const [state, metadata] = await Promise.all([property(player.busName, 'PlaybackStatus'), property(player.busName, 'Metadata')]);
    return {
      ...player,
      state: String(state || 'Unknown').toLowerCase(),
      title: metadata?.['xesam:title']?.data || null,
      artist: metadata?.['xesam:artist']?.data || [],
      trackId: metadata?.['mpris:trackid']?.data || null,
    };
  }
  async function selectPlayer(name) {
    const players = await listPlayers();
    if (!players.length) return { status: 'unavailable', players: [] };
    if (name) {
      const match = players.filter((item) => item.application.toLowerCase() === String(name).toLowerCase() || item.busName === name);
      if (match.length !== 1) return { status: match.length ? 'ambiguous' : 'not_found', players };
      return { status: 'selected', player: await details(match[0]) };
    }
    if (players.length === 1) return { status: 'selected', player: await details(players[0]) };
    const all = await Promise.all(players.map(details));
    const playing = all.filter((item) => item.state === 'playing');
    if (playing.length === 1) return { status: 'selected', player: playing[0] };
    return { status: 'ambiguous', players: all };
  }
  async function status(name) {
    const selection = await selectPlayer(name);
    return selection.status === 'selected' ? { status: 'available', ...selection.player } : selection;
  }
  async function control(action, name) {
    const selection = await selectPlayer(name);
    if (selection.status !== 'selected') return { ...selection, verified: false };
    const before = selection.player;
    const propertyName = action === 'next' ? 'CanGoNext' : action === 'previous' ? 'CanGoPrevious' : 'CanControl';
    if (await property(before.busName, propertyName) === false) return { status: 'unsupported', player: before, verified: false };
    const method = { play: 'Play', pause: 'Pause', toggle: 'PlayPause', next: 'Next', previous: 'Previous' }[action];
    if (!method) throw new Error('Unknown media action');
    await run('busctl', ['--user', 'call', before.busName, path, playerInterface, method], options);
    const after = await details({ busName: before.busName, application: before.application });
    const verified = action === 'play' ? after.state === 'playing' : action === 'pause' ? after.state === 'paused' : action === 'toggle' ? after.state !== before.state : after.trackId !== before.trackId;
    return { status: verified ? 'completed' : 'unverified', player: after, verified };
  }
  return { listPlayers, status, play: (name) => control('play', name), pause: (name) => control('pause', name), toggle: (name) => control('toggle', name), next: (name) => control('next', name), previous: (name) => control('previous', name) };
}
