import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import { resolveInstalledApplication, resolveInstalledBrowser } from './applicationIndex.js';
import { desktopRequest } from './desktopBridge.js';

const APPLICATIONS = {
  notepad: { label: 'Notepad', executable: 'notepad.exe', args: [] },
  calculator: { label: 'Calculator', executable: 'calc.exe', args: [] },
  paint: { label: 'Paint', executable: 'mspaint.exe', args: [] },
  explorer: { label: 'File Explorer', executable: 'explorer.exe', args: [] },
  terminal: { label: 'Windows Terminal', executable: 'wt.exe', args: [] },
  settings: { label: 'Windows Settings', executable: 'explorer.exe', args: ['ms-settings:'] },
};

const ALIASES = new Map([
  ['notepad', 'notepad'], ['note pad', 'notepad'], ['text editor', 'notepad'],
  ['calculator', 'calculator'], ['calc', 'calculator'],
  ['paint', 'paint'], ['mspaint', 'paint'],
  ['file explorer', 'explorer'], ['explorer', 'explorer'], ['files', 'explorer'],
  ['terminal', 'terminal'], ['windows terminal', 'terminal'],
  ['settings', 'settings'], ['windows settings', 'settings'],
]);

export function resolveWindowsApplication(value = '') {
  const normalized = String(value).toLowerCase().trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  const id = ALIASES.get(normalized);
  return id ? { id, ...APPLICATIONS[id] } : null;
}

export function supportedWindowsApplications() {
  return Object.entries(APPLICATIONS).map(([id, app]) => ({ id, label: app.label }));
}

export async function launchWindowsApplication(value, options = {}) {
  if ((options.platform || process.platform) !== 'win32') throw Object.assign(new Error('Windows application launching is available only on Windows.'), { code: 'CAPABILITY_UNAVAILABLE' });
  const application = await resolveInstalledApplication(value, options);
  const bridge = options.bridge || desktopRequest;
  await bridge('apps.launch', { kind: application.kind, target: application.target });
  let previousHandles = new Set();
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await bridge('windows.list');
    const observed = snapshot.windows.filter((window) => (application.appId && window.appId === application.appId) || (application.executable && window.executable?.toLowerCase() === application.executable.toLowerCase()));
    const stable = observed.filter((window) => previousHandles.has(`${window.handle}:${window.pid}`));
    if (stable.length) return { success: true, opened: true, state: 'running', appId: application.id, label: application.name, provider: 'windows', verification: { method: 'native-window-identity', windows: stable.map(({handle,pid}) => ({handle,pid})), observedAt: snapshot.observedAt } };
    previousHandles = new Set(observed.map((window) => `${window.handle}:${window.pid}`));
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 250));
  }
  throw Object.assign(new Error('Launch was requested, but no matching application window was observed. The action was not confirmed.'), { code: 'VERIFICATION_FAILED' });
}

export async function openWindowsUrl(value, options = {}) {
  if ((options.platform || process.platform) !== 'win32') throw Object.assign(new Error('Opening a browser is available only on Windows.'), { code: 'CAPABILITY_UNAVAILABLE' });
  let url;
  try { url = new URL(String(value || '')); } catch { throw Object.assign(new Error('A valid web address is required.'), { code: 'REQUEST_ERROR' }); }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Only HTTP and HTTPS addresses can be opened.'), { code: 'REQUEST_ERROR' });
  if (url.username || url.password) throw Object.assign(new Error('Web addresses containing credentials cannot be opened.'), { code: 'REQUEST_ERROR' });
  const spawn = options.spawn || nodeSpawn;
  const requestedBrowser = String(options.browser || '').trim();
  if (requestedBrowser) {
    const application = await (options.resolveBrowser || resolveInstalledBrowser)(requestedBrowser, options);
    const executable = application.executable || (application.kind === 'executable' ? application.target : '');
    if (!executable || !path.win32.isAbsolute(executable) || path.win32.extname(executable).toLowerCase() !== '.exe') throw Object.assign(new Error(`The resolved application "${application.name || requestedBrowser}" cannot accept a web address directly.`), { code: 'APP_LAUNCH_FAILED' });
    const pid = await new Promise((resolve, reject) => {
      const child = spawn(executable, [url.href], { detached: true, windowsHide: false, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref?.(); resolve(child.pid || null); });
    });
    return { success: true, verified: true, state: 'launched', action: 'open_url', url: url.href, provider: 'windows-named-browser', browser: { id: application.id, name: application.name || requestedBrowser }, pid, verification: { method: 'process-spawn-acknowledgement' } };
  }
  await new Promise((resolve, reject) => {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url.href], { detached: true, windowsHide: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref?.(); resolve(); });
  });
  return { success: true, verified: true, state: 'launched', action: 'open_url', url: url.href, provider: 'windows-default-browser', verification: { method: 'windows-url-handler-acknowledgement' } };
}
