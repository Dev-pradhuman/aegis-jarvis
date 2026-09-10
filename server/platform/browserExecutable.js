import { access } from 'node:fs/promises';
import { commandPath, platformError } from './common.js';

export function browserCandidates(env = process.env, platform = process.platform) {
  const configured = env.JARVIS_BROWSER_EXECUTABLE ? [env.JARVIS_BROWSER_EXECUTABLE] : [];
  if (platform === 'win32') return [...configured, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
  if (platform === 'darwin') return [...configured, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  return [...configured, 'google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium', 'microsoft-edge-stable', 'microsoft-edge', 'brave-browser', 'zen-browser', '/snap/bin/chromium'];
}

export async function findBrowserExecutable(options = {}) {
  for (const candidate of browserCandidates(options.env, options.platform)) {
    if (candidate.includes('/') || candidate.includes('\\')) { try { await access(candidate); return candidate; } catch {} }
    else { const found = await commandPath(candidate, options.env); if (found) return found; }
  }
  throw platformError('CONFIGURATION_MISSING', 'No supported Chromium browser was found. Install Chrome/Chromium or set JARVIS_BROWSER_EXECUTABLE. Flatpak browser wrappers are not accepted as Playwright executables.');
}
