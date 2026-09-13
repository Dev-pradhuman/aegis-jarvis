import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { normalizeApplicationIndex, searchApplications } from '../server/applicationIndex.js';
import { linuxDesktopCapabilities, linuxDesktopRequest, parseDesktopEntry, parseDesktopExec } from '../server/platform/linuxDesktop.js';
import { browserCandidates } from '../server/platform/browserExecutable.js';
import { dataDirectory } from '../server/platform/paths.js';
import { launchApplication, openExternalUrl } from '../server/platformDesktop.js';

test('Linux XDG data location is used without hardcoding a username', () => {
  assert.equal(dataDirectory('/project', { XDG_DATA_HOME: '/tmp/xdg-data' }, 'linux'), path.join('/tmp/xdg-data', 'aegis-jarvis'));
  assert.equal(dataDirectory('/project', { JARVIS_DATA_DIR: '/tmp/custom' }, 'linux'), path.resolve('/tmp/custom'));
});

test('freedesktop entries are parsed without shell evaluation', () => {
  const entry = parseDesktopEntry('[Desktop Entry]\nType=Application\nName=Firefox\nExec=/usr/bin/firefox %u\nCategories=Network;WebBrowser;\nMimeType=x-scheme-handler/http;x-scheme-handler/https;\n', '/usr/share/applications/firefox.desktop');
  assert.equal(entry.name, 'Firefox'); assert.equal(entry.executable, '/usr/bin/firefox'); assert.deepEqual(entry.args, []); assert.equal(entry.browser, true);
  assert.deepEqual(parseDesktopExec('env MOZ_ENABLE_WAYLAND=1 "/opt/Zen Browser/zen" --new-window %U'), { executable: '/opt/Zen Browser/zen', args: ['--new-window'] });
});

test('Linux desktop applications participate in canonical app resolution', () => {
  const apps = normalizeApplicationIndex([{ name: 'Visual Studio Code', target: '/usr/share/applications/code.desktop', executable: '/usr/bin/code', kind: 'desktop', browser: false }]);
  assert.equal(searchApplications('vscode', apps)[0].name, 'Visual Studio Code');
});

test('Linux launch proposal uses the injected canonical bridge and verifies it', async () => {
  let invocation;
  const output = await launchApplication('Firefox', { platform: 'linux', apps: [{ name: 'Firefox', target: '/usr/share/applications/firefox.desktop', executable: '/usr/bin/firefox', kind: 'desktop' }], bridge: async (operation, args) => { invocation = { operation, args }; return { pid: 42, verified: true, verification: { method: 'linux-process-observed' } }; } });
  assert.equal(invocation.operation, 'apps.launch'); assert.equal(invocation.args.executable, '/usr/bin/firefox'); assert.equal(output.provider, 'linux'); assert.equal(output.opened, true);
});

test('named Linux browser opening passes the URL as an argument, never a shell string', async () => {
  let observed;
  const result = await openExternalUrl('https://example.com/path?q=one', { platform: 'linux', browser: 'Node browser fixture', resolveBrowser: async () => ({ id: 'fixture', name: 'Node browser fixture', executable: process.execPath, args: ['--version'] }), spawn: (file, args) => { observed = { file, args }; return { pid: 7, once(event, callback) { if (event === 'spawn') queueMicrotask(callback); return this; }, unref() {} }; } });
  assert.equal(observed.file, process.execPath); assert.deepEqual(observed.args, ['--version', 'https://example.com/path?q=one']); assert.equal(result.provider, 'linux-named-browser');
});

test('Wayland restrictions are explicit and do not pretend global automation works', async () => {
  const previousType = process.env.XDG_SESSION_TYPE; const previousDisplay = process.env.WAYLAND_DISPLAY;
  process.env.XDG_SESSION_TYPE = 'wayland'; process.env.WAYLAND_DISPLAY = 'wayland-0';
  try {
    const capabilities = linuxDesktopCapabilities(); assert.equal(capabilities.waylandRestricted, true); assert.equal(capabilities.globalInput, false);
    await assert.rejects(() => linuxDesktopRequest('windows.list', {}, { platform: 'linux' }), (error) => error.code === 'CAPABILITY_UNAVAILABLE' && /Wayland/.test(error.message));
    await assert.rejects(() => linuxDesktopRequest('computer.type', { text: 'test' }, { platform: 'linux' }), (error) => error.code === 'CAPABILITY_UNAVAILABLE' && /Wayland/.test(error.message));
  } finally {
    if (previousType === undefined) delete process.env.XDG_SESSION_TYPE; else process.env.XDG_SESSION_TYPE = previousType;
    if (previousDisplay === undefined) delete process.env.WAYLAND_DISPLAY; else process.env.WAYLAND_DISPLAY = previousDisplay;
  }
});

test('Linux and Windows Chromium candidates remain platform-specific', () => {
  assert.ok(browserCandidates({}, 'linux').includes('chromium')); assert.ok(browserCandidates({}, 'win32').some((item) => item.endsWith('chrome.exe')));
  assert.equal(browserCandidates({}, 'linux').some((item) => /^[A-Z]:\\/.test(item)), false);
});
