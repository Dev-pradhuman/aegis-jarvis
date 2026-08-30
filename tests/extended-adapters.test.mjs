import assert from 'node:assert/strict';
import test from 'node:test';
import { adapterStatus, embed, extractDocument, mcpResponse, vectorSearch } from '../server/extendedAdapters.js';

test('local vector indexing returns deterministic ranked results', () => {
  const records = [{ id: 'a', embedding: embed('Aegis project architecture') }, { id: 'b', embedding: embed('calendar meeting') }];
  assert.equal(vectorSearch(records, 'Aegis architecture')[0].id, 'a');
});

test('document extraction provides chunks and metadata', () => {
  const result = extractDocument('# Intro\nA sentence. Another sentence.');
  assert.equal(result.words, 6);
  assert.equal(result.chunks.length, 1);
  assert.equal(result.headings.length, 1);
});

test('adapter status does not expose secrets', () => {
  const result = adapterStatus();
  assert.equal(result.auth.secretsPersisted, false);
  assert.deepEqual(mcpResponse(1, { ok: true }), { jsonrpc: '2.0', id: 1, result: { ok: true } });
});
