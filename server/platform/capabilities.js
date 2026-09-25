import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { osPlatform } from './index.js';

const run = promisify(execFile);
const unavailable = (reason) => ({ available: false, reason });

async function executable(name) {
  for (const directory of String(process.env.PATH || '').split(path.delimiter)) {
    try { await access(path.join(directory, name)); return true; } catch { /* continue */ }
  }
  return false;
}

async function clipboardBackend(displayServer) {
  try {
    const result = await run('busctl', ['--user', '--json=short', 'list'], { timeout: 5000, maxBuffer: 500_000 });
    if (JSON.parse(result.stdout).some((item) => item.name === 'org.kde.klipper')) return 'kde-klipper';
  } catch { /* check command backends */ }
  if (displayServer === 'wayland' && await executable('wl-copy') && await executable('wl-paste')) return 'wl-clipboard';
  if (displayServer === 'x11' && await executable('xclip')) return 'xclip';
  return null;
}

async function screenshotBackend(displayServer) {
  if (displayServer !== 'wayland' && displayServer !== 'x11') return null;
  if (!await executable('python3')) return null;
  try {
    await run('python3', ['-c', 'import dbus; from gi.repository import GLib'], { timeout: 3000, maxBuffer: 1000 });
    const result = await run('busctl', ['--user', 'introspect', 'org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop', 'org.freedesktop.portal.Screenshot'], { timeout: 5000, maxBuffer: 100_000 });
    return result.stdout.includes('.Screenshot') ? 'xdg-desktop-portal' : null;
  } catch { return null; }
}

async function inputBackend(displayServer) {
  if (displayServer !== 'wayland' && displayServer !== 'x11') return null;
  if (!await executable('python3')) return null;
  try {
    await run('python3', ['-c', 'import dbus; from gi.repository import GLib'], { timeout: 3000, maxBuffer: 1000 });
    const result = await run('busctl', ['--user', 'get-property', 'org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop', 'org.freedesktop.portal.RemoteDesktop', 'AvailableDeviceTypes'], { timeout: 5000, maxBuffer: 1000 });
    return Number(result.stdout.trim().split(/\s+/).at(-1)) & 1 ? 'xdg-desktop-portal' : null;
  } catch { return null; }
}

export async function computerCapabilities(platform = osPlatform) {
  const wayland = platform.os === 'linux' && platform.displayServer === 'wayland';
  const [audio, media, clipboard, screenBackend, keyboardBackend] = await Promise.all([
    platform.os === 'linux' ? platform.audio.getVolume().then((state) => ({ available: true, provider: state.backend })).catch((error) => unavailable(error.message)) : unavailable('Windows audio provider is not installed'),
    platform.os === 'linux' ? platform.media.listPlayers().then((players) => ({ available: true, provider: 'MPRIS', playerCount: players.length })).catch((error) => unavailable(error.message)) : unavailable('Windows media provider is not installed'),
    platform.os === 'linux' ? clipboardBackend(platform.displayServer).then((backend) => backend ? { available: true, provider: backend } : unavailable('No desktop clipboard backend detected')) : unavailable('Windows clipboard provider is not installed'),
    platform.os === 'linux' ? screenshotBackend(platform.displayServer) : null,
    platform.os === 'linux' ? inputBackend(platform.displayServer) : null,
  ]);
  return {
    os: platform.os, displayServer: platform.displayServer, desktopEnvironment: platform.desktopEnvironment,
    apps: { available: Boolean(platform.apps), provider: platform.os },
    audio, media, clipboard,
    keyboard: keyboardBackend && process.env.JARVIS_DESKTOP_INPUT === '1' && process.env.JARVIS_AUTH_TOKEN ? { available: true, provider: keyboardBackend, requiresUserConsent: true, requiresActionApproval: true, verified: false } : unavailable(keyboardBackend ? 'Set JARVIS_DESKTOP_INPUT=1 and JARVIS_AUTH_TOKEN to enable consent-based input' : 'Desktop RemoteDesktop portal keyboard access is unavailable'),
    mouse: unavailable(wayland ? 'Desktop pointer provider is not implemented' : 'Desktop pointer provider is not implemented'),
    windows: unavailable(wayland ? 'KWin window provider is not implemented' : 'Window provider is not implemented'),
    screen: screenBackend ? { available: true, provider: screenBackend, targets: ['desktop'], requiresUserConsent: true } : unavailable('Desktop screenshot portal or Python D-Bus bindings are unavailable'),
  };
}
