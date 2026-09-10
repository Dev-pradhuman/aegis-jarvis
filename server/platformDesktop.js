import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import { applicationIndex, resolveInstalledApplication, resolveInstalledBrowser } from './applicationIndex.js';
import { desktopRequest } from './desktopBridge.js';
import { launchWindowsApplication, openWindowsUrl } from './windowsDesktop.js';
import { commandPath } from './platform/common.js';

function error(code, message) { return Object.assign(new Error(message), { code }); }

export async function launchApplication(value, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'win32') return launchWindowsApplication(value, options);
  if (platform !== 'linux') throw error('CAPABILITY_UNAVAILABLE', `Application launching is unavailable on ${platform}.`);
  const application = await resolveInstalledApplication(value, options);
  const result = await (options.bridge || desktopRequest)('apps.launch', application, { ...options, platform });
  if (!result?.verified) throw error('VERIFICATION_FAILED', 'Linux did not confirm that the application launch was accepted.');
  return { success: true, opened: true, state: 'running', appId: application.id, label: application.name, provider: 'linux', verification: result.verification, pid: result.pid || null };
}

function validatedUrl(value) {
  let url; try { url = new URL(String(value || '')); } catch { throw error('REQUEST_ERROR', 'A valid web address is required.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw error('REQUEST_ERROR', 'Only HTTP and HTTPS addresses can be opened.');
  if (url.username || url.password) throw error('REQUEST_ERROR', 'Web addresses containing credentials cannot be opened.');
  return url;
}

function spawnAcknowledged(executable, args, spawn = nodeSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { detached: true, windowsHide: true, stdio: 'ignore' });
    child.once('error', reject); child.once('spawn', () => { child.unref?.(); resolve(child.pid || null); });
  });
}

export async function openExternalUrl(value, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'win32') return openWindowsUrl(value, options);
  if (platform !== 'linux') throw error('CAPABILITY_UNAVAILABLE', `External browser launching is unavailable on ${platform}.`);
  const url = validatedUrl(value); const requestedBrowser = String(options.browser || '').trim();
  if (requestedBrowser) {
    const application = await (options.resolveBrowser || resolveInstalledBrowser)(requestedBrowser, options);
    const executable = await commandPath(application.executable);
    if (!executable) throw error('APP_LAUNCH_FAILED', `The resolved browser "${application.name || requestedBrowser}" cannot accept a URL directly.`);
    const pid = await spawnAcknowledged(executable, [...(application.args || []), url.href], options.spawn);
    return { success: true, verified: true, state: 'launched', action: 'open_url', url: url.href, provider: 'linux-named-browser', browser: { id: application.id, name: application.name || requestedBrowser }, pid, verification: { method: 'linux-process-spawn-acknowledgement' } };
  }
  const xdgOpen = await commandPath('xdg-open'); if (!xdgOpen) throw error('CONFIGURATION_MISSING', 'xdg-utils is required to open the default Linux browser.');
  const pid = await spawnAcknowledged(xdgOpen, [url.href], options.spawn);
  return { success: true, verified: true, state: 'launched', action: 'open_url', url: url.href, provider: 'linux-default-browser', pid, verification: { method: 'xdg-open-spawn-acknowledgement' } };
}

export async function listApplications(options = {}) { return applicationIndex(options); }
