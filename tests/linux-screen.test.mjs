import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLinuxScreen } from '../server/platform/linux/screen.js';

test('desktop screenshot copies a portal image into private runtime storage with metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jarvis-screen-test-'));
  const source = path.join(root, 'portal.png');
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 7, 128, 0, 0, 4, 56]);
  await writeFile(source, header);
  const screen = createLinuxScreen({ directory: path.join(root, 'private'), run: async () => ({ stdout: JSON.stringify({ ok: true, uri: pathToFileURL(source).href }) }) });
  const result = await screen.capture();
  assert.equal(result.backend, 'xdg-desktop-portal');
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.deepEqual(await readFile(result.path), header);
});

test('desktop screenshot reports portal denial and unsupported targets', async () => {
  const screen = createLinuxScreen({ run: async () => ({ stdout: JSON.stringify({ ok: false, code: 'SCREEN_PERMISSION_REQUIRED' }) }) });
  await assert.rejects(screen.capture(), { code: 'SCREEN_PERMISSION_REQUIRED' });
  await assert.rejects(screen.capture({ target: 'active_window' }), { code: 'SCREEN_TARGET_UNSUPPORTED' });
});
