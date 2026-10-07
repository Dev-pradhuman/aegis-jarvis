import test from 'node:test';
import assert from 'node:assert';
import { isTestEnvironment } from '../server/visionState.js';

test('isTestEnvironment', (t) => {
  const originalEnv = process.env.JARVIS_TEST;

  process.env.JARVIS_TEST = '1';
  assert.strictEqual(isTestEnvironment(), true);

  process.env.JARVIS_TEST = '0';
  assert.strictEqual(isTestEnvironment(), false);

  delete process.env.JARVIS_TEST;
  assert.strictEqual(isTestEnvironment(), false);

  process.env.JARVIS_TEST = originalEnv;
});
import fs from 'node:fs/promises';
test('Scripts do not set test mode', async () => {
  const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));
  assert.ok(!pkg.scripts['verify:vision'].includes('JARVIS_TEST'));
  assert.ok(!pkg.scripts['verify:voice'].includes('JARVIS_TEST'));
  assert.ok(!pkg.scripts['smoke'].includes('JARVIS_TEST'));
  assert.ok(!pkg.scripts['start'].includes('JARVIS_TEST'));
});
