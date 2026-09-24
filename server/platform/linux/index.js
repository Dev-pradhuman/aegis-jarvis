import { createLinuxApps } from './apps.js';

export function createLinuxPlatform(options = {}) {
  const displayServer = options.env?.XDG_SESSION_TYPE || process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'unknown');
  return {
    os: 'linux',
    displayServer,
    desktopEnvironment: options.env?.XDG_CURRENT_DESKTOP || process.env.XDG_CURRENT_DESKTOP || 'unknown',
    apps: createLinuxApps(options),
  };
}
