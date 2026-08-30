import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeEnvValue } from '../server/config.js';

test('JSON model-pool configuration survives env serialization and reload', () => {
  const value = JSON.stringify({ 'deepseek-v4-flash': [{ id: 'api-1', credentialRef: 'MODEL_API_KEY_1' }] });
  assert.equal(decodeEnvValue(JSON.stringify(value)), value);
  assert.deepEqual(JSON.parse(decodeEnvValue(JSON.stringify(value))), JSON.parse(value));
});
