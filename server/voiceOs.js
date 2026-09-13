import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const asarMarker = `${path.sep}app.asar`;
const runtimeRoot = projectRoot.endsWith(asarMarker)
  ? `${projectRoot.slice(0, -asarMarker.length)}${path.sep}app.asar.unpacked`
  : projectRoot.replace(`${asarMarker}${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
const bridgeScript = path.join(runtimeRoot, 'windows', 'voice-os-bridge.ps1');
const DEFAULT_APPS = ['gmail', 'whatsapp', 'slack', 'discord', 'instagram', 'calendar'];
const SHORTCUT_MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Win'];
export const SHORTCUT_KEYS = [...SHORTCUT_MODIFIERS, 'Space', ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789'];
const events = [];
const dictationQueue = [];
let sequence = 0;
let bridgeLastSeenAt = null;
let bridgeProcess = null;
let bridgeLastError = null;

export const DEFAULT_VOICE_OS_SETTINGS = {
  enabled: true,
  topIsland: true,
  globalHotkeys: false,
  pushToTalkKey: 'Alt',
  dictationKey: 'Ctrl+Shift',
  notifications: { enabled: false, allApps: true, apps: DEFAULT_APPS },
};

export function voiceOsSettings(state = {}) {
  const saved = state.voiceOs?.settings || {};
  const safeShortcut = (value, fallback, label) => {
    try { return normalizeShortcut(value ?? fallback, label); }
    catch { return fallback; }
  };
  return {
    ...DEFAULT_VOICE_OS_SETTINGS,
    ...saved,
    pushToTalkKey: safeShortcut(saved.pushToTalkKey, DEFAULT_VOICE_OS_SETTINGS.pushToTalkKey, 'push-to-talk'),
    dictationKey: safeShortcut(saved.dictationKey, DEFAULT_VOICE_OS_SETTINGS.dictationKey, 'dictation'),
    notifications: { ...DEFAULT_VOICE_OS_SETTINGS.notifications, ...(saved.notifications || {}) },
  };
}

export function updateVoiceOsSettings(state, input = {}) {
  const current = voiceOsSettings(state);
  state.voiceOs ??= {};
  state.voiceOs.settings = {
    ...current,
    ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
    ...(typeof input.topIsland === 'boolean' ? { topIsland: input.topIsland } : {}),
    ...(typeof input.globalHotkeys === 'boolean' ? { globalHotkeys: input.globalHotkeys } : {}),
    ...(input.pushToTalkKey !== undefined ? { pushToTalkKey: normalizeShortcut(input.pushToTalkKey, 'push-to-talk') } : {}),
    ...(input.dictationKey !== undefined ? { dictationKey: normalizeShortcut(input.dictationKey, 'dictation') } : {}),
    notifications: {
      ...current.notifications,
      ...(typeof input.notifications?.enabled === 'boolean' ? { enabled: input.notifications.enabled } : {}),
      ...(typeof input.notifications?.allApps === 'boolean' ? { allApps: input.notifications.allApps } : {}),
      ...(Array.isArray(input.notifications?.apps) ? { apps: input.notifications.apps.map(String).filter((app) => DEFAULT_APPS.includes(app)) } : {}),
    },
  };
  return state.voiceOs.settings;
}

export function normalizeShortcut(value, label = 'voice') {
  const aliases = { control: 'Ctrl', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Win', super: 'Win', windows: 'Win', win: 'Win', space: 'Space' };
  const raw = String(value || '').split('+').map((part) => part.trim()).filter(Boolean);
  if (raw.some((part) => part.toLowerCase() === 'fn')) throw Object.assign(new Error(`Fn cannot be used for ${label}: standard Windows keyboard events do not expose the Fn key`), { code: 'REQUEST_ERROR' });
  const parts = raw.map((part) => aliases[part.toLowerCase()] || (/^f(?:[1-9]|1\d|2[0-4])$/i.test(part) ? part.toUpperCase() : (/^[a-z0-9]$/i.test(part) ? part.toUpperCase() : part)));
  if (!parts.length || parts.length > 4 || new Set(parts).size !== parts.length || parts.some((part) => !SHORTCUT_KEYS.includes(part))) throw Object.assign(new Error(`Unsupported ${label} shortcut`), { code: 'REQUEST_ERROR' });
  const modifiers = SHORTCUT_MODIFIERS.filter((modifier) => parts.includes(modifier));
  const primary = parts.filter((part) => !modifiers.includes(part));
  if (primary.length > 1) throw Object.assign(new Error(`${label} can contain only one non-modifier key`), { code: 'REQUEST_ERROR' });
  if (parts.length === 1 && ['Ctrl', 'Shift', 'Win'].includes(parts[0])) throw Object.assign(new Error(`${parts[0]} alone is not accepted because an undetectable Fn press could otherwise be saved as ${parts[0]}`), { code: 'REQUEST_ERROR' });
  return [...modifiers, ...primary].join('+');
}

export function publishVoiceOsEvent(input = {}) {
  const event = {
    id: ++sequence,
    type: String(input.type || 'status'),
    app: input.app ? String(input.app).toLowerCase() : null,
    title: String(input.title || ''),
    message: String(input.message || ''),
    contact: input.contact ? String(input.contact) : null,
    callId: input.callId ? String(input.callId) : null,
    at: new Date().toISOString(),
  };
  if (event.type.startsWith('hotkey.')) { bridgeLastSeenAt = event.at; bridgeLastError = null; }
  events.push(event);
  if (events.length > 100) events.splice(0, events.length - 100);
  return event;
}

export function voiceOsEvents(after = 0) {
  return events.filter((event) => event.id > Number(after || 0));
}

export function publishDictation(text) {
  const item = { id: ++sequence, text: String(text || '').slice(0, 4000), at: new Date().toISOString() };
  if (!item.text.trim()) throw Object.assign(new Error('Dictation text is required'), { code: 'REQUEST_ERROR' });
  dictationQueue.push(item); if (dictationQueue.length > 30) dictationQueue.shift(); return item;
}

export function nextDictation(after = 0) {
  return dictationQueue.find((item) => item.id > Number(after || 0)) || null;
}

export function voiceOsStatus(state = {}) {
  const nativeBridge = {
    platform: process.platform,
    available: process.platform === 'win32',
    running: process.platform === 'win32' && (Boolean(bridgeProcess && !bridgeProcess.killed) || Boolean(bridgeLastSeenAt && Date.now() - Date.parse(bridgeLastSeenAt) < 15_000)),
    lastSeenAt: bridgeLastSeenAt,
    lastError: process.platform === 'linux' ? 'Global press/release hotkeys are not enabled on Linux; Wayland intentionally restricts global input hooks.' : bridgeLastError,
  };
  return {
    settings: voiceOsSettings(state),
    supportedApps: DEFAULT_APPS,
    shortcutRules: { modifiers: SHORTCUT_MODIFIERS, keys: SHORTCUT_KEYS.filter((key) => !SHORTCUT_MODIFIERS.includes(key)), maximumKeys: 4, exclusive: false, fnSupported: false, fnReason: 'The Fn key is normally handled by keyboard firmware and is not exposed as a standard operating-system key event.' },
    browserControlConfigured: Boolean(process.env.VOICE_OS_CONTROL_URL),
    platformBridge: nativeBridge,
    windowsBridge: nativeBridge,
  };
}

export function validBridgeRequest(req) {
  const expected = String(process.env.VOICE_OS_BRIDGE_TOKEN || '');
  if (!expected) return req.socket?.remoteAddress === '127.0.0.1' || req.socket?.remoteAddress === '::1';
  const supplied = String(req.headers['x-jarvis-bridge-token'] || '');
  return supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function startWindowsVoiceBridge() {
  if (process.platform !== 'win32') throw Object.assign(new Error('The global hotkey bridge is available only on Windows.'), { code: 'CAPABILITY_UNAVAILABLE' });
  if (bridgeProcess && !bridgeProcess.killed) return { started: false, running: true };
  bridgeLastError = null;
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bridgeScript], { cwd: runtimeRoot, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  bridgeProcess = child;
  let stderr = '';
  bridgeProcess.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  bridgeProcess.stderr?.unref?.();
  child.once('exit', (code) => { if (code && !bridgeLastSeenAt) bridgeLastError = stderr.trim() || `Windows bridge exited with code ${code}`; if (bridgeProcess === child) bridgeProcess = null; });
  child.once('error', (error) => { bridgeLastError = error.message; if (bridgeProcess === child) bridgeProcess = null; });
  child.unref();
  return { started: true, running: true, pid: child.pid };
}

export function restartWindowsVoiceBridge() {
  if (bridgeProcess && !bridgeProcess.killed) {
    const previous = bridgeProcess; bridgeProcess = null;
    previous.kill();
  }
  return startWindowsVoiceBridge();
}

async function configuredControl(action, fetchImpl) {
  const endpoint = String(process.env.VOICE_OS_CONTROL_URL || '').trim();
  if (!endpoint) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/actions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(process.env.VOICE_OS_CONTROL_TOKEN ? { authorization: `Bearer ${process.env.VOICE_OS_CONTROL_TOKEN}` } : {}) },
      body: JSON.stringify(action),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || `Voice OS control bridge returned HTTP ${response.status}`);
    return { success: true, state: data.state || 'confirmed', provider: data.provider || 'control-bridge', data };
  } finally { clearTimeout(timer); }
}

function launchUri(uri) {
  return new Promise((resolve, reject) => {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', uri], { windowsHide: true, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export async function executeVoiceOsAction(input = {}, fetchImpl = fetch) {
  const action = { type: String(input.type || ''), app: String(input.app || 'windows').toLowerCase(), target: String(input.target || input.contact || '').trim(), callId: input.callId ? String(input.callId) : null, message: input.message ? String(input.message) : null };
  if (!['call.start', 'call.answer', 'call.reject', 'message.send'].includes(action.type)) throw Object.assign(new Error('Unsupported Voice OS action'), { code: 'REQUEST_ERROR' });
  const controlled = await configuredControl(action, fetchImpl);
  if (controlled) return { ...controlled, action };
  if (action.type === 'call.start' && action.target) {
    if (process.platform !== 'win32') throw Object.assign(new Error('Windows call handoff is unavailable on this platform.'), { code: 'CAPABILITY_UNAVAILABLE' });
    const target = action.target.replace(/[^+0-9]/g, '');
    if (!target) throw Object.assign(new Error('A phone number is required for Windows call handoff.'), { code: 'REQUEST_ERROR' });
    await launchUri(`tel:${encodeURIComponent(target)}`);
    return { success: true, state: 'handed_off', provider: 'windows-default-calling-app', action, message: 'The default Windows calling app was opened. Connection is not claimed until the calling app confirms it.' };
  }
  throw Object.assign(new Error(`${action.type} requires VOICE_OS_CONTROL_URL connected to a Windows-app or browser controller.`), { code: 'CAPABILITY_UNAVAILABLE' });
}
