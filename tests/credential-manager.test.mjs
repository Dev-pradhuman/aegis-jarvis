import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialCatalog, verifyCredential } from '../server/credentialManager.js';
import { credentialEntries } from '../server/credentialPool.js';

test('credential catalog supports multiple keys without exposing their values', () => {
  const slots = ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3', 'GROQ_API_KEY_4']; const previous = Object.fromEntries(slots.map((slot) => [slot, process.env[slot]])); for (const slot of slots) delete process.env[slot]; process.env.GROQ_API_KEY = 'secret-a'; process.env.GROQ_API_KEY_1 = 'secret-b';
  try { const provider = credentialCatalog({ credentialMetadata: { GROQ_API_KEY_1: { label: 'Backup', enabled: false } } }).find((item) => item.id === 'groq'); assert.equal(provider.keys.length, 2); assert.equal(provider.keys[1].label, 'Backup'); assert.equal(provider.keys[1].enabled, false); assert.equal(JSON.stringify(provider).includes('secret-a'), false); }
  finally { for (const slot of slots) { if (previous[slot] === undefined) delete process.env[slot]; else process.env[slot] = previous[slot]; } }
});

test('credential verification distinguishes accepted, invalid, and provider errors', async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'server-only';
  try { const state = {}; const valid = await verifyCredential(state, 'openai', 'OPENAI_API_KEY', { fetchImpl: async () => ({ ok: true, status: 200 }) }); const invalid = await verifyCredential(state, 'openai', 'OPENAI_API_KEY', { fetchImpl: async () => ({ ok: false, status: 401 }) }); const provider = await verifyCredential(state, 'openai', 'OPENAI_API_KEY', { fetchImpl: async () => ({ ok: false, status: 503 }) }); assert.equal(valid.status, 'valid'); assert.equal(invalid.status, 'invalid'); assert.equal(provider.status, 'provider_error'); }
  finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test('disabled credential slots are excluded from actual rotation', () => { const slots = ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3', 'GROQ_API_KEY_4']; const previous = Object.fromEntries(slots.map((slot) => [slot, process.env[slot]])); const priorDisabled = process.env.JARVIS_DISABLED_CREDENTIALS; for (const slot of slots) delete process.env[slot]; process.env.GROQ_API_KEY = 'primary'; process.env.GROQ_API_KEY_1 = 'backup'; process.env.JARVIS_DISABLED_CREDENTIALS = 'GROQ_API_KEY'; try { assert.deepEqual(credentialEntries('GROQ_API_KEY').map((item) => item.credentialRef), ['GROQ_API_KEY_1']); } finally { for (const slot of slots) { if (previous[slot] === undefined) delete process.env[slot]; else process.env[slot] = previous[slot]; } if (priorDisabled === undefined) delete process.env.JARVIS_DISABLED_CREDENTIALS; else process.env.JARVIS_DISABLED_CREDENTIALS = priorDisabled; } });
