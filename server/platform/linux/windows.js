import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const bridge = fileURLToPath(new URL('./kwin_window_bridge.py', import.meta.url));

export function windowError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function ensureHyprlandEnv(env = process.env) {
  if (process.platform !== 'linux') return false;

  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const runtimeDir = env.XDG_RUNTIME_DIR || `/run/user/${uid}`;
  if (!env.XDG_RUNTIME_DIR && fs.existsSync(runtimeDir)) {
    env.XDG_RUNTIME_DIR = runtimeDir;
  }

  // 1. Detect WAYLAND_DISPLAY if missing
  if (!env.WAYLAND_DISPLAY && fs.existsSync(runtimeDir)) {
    try {
      const files = fs.readdirSync(runtimeDir);
      const waylandSocket = files.find((f) => /^wayland-\d+$/.test(f));
      if (waylandSocket) {
        env.WAYLAND_DISPLAY = waylandSocket;
      }
    } catch {}
  }

  // 2. Detect HYPRLAND_INSTANCE_SIGNATURE if missing
  if (!env.HYPRLAND_INSTANCE_SIGNATURE) {
    const candidateDirs = [
      path.join(runtimeDir, 'hypr'),
      '/tmp/hypr',
    ];
    for (const hyprDir of candidateDirs) {
      if (fs.existsSync(hyprDir)) {
        try {
          const entries = fs.readdirSync(hyprDir);
          const sigs = entries.filter((e) => !e.startsWith('.'));
          if (sigs.length > 0) {
            env.HYPRLAND_INSTANCE_SIGNATURE = sigs[0];
            break;
          }
        } catch {}
      }
    }
  }

  if (env.HYPRLAND_INSTANCE_SIGNATURE) {
    if (!env.XDG_CURRENT_DESKTOP || env.XDG_CURRENT_DESKTOP === 'unknown') {
      env.XDG_CURRENT_DESKTOP = 'Hyprland';
    }
    return true;
  }

  return Boolean(env.HYPRLAND_INSTANCE_SIGNATURE || /hyprland/i.test(env.XDG_CURRENT_DESKTOP || ''));
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

export function createLinuxWindows(options = {}) {
  const desktopEnvironment = options.desktopEnvironment || process.env.XDG_CURRENT_DESKTOP || '';
  const displayServer = options.displayServer || process.env.XDG_SESSION_TYPE || '';
  const run = options.run || exec;

  const getIsKde = () => {
    const de = options.desktopEnvironment !== undefined ? options.desktopEnvironment : (process.env.XDG_CURRENT_DESKTOP || '');
    const ds = options.displayServer !== undefined ? options.displayServer : (process.env.XDG_SESSION_TYPE || '');
    return /\bKDE\b|\bPlasma\b/i.test(de) && ['wayland', 'x11'].includes(ds);
  };

  const getIsHyprland = () => {
    if (getIsKde()) return false;
    ensureHyprlandEnv();
    const de = options.desktopEnvironment !== undefined ? options.desktopEnvironment : (process.env.XDG_CURRENT_DESKTOP || '');
    return Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE || /hyprland/i.test(de));
  };

  const hyprlandImpl = {
    async list() {
      try {
        const { stdout } = await run('hyprctl', ['clients', '-j'], { timeout: 4000 });
        const clients = JSON.parse(stdout);
        return (Array.isArray(clients) ? clients : []).map((c) => ({
          windowId: c.address,
          appId: c.class,
          title: c.title,
          processId: c.pid,
          active: c.focusHistoryID === 0,
          minimized: Boolean(c.hidden),
          maximized: Boolean(c.fullscreen),
          geometry: Array.isArray(c.at) && Array.isArray(c.size) ? { x: c.at[0], y: c.at[1], width: c.size[0], height: c.size[1] } : undefined,
        }));
      } catch (error) {
        throw windowError('WINDOW_BACKEND_UNAVAILABLE', `Hyprland client list failed: ${error.message}`);
      }
    },
    async getActive() {
      try {
        const { stdout } = await run('hyprctl', ['activewindow', '-j'], { timeout: 4000 });
        const data = JSON.parse(stdout);
        if (!data || !data.address) return null;
        return {
          windowId: data.address,
          appId: data.class,
          title: data.title,
          processId: data.pid,
          active: true,
          minimized: false,
          maximized: Boolean(data.fullscreen),
          geometry: Array.isArray(data.at) && Array.isArray(data.size) ? { x: data.at[0], y: data.at[1], width: data.size[0], height: data.size[1] } : undefined,
        };
      } catch {
        return null;
      }
    },
    async find(target) {
      return resolveWindow(await this.list(), target);
    },
    async focus(target) {
      const window = await this.find(target);
      await run('hyprctl', ['repl', `hl.dispatch(hl.dsp.focus({ window = "address:${window.windowId}" }))`], { timeout: 4000 });
      return window;
    },
    async minimize(target) {
      const window = await this.find(target);
      await run('hyprctl', ['repl', `hl.dispatch(hl.dsp.window.bring_to_top())`], { timeout: 4000 });
      return { ...window, minimized: true };
    },
    async maximize(target) {
      const window = await this.find(target);
      await run('hyprctl', ['repl', `hl.dispatch(hl.dsp.focus({ window = "address:${window.windowId}" })); hl.dispatch(hl.dsp.window.fullscreen())`], { timeout: 4000 });
      return { ...window, maximized: true };
    },
    async restore(target) {
      const window = await this.find(target);
      await run('hyprctl', ['repl', `hl.dispatch(hl.dsp.focus({ window = "address:${window.windowId}" })); hl.dispatch(hl.dsp.window.fullscreen())`], { timeout: 4000 });
      return { ...window, maximized: false, minimized: false };
    },
    async close(target) {
      const window = await this.find(target);
      await run('hyprctl', ['repl', `hl.dispatch(hl.dsp.window.close({ window = "address:${window.windowId}" }))`], { timeout: 4000 });
      return { windowId: window.windowId, closed: true };
    },
  };

  let queue = Promise.resolve();
  function kwinRequest(action, windowId) {
    if (!getIsKde()) return Promise.reject(windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`));
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
  const kwinImpl = {
    list: async () => (await kwinRequest('list')).windows,
    getActive: async () => (await kwinRequest('active')).window,
    async find(target) { return resolveWindow(await this.list(), target); },
    async focus(target) {
      const window = await this.find(target);
      await kwinRequest('focus', window.windowId);
      const active = await this.getActive();
      if (active?.windowId !== window.windowId) throw windowError('WINDOW_FOCUS_FAILED', 'KWin did not activate the requested window');
      return active;
    },
    async minimize(target) {
      const window = await this.find(target);
      await kwinRequest('minimize', window.windowId);
      const updated = await this.find({ windowId: window.windowId });
      if (!updated.minimized) throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Minimize was not verified');
      return updated;
    },
    async maximize(target) {
      const window = await this.find(target);
      await kwinRequest('maximize', window.windowId);
      const updated = await this.find({ windowId: window.windowId });
      if (!updated.maximized) throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Maximize was not verified');
      return updated;
    },
    async restore(target) {
      const window = await this.find(target);
      await kwinRequest('restore', window.windowId);
      const updated = await this.find({ windowId: window.windowId });
      if (updated.minimized || updated.maximized) throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Restore was not verified');
      return updated;
    },
    async close(target) {
      const window = await this.find(target);
      await kwinRequest('close', window.windowId);
      for (let attempt = 0; attempt < 8; attempt++) {
        if (!(await this.list()).some((item) => item.windowId === window.windowId)) return { windowId: window.windowId, closed: true };
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Window close was requested but not verified');
    },
  };

  const getActiveBackend = () => {
    if (getIsHyprland()) return hyprlandImpl;
    if (getIsKde()) return kwinImpl;
    return null;
  };

  return {
    get supported() {
      return Boolean(getIsHyprland() || getIsKde());
    },
    get provider() {
      if (getIsHyprland()) return 'hyprctl';
      if (getIsKde()) return 'kwin-script-dbus';
      return null;
    },
    async list() {
      const backend = getActiveBackend();
      if (!backend) throw windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`);
      return backend.list();
    },
    async getActive() {
      const backend = getActiveBackend();
      if (!backend) return null;
      return backend.getActive();
    },
    async find(target) {
      const backend = getActiveBackend();
      if (!backend) throw windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`);
      return backend.find(target);
    },
    async focus(target) {
      const backend = getActiveBackend();
      if (!backend) throw windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`);
      return backend.focus(target);
    },
    async minimize(target) {
      const backend = getActiveBackend();
      if (!backend) throw windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`);
      return backend.minimize(target);
    },
    async maximize(target) {
      const backend = getActiveBackend();
      if (!backend) throw windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`);
      return backend.maximize(target);
    },
    async restore(target) {
      const backend = getActiveBackend();
      if (!backend) throw windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`);
      return backend.restore(target);
    },
    async close(target) {
      const backend = getActiveBackend();
      if (!backend) throw windowError('WINDOW_OPERATION_UNSUPPORTED', `Window control is unavailable on ${process.env.XDG_CURRENT_DESKTOP || desktopEnvironment || 'this desktop'} ${process.env.XDG_SESSION_TYPE || displayServer || ''}`);
      return backend.close(target);
    },
  };
}
