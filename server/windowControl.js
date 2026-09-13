import { desktopRequest } from './desktopBridge.js';
import { normalizeAppName } from './applicationIndex.js';

let lastActive = null; let previousActive = null;
export async function listWindows(options = {}) {
  const data = await (options.bridge || desktopRequest)('windows.list');
  if (!Array.isArray(data.windows)) throw Object.assign(new Error('Invalid window observation'), { code: 'PROVIDER_ERROR' });
  const active = data.windows.find((window) => window.active) || null;
  if (active && active.handle !== lastActive?.handle) { previousActive = lastActive; lastActive = active; }
  return { ...data, active, previousActive };
}
export function resolveWindow(target, windows) {
  const query = normalizeAppName(target);
  let matches = windows.filter((window) => window.handle === String(target));
  if (!matches.length && query === 'active') matches = windows.filter((window) => window.active);
  if (!matches.length) matches = windows.filter((window) => normalizeAppName(window.title) === query || normalizeAppName(window.executable?.split(/[\\/]/).pop()) === query);
  if (!matches.length) matches = windows.filter((window) => normalizeAppName(window.title).includes(query));
  if (!query || !matches.length) throw Object.assign(new Error('No matching window is available.'), { code: 'WINDOW_NOT_FOUND' });
  if (matches.length !== 1) throw Object.assign(new Error('Multiple windows match. Select a window handle from windows.list.'), { code: 'WINDOW_AMBIGUOUS' });
  return matches[0];
}
export async function windowAction(action, target, options = {}) {
  const bridge = options.bridge || desktopRequest;
  const before = await listWindows(options); const window = resolveWindow(target, before.windows);
  const after = await bridge('windows.action', { action, handle: window.handle, pid: window.pid });
  const observed = after.windows.find((item) => item.handle === window.handle && item.pid === window.pid);
  const verified = action === 'close' ? !observed : action === 'focus' ? observed?.active : action === 'minimize' ? observed?.minimized : action === 'maximize' ? observed?.maximized : observed && !observed.minimized && !observed.maximized;
  if (!verified) throw Object.assign(new Error(action === 'close' ? 'The window remains open. It may require saving or confirmation.' : 'Windows did not confirm the requested window state.'), { code: 'VERIFICATION_FAILED' });
  return { action, target: { handle: window.handle, pid: window.pid }, verified: true, observed: observed || null, observedAt: after.observedAt };
}
