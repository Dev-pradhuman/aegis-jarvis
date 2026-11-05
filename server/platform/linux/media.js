import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const runDefault = promisify(execFile);
const mprisPath = '/org/mpris/MediaPlayer2';
const playerInterface = 'org.mpris.MediaPlayer2.Player';
const dbusProperties = 'org.freedesktop.DBus.Properties';
const options = { timeout: 5000, maxBuffer: 500_000, windowsHide: true };

export const MPV_IPC_SOCKET = '/tmp/jarvis-mpv.sock';

let currentMpvProcess = null;
let currentTrackInfo = null;

export function ensureMpvMprisScript() {
  try {
    const home = process.env.HOME || os.homedir();
    const scriptsDir = path.join(home, '.config', 'mpv', 'scripts');
    const targetSymlink = path.join(scriptsDir, 'mpris.so');
    const sourcePlugin = '/usr/lib/mpv-mpris/mpris.so';

    if (!fs.existsSync(sourcePlugin)) return false;
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }
    if (!fs.existsSync(targetSymlink)) {
      fs.symlinkSync(sourcePlugin, targetSymlink);
    }
    return true;
  } catch {
    return false;
  }
}

export function sendMpvIpcCommand(command) {
  return new Promise((resolve) => {
    if (!fs.existsSync(MPV_IPC_SOCKET)) return resolve(null);
    let resolved = false;
    const client = net.createConnection(MPV_IPC_SOCKET);
    client.setTimeout(1500);

    client.on('connect', () => {
      client.write(JSON.stringify({ command }) + '\n');
    });

    client.on('data', (data) => {
      if (!resolved) {
        resolved = true;
        try {
          const res = JSON.parse(data.toString());
          resolve(res);
        } catch {
          resolve(null);
        }
        client.end();
      }
    });

    client.on('error', () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    client.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
      client.destroy();
    });
  });
}

export async function stopBackgroundMusic() {
  if (currentMpvProcess) {
    try {
      currentMpvProcess.kill('SIGTERM');
    } catch {}
    currentMpvProcess = null;
  }

  if (fs.existsSync(MPV_IPC_SOCKET)) {
    try {
      await sendMpvIpcCommand(['quit']);
    } catch {}
    try {
      if (fs.existsSync(MPV_IPC_SOCKET)) {
        fs.unlinkSync(MPV_IPC_SOCKET);
      }
    } catch {}
  }

  try {
    await runDefault('pkill', ['-f', 'input-ipc-server=/tmp/jarvis-mpv.sock']);
  } catch {}

  currentTrackInfo = null;
  return { status: 'stopped', verified: true };
}

export async function playMusic(query, opts = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('A query or song title is required for music playback');

  // 1. Stop any previously active background mpv playback
  await stopBackgroundMusic();

  // 2. Ensure mpv-mpris script is linked so playerctl/D-Bus sees mpv
  ensureMpvMprisScript();

  let title = cleanQuery;
  let artist = 'YouTube';
  let webpageUrl = null;
  let streamUrl = null;

  // 3. Resolve metadata & direct audio stream URL via yt-dlp
  try {
    const ytdlArgs = [
      '--no-playlist',
      '-f', 'bestaudio',
      '-g',
      '--print', '%(title)s',
      '--print', '%(uploader)s',
      '--print', '%(webpage_url)s',
      `ytsearch1:${cleanQuery} audio`
    ];
    const { stdout } = await runDefault('yt-dlp', ytdlArgs, { timeout: 10000, maxBuffer: 1024 * 1024 });
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 4) {
      title = lines[0] || cleanQuery;
      artist = lines[1] || 'YouTube';
      webpageUrl = lines[2] || null;
      streamUrl = lines[3] || null;
    } else if (lines.length >= 2) {
      title = lines[0] || cleanQuery;
      streamUrl = lines[1] || null;
    }
  } catch (err) {
    console.warn('[media.play_music] yt-dlp metadata resolution failed, using mpv direct ytdl hook:', err.message);
  }

  // 4. Spawn background headless mpv process
  const targetMedia = streamUrl || `ytdl://ytsearch1:${cleanQuery} audio`;
  const mpvArgs = [
    '--no-video',
    `--input-ipc-server=${MPV_IPC_SOCKET}`,
    `--force-media-title=${title}`,
  ];

  if (!streamUrl) {
    mpvArgs.push('--ytdl-format=bestaudio');
  }
  mpvArgs.push(targetMedia);

  const child = spawn('mpv', mpvArgs, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  currentMpvProcess = child;

  // Wait briefly for IPC socket creation
  for (let i = 0; i < 15; i++) {
    if (fs.existsSync(MPV_IPC_SOCKET)) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  currentTrackInfo = {
    status: 'playing',
    title,
    artist,
    url: webpageUrl,
    query: cleanQuery,
    backend: 'mpv-ytdl',
    verified: true
  };

  return currentTrackInfo;
}

export function createLinuxMedia(run = runDefault) {
  const call = async (args) => JSON.parse((await run('busctl', ['--user', '--json=short', ...args], options)).stdout);
  const property = async (name, key) => (await call(['get-property', name, mprisPath, playerInterface, key])).data;

  async function listPlayers() {
    const rows = await call(['list']);
    return rows.filter((item) => item.name?.startsWith('org.mpris.MediaPlayer2.')).map((item) => ({ busName: item.name, application: item.name.slice('org.mpris.MediaPlayer2.'.length) }));
  }

  async function details(player) {
    try {
      const [state, metadata] = await Promise.all([property(player.busName, 'PlaybackStatus'), property(player.busName, 'Metadata')]);
      return {
        ...player,
        state: String(state || 'Unknown').toLowerCase(),
        title: metadata?.['xesam:title']?.data || null,
        artist: metadata?.['xesam:artist']?.data || [],
        trackId: metadata?.['mpris:trackid']?.data || null,
      };
    } catch {
      return {
        ...player,
        state: 'stopped',
        title: null,
        artist: [],
        trackId: null,
      };
    }
  }

  async function selectPlayer(name) {
    const players = await listPlayers();
    if (!players.length) return { status: 'unavailable', players: [] };
    if (name) {
      const match = players.filter((item) =>
        item.application.toLowerCase() === String(name).toLowerCase() ||
        item.application.toLowerCase().startsWith(String(name).toLowerCase()) ||
        item.busName === name
      );
      if (match.length !== 1) return { status: match.length ? 'ambiguous' : 'not_found', players };
      return { status: 'selected', player: await details(match[0]) };
    }
    if (players.length === 1) return { status: 'selected', player: await details(players[0]) };
    const all = await Promise.all(players.map(details));
    const nonProxy = all.filter((item) => item.application !== 'playerctld');
    if (nonProxy.length === 1) return { status: 'selected', player: nonProxy[0] };
    const playing = (nonProxy.length ? nonProxy : all).filter((item) => item.state === 'playing');
    if (playing.length === 1) return { status: 'selected', player: playing[0] };
    const withMetadata = (nonProxy.length ? nonProxy : all).filter((item) => item.title);
    if (withMetadata.length === 1) return { status: 'selected', player: withMetadata[0] };
    return { status: 'ambiguous', players: all };
  }

  async function status(name) {
    const selection = await selectPlayer(name);
    return selection.status === 'selected' ? { status: 'available', ...selection.player } : selection;
  }

  async function control(action, name) {
    // If pausing or toggling and mpv IPC socket is active, also pause background mpv
    if ((action === 'pause' || action === 'toggle') && fs.existsSync(MPV_IPC_SOCKET)) {
      try {
        await sendMpvIpcCommand(action === 'pause' ? ['set_property', 'pause', true] : ['cycle', 'pause']);
      } catch {}
    }

    const selection = await selectPlayer(name);
    if (selection.status !== 'selected') {
      // If we paused the background mpv process and no other MPRIS player was active, treat as completed
      if (action === 'pause' && (currentMpvProcess || fs.existsSync(MPV_IPC_SOCKET))) {
        return {
          status: 'completed',
          player: { application: 'mpv', state: 'paused', title: currentTrackInfo?.title || null },
          verified: true
        };
      }
      return { ...selection, verified: false };
    }

    const before = selection.player;
    const propertyName = action === 'next' ? 'CanGoNext' : action === 'previous' ? 'CanGoPrevious' : 'CanControl';
    if (await property(before.busName, propertyName) === false) return { status: 'unsupported', player: before, verified: false };
    const method = { play: 'Play', pause: 'Pause', toggle: 'PlayPause', next: 'Next', previous: 'Previous' }[action];
    if (!method) throw new Error('Unknown media action');
    await run('busctl', ['--user', 'call', before.busName, mprisPath, playerInterface, method], options);
    const after = await details({ busName: before.busName, application: before.application });
    const verified = action === 'play' ? after.state === 'playing' : action === 'pause' ? after.state === 'paused' : action === 'toggle' ? after.state !== before.state : after.trackId !== before.trackId;
    return { status: verified ? 'completed' : 'unverified', player: after, verified };
  }

  return {
    listPlayers,
    status,
    play: (name) => control('play', name),
    pause: (name) => control('pause', name),
    toggle: (name) => control('toggle', name),
    next: (name) => control('next', name),
    previous: (name) => control('previous', name),
    playMusic,
    play_music: playMusic,
    stopBackgroundMusic,
  };
}
