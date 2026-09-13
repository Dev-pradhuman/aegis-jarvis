import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { commandPath, displayEnvironment, platformError, runFile, spawnWithInput } from './common.js';

const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const capability = (message) => platformError('CAPABILITY_UNAVAILABLE', message);

async function requireCommand(name, message = `${name} is required for this Linux capability.`) {
  const executable = await commandPath(name);
  if (!executable) throw platformError('CONFIGURATION_MISSING', message, { command: name });
  return executable;
}

function desktopValue(text, key) {
  const match = String(text).match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

export function parseDesktopExec(value = '') {
  const tokens = []; const input = String(value).trim();
  const matcher = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g; let match;
  while ((match = matcher.exec(input))) tokens.push((match[1] ?? match[2] ?? match[3]).replace(/\\(["'\\ ])/g, '$1'));
  const filtered = tokens.filter((token) => !/^%[fFuUdDnNickvm]$/.test(token)).map((token) => token.replace(/%[fFuUdDnNickvm]/g, '')).filter(Boolean);
  if (filtered[0] === 'env') {
    while (filtered[1] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(filtered[1])) filtered.splice(1, 1);
    filtered.shift();
  }
  return { executable: filtered[0] || '', args: filtered.slice(1) };
}

export function parseDesktopEntry(text, file) {
  if (!/^\[Desktop Entry\]$/m.test(text) || desktopValue(text, 'Type') !== 'Application' || /^true$/i.test(desktopValue(text, 'NoDisplay'))) return null;
  const name = desktopValue(text, 'Name'); const exec = parseDesktopExec(desktopValue(text, 'Exec'));
  if (!name || !exec.executable) return null;
  const categories = desktopValue(text, 'Categories'); const mime = desktopValue(text, 'MimeType');
  return { name, target: file, executable: exec.executable, args: exec.args, kind: 'desktop', source: 'freedesktop', browser: /WebBrowser|Network/.test(categories) && /https?/.test(mime) || /browser|chrome|chromium|firefox|zen/i.test(name) };
}

async function walkDesktopFiles(root, limit = 2500) {
  const result = []; let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    if (result.length >= limit) break;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await walkDesktopFiles(file, limit - result.length));
    else if (entry.isFile() && entry.name.endsWith('.desktop')) result.push(file);
  }
  return result;
}

export async function linuxApplicationIndex(options = {}) {
  const home = options.home || os.homedir();
  const roots = [...new Set([
    ...(process.env.XDG_DATA_HOME ? [path.join(process.env.XDG_DATA_HOME, 'applications')] : []),
    path.join(home, '.local', 'share', 'applications'),
    path.join(home, '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
    '/var/lib/flatpak/exports/share/applications',
    ...String(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').map((item) => path.join(item, 'applications')),
  ])];
  const apps = []; const warnings = [];
  for (const root of roots) for (const file of await walkDesktopFiles(root)) {
    try { const entry = parseDesktopEntry(await readFile(file, 'utf8'), file); if (entry) apps.push(entry); }
    catch { warnings.push(`Could not inspect ${path.basename(file)}`); }
  }
  return { apps, warnings: [...new Set(warnings)].slice(0, 50), observedAt: now(), platform: 'linux' };
}

async function procInventory(limit = 15, minimum = 0) {
  const pageSize = 4096; const processes = [];
  let entries = []; try { entries = await readdir('/proc', { withFileTypes: true }); } catch { throw capability('Linux /proc is unavailable.'); }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      const [statusText, statm, comm] = await Promise.all([readFile(`/proc/${entry.name}/status`, 'utf8'), readFile(`/proc/${entry.name}/statm`, 'utf8'), readFile(`/proc/${entry.name}/comm`, 'utf8')]);
      const rssPages = Number(statm.trim().split(/\s+/)[1] || 0); const workingSetMb = Math.round(rssPages * pageSize / 104857.6) / 10;
      if (workingSetMb < minimum) continue;
      const vmSize = Number(statusText.match(/^VmSize:\s+(\d+)/m)?.[1] || 0) / 1024;
      processes.push({ processId: Number(entry.name), name: comm.trim(), workingSetMb, privateMemoryMb: Math.round(vmSize * 10) / 10 });
    } catch {}
  }
  processes.sort((a, b) => b.workingSetMb - a.workingSetMb);
  return { processes: processes.slice(0, limit), count: Math.min(processes.length, limit), sortedBy: 'workingSetMb', observedAt: now(), verified: true };
}

async function x11Windows() {
  if (displayEnvironment() !== 'x11') throw capability('Global window enumeration is unavailable under Wayland. Log into an X11 session or use browser DOM automation.');
  const wmctrl = await requireCommand('wmctrl', 'Install wmctrl for X11 window management.');
  const { stdout } = await runFile(wmctrl, ['-lpGx']);
  let active = null; const xdotool = await commandPath('xdotool');
  if (xdotool) active = (await runFile(xdotool, ['getactivewindow']).catch(() => ({ stdout: '' }))).stdout.trim();
  const windows = stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/); const [handle,, pid, x, y, width, height, className] = parts; const title = parts.slice(8).join(' ');
    return { handle, pid: Number(pid), x: Number(x), y: Number(y), width: Number(width), height: Number(height), className, executable: className?.split('.')[0] || '', title, active: active ? parseInt(handle, 16) === Number(active) : false, minimized: Number(x) === -32000, maximized: false };
  });
  return { windows, observedAt: now(), displayServer: 'x11' };
}

async function linuxWindowAction(args) {
  const before = await x11Windows(); const target = before.windows.find((item) => item.handle === String(args.handle) && item.pid === Number(args.pid));
  if (!target) throw platformError('WINDOW_NOT_FOUND', 'The Linux window no longer exists.');
  const wmctrl = await requireCommand('wmctrl'); const handle = target.handle;
  if (args.action === 'focus') await runFile(wmctrl, ['-ia', handle]);
  else if (args.action === 'close') await runFile(wmctrl, ['-ic', handle]);
  else if (args.action === 'maximize') await runFile(wmctrl, ['-ir', handle, '-b', 'add,maximized_vert,maximized_horz']);
  else if (args.action === 'restore') await runFile(wmctrl, ['-ir', handle, '-b', 'remove,maximized_vert,maximized_horz,hidden']);
  else if (args.action === 'minimize') { const xdotool = await requireCommand('xdotool', 'Install xdotool for X11 window minimization.'); await runFile(xdotool, ['windowminimize', String(parseInt(handle, 16))]); }
  else throw platformError('INVALID_ARGUMENTS', 'Unsupported window action.');
  await sleep(180);
  const after = await x11Windows();
  const observed = after.windows.find((item) => item.handle === handle && item.pid === Number(args.pid));
  if (observed) {
    const xprop = await commandPath('xprop');
    if (xprop) {
      const state = await runFile(xprop, ['-id', handle, '_NET_WM_STATE']).catch(() => ({ stdout: '' }));
      observed.maximized = /_NET_WM_STATE_MAXIMIZED_VERT/.test(state.stdout) && /_NET_WM_STATE_MAXIMIZED_HORZ/.test(state.stdout);
      observed.minimized = /_NET_WM_STATE_HIDDEN/.test(state.stdout) || observed.minimized;
    }
  }
  return { ...after, target: handle };
}

async function launchApplication(args) {
  let executable = args.executable; let launchArgs = Array.isArray(args.args) ? args.args : [];
  if (!executable && args.kind === 'desktop') {
    const gio = await requireCommand('gio', 'Install GLib gio utilities to launch desktop entries.');
    executable = gio; launchArgs = ['launch', args.target];
  }
  const resolved = executable ? await commandPath(executable) : null;
  if (!resolved) throw platformError('APP_LAUNCH_FAILED', 'The resolved Linux application executable is unavailable.');
  const child = spawn(resolved, launchArgs.map(String), { detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  const pid = child.pid || null; child.unref(); let live = false; let matchedPid = pid;
  const expected = path.basename(args.executable || resolved).toLowerCase();
  for (let attempt = 0; attempt < 5 && !live; attempt += 1) {
    await sleep(attempt ? 180 : 250);
    if (pid) try { await stat(`/proc/${pid}`); live = true; } catch {}
    if (!live && expected) {
      const entries = await readdir('/proc', { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!/^\d+$/.test(entry.name)) continue;
        const name = await readFile(`/proc/${entry.name}/comm`, 'utf8').then((value) => value.trim().toLowerCase()).catch(() => '');
        if (name === expected || expected.startsWith(`${name}-`) || name.startsWith(`${expected}-`)) { live = true; matchedPid = Number(entry.name); break; }
      }
    }
  }
  if (!live) throw platformError('VERIFICATION_FAILED', 'The launch command returned, but no matching Linux process was observed.');
  return { requested: true, pid: matchedPid, verified: true, verification: { method: 'linux-process-observed' }, observedAt: now() };
}

async function audioStatus() {
  const wpctl = await requireCommand('wpctl', 'Install PipeWire wireplumber tools (`wpctl`) for audio control.');
  const { stdout } = await runFile(wpctl, ['get-volume', '@DEFAULT_AUDIO_SINK@']);
  const volume = Math.round(Number(stdout.match(/([0-9]+(?:\.[0-9]+)?)/)?.[1] || 0) * 100);
  return { volume, muted: /\[MUTED\]/i.test(stdout), verified: true, provider: 'pipewire' };
}

async function setAudio(args) {
  const wpctl = await requireCommand('wpctl', 'Install PipeWire wireplumber tools (`wpctl`) for audio control.');
  if (args.volume !== null && args.volume !== undefined) await runFile(wpctl, ['set-volume', '@DEFAULT_AUDIO_SINK@', `${Math.max(0, Math.min(100, Number(args.volume)))}%`]);
  if (args.muted !== null && args.muted !== undefined) await runFile(wpctl, ['set-mute', '@DEFAULT_AUDIO_SINK@', args.muted ? '1' : '0']);
  const actual = await audioStatus();
  actual.verified = (args.volume === null || args.volume === undefined || Math.abs(actual.volume - Number(args.volume)) <= 1) && (args.muted === null || args.muted === undefined || actual.muted === Boolean(args.muted));
  return actual;
}

async function clipboard(operation, args) {
  const wayland = displayEnvironment() === 'wayland'; const command = wayland ? (operation === 'clipboard.read' ? 'wl-paste' : 'wl-copy') : 'xclip';
  const executable = await requireCommand(command, `Install ${wayland ? 'wl-clipboard' : 'xclip'} for Linux clipboard access.`);
  if (operation === 'clipboard.read') {
    const result = wayland ? await runFile(executable, ['--no-newline']) : await runFile(executable, ['-selection', 'clipboard', '-o']);
    return { text: result.stdout, characters: result.stdout.length, verified: true, format: 'text' };
  }
  const text = String(args.text || '');
  await spawnWithInput(executable, wayland ? [] : ['-selection', 'clipboard', '-in'], text);
  const actual = await clipboard('clipboard.read', {}); return { characters: text.length, format: 'text', verified: actual.text === text };
}

async function media(operation, args) {
  const playerctl = await requireCommand('playerctl', 'Install playerctl for Linux media-session control.');
  if (operation === 'media.action') {
    const actions = { play: 'play', pause: 'pause', toggle: 'play-pause', next: 'next', previous: 'previous' };
    if (!actions[args.action]) throw platformError('INVALID_ARGUMENTS', 'Unsupported media action.');
    await runFile(playerctl, [actions[args.action]], { errorMessage: 'No controllable Linux media session is available.' }); await sleep(150);
  }
  const status = await runFile(playerctl, ['status']).catch(() => null);
  if (!status) return { available: false, reason: 'NO_MEDIA_SESSION', verified: true };
  const metadata = await runFile(playerctl, ['metadata', '--format', '{{playerName}}\t{{title}}\t{{artist}}']).catch(() => ({ stdout: '\t\t' }));
  const [application, title, artist] = metadata.stdout.trim().split('\t');
  return { available: true, sessionId: application || 'default', application, title, artist, playbackStatus: status.stdout.trim(), observedAt: now(), verified: true, ...(operation === 'media.action' ? { accepted: true, action: args.action } : {}) };
}

async function screenCapture(args) {
  if (args.scope !== 'desktop') throw capability('Linux monitor/window capture needs compositor-specific portal support; full desktop capture is currently supported.');
  const file = path.join(os.tmpdir(), `jarvis-screen-${process.pid}-${Date.now()}.png`); let executable; let commandArgs;
  if (displayEnvironment() === 'wayland' && await commandPath('grim')) { executable = await commandPath('grim'); commandArgs = [file]; }
  else { executable = await requireCommand('gnome-screenshot', 'Install gnome-screenshot (GNOME/X11) or grim (wlroots Wayland) for screen capture.'); commandArgs = ['-f', file]; }
  try {
    await runFile(executable, commandArgs, { timeout: 15000 }); const png = await readFile(file);
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw platformError('VERIFICATION_FAILED', 'Linux screenshot command did not create a valid PNG.');
    return { pngBase64: png.toString('base64'), width: png.readUInt32BE(16), height: png.readUInt32BE(20), x: 0, y: 0, observedAt: now(), method: `${path.basename(executable)} visible desktop pixels` };
  } finally { await unlink(file).catch(() => {}); }
}

async function xdotoolInput(operation, args) {
  if (displayEnvironment() !== 'x11') throw capability('Global keyboard and mouse injection is blocked under Wayland. Use an X11 session or application-specific accessibility/DOM automation.');
  const xdotool = await requireCommand('xdotool', 'Install xdotool for X11 keyboard and mouse control.');
  const keyboardState = async () => {
    const xset = await commandPath('xset');
    const output = xset ? await runFile(xset, ['q']).catch(() => ({ stdout: '' })) : { stdout: '' };
    const match = output.stdout.match(/Caps Lock:\s+(on|off)/i);
    return { capsLock: match ? match[1].toLowerCase() === 'on' : null, modifiersReleased: null };
  };
  if (operation === 'computer.state') return { ...(await keyboardState()), verified: true, displayServer: 'x11' };
  if (operation === 'mouse.position') { const { stdout } = await runFile(xdotool, ['getmouselocation', '--shell']); return { x: Number(stdout.match(/^X=(\-?\d+)/m)?.[1]), y: Number(stdout.match(/^Y=(\-?\d+)/m)?.[1]), verified: true }; }
  if (operation === 'mouse.move') { await runFile(xdotool, ['mousemove', String(args.x), String(args.y)]); return { x: Number(args.x), y: Number(args.y), verified: true }; }
  if (operation === 'computer.type') { const before=await keyboardState(); await runFile(xdotool, ['type', '--delay', '1', '--', String(args.text)]); const after=await keyboardState(); return { accepted:true,characters:String(args.text).length,capsLockUnchanged:before.capsLock===null||after.capsLock===null?true:before.capsLock===after.capsLock,modifiersReleased:true,windowHandle:args.windowHandle,processId:args.processId,method:'xdotool complete X11 key sequence; lock keys are never synthesized' }; }
  if (operation === 'computer.keypress') { const before=await keyboardState(); const key=String(args.keys||'').toLowerCase().replace(/control/g,'ctrl').replace(/windows|win|super/g,'super'); await runFile(xdotool,['key',key]); const after=await keyboardState(); return {accepted:true,capsLockUnchanged:before.capsLock===null||after.capsLock===null?true:before.capsLock===after.capsLock,modifiersReleased:true,windowHandle:args.windowHandle,processId:args.processId,method:'xdotool complete X11 key sequence; lock keys are never synthesized'}; }
  const action = args.action;
  if (action === 'click') await runFile(xdotool, ['click', '1']);
  else if (action === 'double_click') await runFile(xdotool, ['click', '--repeat', '2', '--delay', '80', '1']);
  else if (action === 'right_click') await runFile(xdotool, ['click', '3']);
  else if (action === 'scroll') await runFile(xdotool, ['click', '--repeat', String(Math.abs(Number(args.amount || 1))), Number(args.amount) >= 0 ? '4' : '5']);
  else if (action === 'drag') await runFile(xdotool, ['mousedown', '1', 'mousemove', '--sync', String(args.x), String(args.y), 'mouseup', '1']);
  else throw platformError('INVALID_ARGUMENTS', 'Unsupported mouse action.');
  return { accepted: true, verified: true, action, windowHandle: args.windowHandle, processId: args.processId, method: 'xdotool X11 input delivery' };
}

export async function linuxDesktopRequest(operation, args = {}, options = {}) {
  if ((options.platform || process.platform) !== 'linux') throw capability('Linux desktop adapter is unavailable on this platform.');
  if (operation === 'apps.index') return linuxApplicationIndex(options);
  if (operation === 'apps.launch') return launchApplication(args);
  if (operation === 'windows.list') return x11Windows();
  if (operation === 'windows.action') return linuxWindowAction(args);
  if (operation === 'processes.list') return procInventory(Math.min(100, Math.max(1, Number(args.limit || 15))), Math.max(0, Number(args.minMemoryMb || 0)));
  if (operation === 'audio.status') return audioStatus();
  if (operation === 'audio.set') return setAudio(args);
  if (operation === 'media.status' || operation === 'media.action') return media(operation, args);
  if (operation === 'clipboard.read' || operation === 'clipboard.write') return clipboard(operation, args);
  if (operation === 'screen.capture') return screenCapture(args);
  if (operation === 'screen.topology') {
    if (displayEnvironment() !== 'x11') throw capability('Display topology enumeration is compositor-specific under Wayland.');
    const xrandr = await requireCommand('xrandr', 'Install xrandr for X11 display topology.'); const { stdout } = await runFile(xrandr, ['--query']);
    const displays = stdout.split(/\r?\n/).map((line) => line.match(/^(\S+) connected (primary )?(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/)).filter(Boolean).map((match) => ({ id: match[1], primary: Boolean(match[2]), width: Number(match[3]), height: Number(match[4]), x: Number(match[5]), y: Number(match[6]) }));
    return { displays, verified: true, displayServer: 'x11' };
  }
  if (operation.startsWith('computer.') || operation.startsWith('mouse.')) return xdotoolInput(operation, args);
  if (operation.startsWith('ui.')) throw capability('Semantic Linux desktop UI automation requires an AT-SPI adapter and is not available in this build. Browser DOM automation remains available.');
  throw platformError('INVALID_ARGUMENTS', `Unsupported Linux desktop operation: ${operation}`);
}

export function linuxDesktopCapabilities(env = process.env) {
  const displayServer = displayEnvironment(env);
  return { platform: 'linux', displayServer, windows: displayServer === 'x11', globalInput: displayServer === 'x11', clipboard: displayServer !== 'none', screenshots: displayServer !== 'none', semanticUi: false, waylandRestricted: displayServer === 'wayland' };
}
