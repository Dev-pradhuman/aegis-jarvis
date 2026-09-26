import { createLinuxApps } from './apps.js';
import { createLinuxAudio } from './audio.js';
import { createLinuxMedia } from './media.js';
import { createLinuxClipboard } from './clipboard.js';
import { createLinuxScreen } from './screen.js';
import { createLinuxInput } from './input.js';
import { createLinuxWindows } from './windows.js';

export function createLinuxPlatform(options = {}) {
  const displayServer = options.env?.XDG_SESSION_TYPE || process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'unknown');
  const desktopEnvironment = options.env?.XDG_CURRENT_DESKTOP || process.env.XDG_CURRENT_DESKTOP || 'unknown';
  return {
    os: 'linux',
    displayServer,
    desktopEnvironment,
    windows: createLinuxWindows({ desktopEnvironment, displayServer, run: options.windowRun }),
    apps: createLinuxApps(options),
    audio: createLinuxAudio(options.run),
    media: createLinuxMedia(options.run),
    clipboard: createLinuxClipboard({ run: options.run, displayServer }),
    screen: createLinuxScreen({ run: options.run, directory: options.screenshotDirectory }),
    input: createLinuxInput(options.inputOptions),
  };
}
