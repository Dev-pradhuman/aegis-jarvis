import assert from 'node:assert/strict';
import test from 'node:test';
import { createLinuxClipboard } from '../server/platform/linux/clipboard.js';

test('KDE clipboard read and write use D-Bus arguments and verify state', async () => {
  let value = 'before';
  const run = async (program, args) => {
    assert.equal(program, 'busctl');
    if (args.includes('getClipboardContents')) return { stdout: JSON.stringify({ type: 's', data: [value] }) };
    if (args.includes('setClipboardContents')) { value = args.at(-1); return { stdout: '' }; }
    throw new Error('Unexpected bus call');
  };
  const clipboard = createLinuxClipboard({ run, displayServer: 'wayland' });
  assert.deepEqual(await clipboard.read(), { text: 'before', backend: 'kde-klipper' });
  assert.deepEqual(await clipboard.write('after'), { written: true, characters: 5, backend: 'kde-klipper' });
  assert.equal(value, 'after');
});

test('Wayland clipboard falls back to wl-clipboard when Klipper is unavailable', async () => {
  const run = async (program, args) => {
    if (program === 'busctl') throw Object.assign(new Error('No Klipper'), { code: 'ENOENT' });
    if (program === 'wl-paste') return { stdout: 'fallback text' };
    if (program === 'wl-copy') return { stdout: '' };
    throw new Error(`Unexpected ${program} ${args.join(' ')}`);
  };
  const clipboard = createLinuxClipboard({ run, displayServer: 'wayland' });
  assert.equal((await clipboard.read()).backend, 'wl-clipboard');
  assert.deepEqual(await clipboard.write('fallback text'), { written: true, characters: 13, backend: 'wl-clipboard' });
});
