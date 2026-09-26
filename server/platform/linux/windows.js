import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const bridge = fileURLToPath(new URL('./kwin_window_bridge.py', import.meta.url));

export function windowError(code, message) {
  return Object.assign(new Error(message), { code });
}

const normalized = (value) => String(value || '').toLowerCase().replace(/\.desktop$/, '').replace(/[^a-z0-9]/g, '');
const aliases = { vscode: ['code', 'visualstudiocode', 'codium'], visualstudiocode: ['code', 'codium'] };

export function resolveWindow(windows, target) {
  if (!target) return null;
  if (target.windowId) {
    const match = windows.find((window) => window.windowId === target.windowId);
    if (!match || target.appId && normalized(match.appId) !== normalized(target.appId) || target.processId && match.processId !== target.processId) throw windowError('WINDOW_NOT_FOUND', 'The exact target window is unavailable');
    return match;
  }
  const query = normalized(typeof target === 'string' ? target : target.appId || target.name || target.title);
  if (!query) throw windowError('WINDOW_NOT_FOUND', 'A window target is required');
  const terms = [query, ...(aliases[query] || [])];
  let matches = windows.filter((window) => terms.includes(normalized(window.appId)));
  if (!matches.length) matches = windows.filter((window) => terms.includes(normalized(window.title)));
  if (!matches.length && query.length >= 4) matches = windows.filter((window) => terms.some((term) => normalized(window.appId).includes(term) || normalized(window.title).includes(term)));
  if (!matches.length) throw windowError('WINDOW_NOT_FOUND', `No window matches ${query}`);
  if (matches.length > 1) throw windowError('AMBIGUOUS_TARGET', `Multiple windows match ${query}`);
  return matches[0];
}

export function createLinuxWindows({ desktopEnvironment = process.env.XDG_CURRENT_DESKTOP || '', displayServer = process.env.XDG_SESSION_TYPE || '', run = exec } = {}) {
  const supported = /\bKDE\b|\bPlasma\b/i.test(desktopEnvironment) && ['wayland', 'x11'].includes(displayServer);
  let queue = Promise.resolve();
  function request(action, windowId) {
    if (!supported) return Promise.reject(windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${desktopEnvironment || 'this desktop'} ${displayServer || ''}`));
    const task = queue.catch(() => {}).then(async () => {
      let stdout;
      try { ({ stdout } = await run('python3', [bridge, JSON.stringify({ action, ...(windowId ? { windowId } : {}) })], { timeout: 5500, maxBuffer: 1_000_000 })); }
      catch (error) { throw windowError('WINDOW_BACKEND_UNAVAILABLE', error.message); }
      let result;
      try { result = JSON.parse(stdout); } catch { throw windowError('WINDOW_BACKEND_ERROR', 'Invalid KWin window response'); }
      if (!result.ok) throw windowError(result.code || 'WINDOW_BACKEND_ERROR', result.message || 'Window action failed');
      return result;
    });
    queue = task;
    return task;
  }
  return {
    supported,
    provider: supported ? 'kwin-script-dbus' : null,
    list: async () => (await request('list')).windows,
    getActive: async () => (await request('active')).window,
    async find(target) { return resolveWindow(await this.list(), target); },
    async focus(target) {
      const window = await this.find(target);
      await request('focus', window.windowId);
      const active = await this.getActive();
      if (active?.windowId !== window.windowId) throw windowError('WINDOW_FOCUS_FAILED', 'KWin did not activate the requested window');
      return active;
    },
    async minimize(target) {
      const window = await this.find(target);
      await request('minimize', window.windowId);
      const updated = await this.find({ windowId: window.windowId });
      if (!updated.minimized) throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Minimize was not verified');
      return updated;
    },
    async maximize(target) {
      const window = await this.find(target);
      await request('maximize', window.windowId);
      const updated = await this.find({ windowId: window.windowId });
      if (!updated.maximized) throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Maximize was not verified');
      return updated;
    },
    async restore(target) {
      const window = await this.find(target);
      await request('restore', window.windowId);
      const updated = await this.find({ windowId: window.windowId });
      if (updated.minimized || updated.maximized) throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Restore was not verified');
      return updated;
    },
    async close(target) {
      const window = await this.find(target);
      await request('close', window.windowId);
      for (let attempt = 0; attempt < 8; attempt++) {
        if (!(await this.list()).some((item) => item.windowId === window.windowId)) return { windowId: window.windowId, closed: true };
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Window close was requested but not verified');
    },
  };
}
