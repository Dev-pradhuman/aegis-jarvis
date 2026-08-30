import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostics, searchMemory } from '../server/systemModules.js';

test('memory search ranks matching durable records', () => {
  const result = searchMemory([{ id: 'a', text: 'Aegis architecture decision' }, { id: 'b', text: 'Meeting notes' }], 'architecture aegis');
  assert.equal(result[0].id, 'a');
});

test('diagnostics reports local service health without claiming integrations', () => {
  const result = diagnostics({ provider: { configured: false } });
  assert.equal(result.service, 'ok');
  assert.equal(result.persistence, 'ok');
  assert.equal(result.provider, 'not configured');
});
