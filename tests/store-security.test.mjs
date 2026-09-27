import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeJsonAtomically } from '../server/store.js';

test('state writes replace atomically and restrict local file access', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-state-test-'));
  const target = path.join(directory, 'state.json');
  try {
    await writeJsonAtomically(target, { approvals: [{ id: 'one' }] });
    await writeJsonAtomically(target, { approvals: [{ id: 'two' }] });
    assert.equal(JSON.parse(await readFile(target, 'utf8')).approvals[0].id, 'two');
    if (process.platform !== 'win32') assert.equal((await stat(target)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(directory), ['state.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
