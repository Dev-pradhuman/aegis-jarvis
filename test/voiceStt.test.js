import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeAudio, ttsStatus } from '../server/tts.js';

test('speech recognition defaults to browser when Groq is not configured', () => {
  const previousProvider = process.env.STT_PROVIDER;
  const previousKey = process.env.GROQ_API_KEY;
  delete process.env.STT_PROVIDER; delete process.env.GROQ_API_KEY;
  try { assert.equal(ttsStatus().sttProvider, 'browser'); }
  finally { if (previousProvider !== undefined) process.env.STT_PROVIDER = previousProvider; if (previousKey !== undefined) process.env.GROQ_API_KEY = previousKey; }
});

test('Groq speech recognition degrades to browser without credentials', () => {
  const previousProvider = process.env.STT_PROVIDER;
  const previousKey = process.env.GROQ_API_KEY;
  process.env.STT_PROVIDER = 'groq'; delete process.env.GROQ_API_KEY;
  try { const status = ttsStatus(); assert.equal(status.requestedSttProvider, 'groq'); assert.equal(status.sttProvider, 'browser'); assert.match(status.sttIssue, /GROQ_API_KEY/); }
  finally { if (previousProvider === undefined) delete process.env.STT_PROVIDER; else process.env.STT_PROVIDER = previousProvider; if (previousKey !== undefined) process.env.GROQ_API_KEY = previousKey; }
});

test('empty transcription is rejected as a request error before credential lookup', async () => {
  await assert.rejects(() => transcribeAudio({ audio: '' }), (error) => error.code === 'REQUEST_ERROR' && error.message === 'audio is required');
});

test('Groq transcription receives a deterministic bilingual command prompt', async () => {
  const previousKey = process.env.GROQ_API_KEY; const previousFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = 'test-key';
  let prompt = '';
  globalThis.fetch = async (_url, init) => { prompt = init.body.get('prompt'); return { ok: true, status: 200, headers: new Headers(), json: async () => ({ text: 'open YouTube' }) }; };
  try { const result = await transcribeAudio({ audio: Buffer.from('audio').toString('base64') }); assert.equal(result.text, 'open YouTube'); assert.match(prompt, /English or Hindi/); assert.match(prompt, /open Notepad/); }
  finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previousKey; }
});
