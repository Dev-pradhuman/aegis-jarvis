import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { launchWindowsApplication, openWindowsUrl, resolveWindowsApplication } from '../server/windowsDesktop.js';

test('legacy Windows aliases do not interpret shell commands', () => {
  assert.equal(resolveWindowsApplication('Note Pad').id, 'notepad');
  assert.equal(resolveWindowsApplication('powershell -enc bad'), null);
});

test('app launch requires matching native window evidence, not process creation', async () => {
  const app = { name: 'Notepad', kind: 'executable', target: 'C:\\Windows\\notepad.exe', executable: 'C:\\Windows\\notepad.exe' };
  const options = { platform: 'win32', apps: [app], pollMs: 0, bridge: async (operation, args) => operation === 'apps.launch' ? { requested: true } : { windows: [{ handle: '1', pid: 42, executable: app.executable }] } };
  const result = await launchWindowsApplication('notepad', options);
  assert.equal(result.state, 'running'); assert.equal(result.opened, true);
  assert.equal(result.verification.windows[0].pid, 42);
  await assert.rejects(launchWindowsApplication('notepad', { ...options, bridge: async () => ({ windows: [] }) }), (error) => error.code === 'VERIFICATION_FAILED');
});

test('browser launch uses the Windows URL handler without a shell', async () => {
  let call;
  const spawn = (executable, args, options) => {
    call = { executable, args, options };
    const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child;
  };
  const result = await openWindowsUrl('https://www.youtube.com', { platform: 'win32', spawn });
  assert.equal(result.state, 'launched');
  assert.equal(result.verified, true);
  assert.equal(result.browser, undefined);
  assert.equal(call.executable, 'rundll32.exe');
  assert.deepEqual(call.args, ['url.dll,FileProtocolHandler', 'https://www.youtube.com/']);
  assert.equal(call.options.detached, true);
  await assert.rejects(() => openWindowsUrl('file:///C:/Windows', { platform: 'win32', spawn }), (error) => error.code === 'REQUEST_ERROR');
  await assert.rejects(() => openWindowsUrl('https://user:password@example.com', { platform: 'win32', spawn }), (error) => error.code === 'REQUEST_ERROR');
});

test('explicit browser launch resolves a registered browser and passes the URL without a shell', async () => {
  let call;
  const spawn = (executable, args, options) => {
    call = { executable, args, options };
    const child = new EventEmitter(); child.pid = 2468; child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child;
  };
  const resolveBrowser = async (name) => {
    assert.equal(name, 'Zen');
    return { id: 'zen-id', name: 'Zen Browser', executable: 'C:\\Program Files\\Zen Browser\\zen.exe', kind: 'executable' };
  };
  const result = await openWindowsUrl('https://www.youtube.com', { platform: 'win32', browser: 'Zen', resolveBrowser, spawn });
  assert.equal(call.executable, 'C:\\Program Files\\Zen Browser\\zen.exe');
  assert.deepEqual(call.args, ['https://www.youtube.com/']);
  assert.equal(call.options.detached, true);
  assert.equal(result.browser.name, 'Zen Browser');
  assert.equal(result.provider, 'windows-named-browser');
  assert.equal(result.verified, true);
});
