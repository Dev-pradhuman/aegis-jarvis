import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLinuxApps, discoverLinuxApps, parseDesktopEntry, resolveApp } from '../server/platform/linux/apps.js';
import { createPlatform } from '../server/platform/index.js';
import { createWindowsApps } from '../server/platform/windows/apps.js';

test('desktop entries parse only application fields and respect visibility', () => {
  const file = '/tmp/sample.desktop';
  const entry = parseDesktopEntry('[Desktop Entry]\nType=Application\nName=Sample\nGenericName=Calculator\nExec=sample %U\nIcon=sample\nStartupWMClass=sample\nTerminal=false\n[Desktop Action New]\nName=Wrong\n', file, 'KDE');
  assert.equal(entry.name, 'Sample');
  assert.equal(entry.genericName, 'Calculator');
  assert.equal(entry.exec, 'sample %U');
  assert.equal(entry.startupWMClass, 'sample');
  assert.equal(parseDesktopEntry('[Desktop Entry]\nType=Application\nName=Only GNOME\nExec=app\nOnlyShowIn=GNOME;\n', file, 'KDE'), null);
});

test('Linux discovery handles XDG precedence, hidden entries, and ambiguous matches', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jarvis-apps-'));
  const local = path.join(root, 'local', 'applications');
  const system = path.join(root, 'system', 'applications');
  await Promise.all([mkdir(local, { recursive: true }), mkdir(system, { recursive: true })]);
  await writeFile(path.join(system, 'masked.desktop'), '[Desktop Entry]\nType=Application\nName=Masked\nExec=masked\n');
  await writeFile(path.join(local, 'masked.desktop'), '[Desktop Entry]\nType=Application\nName=Masked\nExec=masked\nHidden=true\n');
  await writeFile(path.join(system, 'kcalc.desktop'), '[Desktop Entry]\nType=Application\nName=KCalc\nGenericName=Scientific Calculator\nExec=kcalc\n');
  await writeFile(path.join(system, 'zen.desktop'), '[Desktop Entry]\nType=Application\nName=Zen Browser\nExec=zen\n');
  await writeFile(path.join(local, 'zen-alt.desktop'), '[Desktop Entry]\nType=Application\nName=Zen Browser\nExec=zen-alt\n');
  const env = { XDG_DATA_HOME: path.join(root, 'local'), XDG_DATA_DIRS: path.join(root, 'system'), XDG_CURRENT_DESKTOP: 'KDE' };
  const apps = await discoverLinuxApps({ env, home: root });
  assert.equal(apps.some((app) => app.name === 'Masked'), false);
  assert.equal(resolveApp('Calculator', apps).app.name, 'KCalc');
  assert.equal(resolveApp('Zen', apps).app.id, 'zen');
  assert.equal(resolveApp('Zen Browser', apps).status, 'ambiguous');
  assert.equal(resolveApp('missing', apps).status, 'not_found');
  const calls = [];
  const provider = createLinuxApps({ env, home: root, execFile: async (...args) => { calls.push(args); } });
  assert.equal((await provider.open('Zen Browser')).status, 'ambiguous');
  assert.equal(calls.length, 0);
  const opened = await provider.open('Calculator');
  assert.equal(opened.status, 'launched');
  assert.equal(opened.verified, false);
  assert.deepEqual(calls[0].slice(0, 2), ['gio', ['launch', path.join(system, 'kcalc.desktop')]]);
});

test('platform selection keeps a Windows provider available', () => {
  const windows = createPlatform({ platform: 'win32', env: {} });
  assert.equal(windows.os, 'win32');
  assert.equal(typeof windows.apps.open, 'function');
});

test('Windows Start Menu provider resolves a shortcut without shell parsing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jarvis-win-apps-'));
  const menu = path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  await mkdir(menu, { recursive: true });
  const shortcut = path.join(menu, 'Discord.lnk');
  await writeFile(shortcut, 'test shortcut');
  const calls = [];
  const apps = createWindowsApps({ env: { APPDATA: root }, execFile: async (...args) => { calls.push(args); } });
  const result = await apps.open('Discord');
  assert.equal(result.status, 'launched');
  assert.deepEqual(calls[0].slice(0, 2), ['explorer.exe', [shortcut]]);
  assert.equal(result.verified, false);
});
