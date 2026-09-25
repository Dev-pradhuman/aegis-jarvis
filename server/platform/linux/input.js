import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const helperPath = fileURLToPath(new URL('./portal_input.py', import.meta.url));
const keysyms = {
  enter: 0xff0d, return: 0xff0d, tab: 0xff09, escape: 0xff1b, esc: 0xff1b,
  space: 0x20, backspace: 0xff08, delete: 0xffff, insert: 0xff63,
  left: 0xff51, up: 0xff52, right: 0xff53, down: 0xff54,
  home: 0xff50, end: 0xff57, pageup: 0xff55, pagedown: 0xff56,
};
const modifiers = { ctrl: 0xffe3, control: 0xffe3, alt: 0xffe9, shift: 0xffe1, super: 0xffeb, meta: 0xffeb };

export function parseKeypress(value) {
  const parts = String(value || '').split('+').map((part) => part.trim().toLowerCase());
  if (!parts.length || parts.length > 5 || parts.some((part) => !part)) throw new Error('A key combination is required');
  const seen = new Set();
  const symbols = [];
  for (const part of parts) {
    const symbol = modifiers[part] ?? keysyms[part] ?? (/^f(?:[1-9]|1[0-2])$/.test(part) ? 0xffbd + Number(part.slice(1)) : /^[a-z0-9]$/.test(part) ? part.charCodeAt(0) : undefined);
    if (symbol === undefined || seen.has(symbol)) throw new Error(`Unsupported or repeated key: ${part}`);
    seen.add(symbol);
    symbols.push(symbol);
  }
  if (symbols.slice(0, -1).some((symbol) => !Object.values(modifiers).includes(symbol)) || Object.values(modifiers).includes(symbols.at(-1))) {
    throw new Error('Use modifiers followed by one ordinary key');
  }
  return symbols;
}

export function createLinuxInput({ spawnImpl = spawn, idleTimeoutMs = 120_000 } = {}) {
  let child = null;
  let reader = null;
  let sequence = 0;
  let pending = null;
  let idleTimer = null;

  function stop() {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (reader) reader.close();
    reader = null;
    const running = child;
    child = null;
    if (running) running.kill();
    if (pending) {
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.reject(Object.assign(new Error('Desktop input portal disconnected'), { code: 'INPUT_UNAVAILABLE' }));
    }
  }

  function ensureChild() {
    if (child) return;
    child = spawnImpl('python3', [helperPath], { stdio: ['pipe', 'pipe', 'ignore'] });
    reader = createInterface({ input: child.stdout });
    reader.on('line', (line) => {
      let reply;
      try { reply = JSON.parse(line); } catch { return; }
      if (!pending || reply.id !== pending.id) return;
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      if (reply.ok) current.resolve({ sent: reply.sent, devices: reply.devices, backend: 'xdg-desktop-portal', requiresUserConsent: true });
      else current.reject(Object.assign(new Error(reply.message || 'Desktop input failed'), { code: reply.code || 'INPUT_FAILED' }));
    });
    child.on('error', stop);
    child.on('exit', stop);
  }

  async function request(action, payload) {
    if (pending) throw Object.assign(new Error('Desktop input is busy'), { code: 'INPUT_BUSY' });
    clearTimeout(idleTimer);
    ensureChild();
    const id = ++sequence;
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending = null;
          reject(Object.assign(new Error('Desktop input timed out'), { code: 'INPUT_TIMEOUT' }));
          stop();
        }, 55_000);
        pending = { id, timer, resolve, reject };
        child.stdin.write(`${JSON.stringify({ id, action, ...payload })}\n`, (error) => {
          if (error) { stop(); reject(Object.assign(error, { code: 'INPUT_UNAVAILABLE' })); }
        });
      });
    } finally {
      if (child) idleTimer = setTimeout(stop, idleTimeoutMs).unref();
    }
  }

  return {
    startSession: () => request('start', {}),
    keypress: (keys) => request('keypress', { symbols: parseKeypress(keys) }),
    type: (text) => {
      if (typeof text !== 'string' || text.length > 500) throw new Error('Text must contain at most 500 characters');
      if (/[\u0000-\u001f\u007f]/u.test(text)) throw new Error('Use computer.keypress for Enter, Tab, and other control keys');
      return request('type', { text });
    },
    close: stop,
  };
}
