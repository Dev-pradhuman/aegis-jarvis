import assert from 'node:assert/strict';
import test from 'node:test';
import { synthesizeSpeech } from '../server/tts.js';

test('TTS preserves the primary provider error and skips unconfigured fallbacks', async () => {
  const original = {
    groq: process.env.GROQ_API_KEY,
    groq1: process.env.GROQ_API_KEY_1,
    fishKey: process.env.FISH_AUDIO_API_KEY,
    fishVoice: process.env.FISH_AUDIO_VOICE_ID,
    elevenKey: process.env.ELEVENLABS_API_KEY,
    elevenVoice: process.env.ELEVENLABS_VOICE_ID,
    fetch: globalThis.fetch,
  };
  process.env.GROQ_API_KEY = 'test-key';
  delete process.env.GROQ_API_KEY_1;
  delete process.env.FISH_AUDIO_API_KEY;
  delete process.env.FISH_AUDIO_VOICE_ID;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response('primary provider rejected this model', { status: 400 }); };
  try {
    await assert.rejects(() => synthesizeSpeech({ provider: 'groq', text: 'test' }), /groq: TTS provider returned HTTP 400: primary provider rejected this model/);
    assert.equal(requests, 1);
  } finally {
    if (original.groq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = original.groq;
    if (original.groq1 === undefined) delete process.env.GROQ_API_KEY_1; else process.env.GROQ_API_KEY_1 = original.groq1;
    if (original.fishKey === undefined) delete process.env.FISH_AUDIO_API_KEY; else process.env.FISH_AUDIO_API_KEY = original.fishKey;
    if (original.fishVoice === undefined) delete process.env.FISH_AUDIO_VOICE_ID; else process.env.FISH_AUDIO_VOICE_ID = original.fishVoice;
    if (original.elevenKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = original.elevenKey;
    if (original.elevenVoice === undefined) delete process.env.ELEVENLABS_VOICE_ID; else process.env.ELEVENLABS_VOICE_ID = original.elevenVoice;
    globalThis.fetch = original.fetch;
  }
});
