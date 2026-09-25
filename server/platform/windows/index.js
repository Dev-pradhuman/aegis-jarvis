import { createWindowsApps } from './apps.js';
import { createWindowsAudio } from './audio.js';
import { createWindowsMedia } from './media.js';
import { createWindowsClipboard } from './clipboard.js';
import { createWindowsScreen } from './screen.js';

export function createWindowsPlatform(options = {}) {
  return { os: 'win32', displayServer: 'win32', desktopEnvironment: 'Windows Shell', apps: createWindowsApps(options), audio: createWindowsAudio(), media: createWindowsMedia(), clipboard: createWindowsClipboard(), screen: createWindowsScreen() };
}
