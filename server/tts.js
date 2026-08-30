const textValue = (value, max = 5000) => String(value || '').trim().slice(0, max);

export function ttsStatus() {
  const provider = process.env.TTS_PROVIDER || 'browser';
  return {
    provider,
    sttProvider: process.env.STT_PROVIDER || 'groq',
    elevenlabs: {
      configured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
      modelId: process.env.ELEVENLABS_MODEL_ID || process.env.ELEVENLABS_MODEL_ID_EN || 'eleven_multilingual_v2',
      voiceIdConfigured: Boolean(process.env.ELEVENLABS_VOICE_ID),
    },
    fishAudio: {
      configured: Boolean(process.env.FISH_AUDIO_API_KEY && process.env.FISH_AUDIO_VOICE_ID),
      modelId: process.env.FISH_AUDIO_MODEL_ID || process.env.FISH_AUDIO_MODEL_ID_EN || 's2-pro',
      voiceIdConfigured: Boolean(process.env.FISH_AUDIO_VOICE_ID),
    },
    groq: { configured: credentialEntries('GROQ_API_KEY').length > 0, credentialCount: credentialEntries('GROQ_API_KEY').length, sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo', ttsModel: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english', voice: process.env.GROQ_TTS_VOICE || 'autumn' },
  };
}

async function synthesizeOne(input = {}) {
  const provider = input.provider || process.env.TTS_PROVIDER;
  const text = textValue(input.text);
  if (!text) throw new Error('text is required');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    let response;
    if (provider === 'elevenlabs') {
      const key = process.env.ELEVENLABS_API_KEY;
      const voiceId = textValue(input.voiceId || process.env.ELEVENLABS_VOICE_ID, 200);
      const requestedModelId = textValue(input.modelId || process.env.ELEVENLABS_MODEL_ID || process.env.ELEVENLABS_MODEL_ID_EN || 'eleven_multilingual_v2', 200);
      const modelId = /^eleven_[a-z0-9_]+$/i.test(requestedModelId) ? requestedModelId : 'eleven_multilingual_v2';
      if (!key || !voiceId) throw new Error('ElevenLabs API key and voice ID are required');
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': key }, body: JSON.stringify({ text, model_id: modelId }) });
    } else if (provider === 'fish-audio') {
      const key = process.env.FISH_AUDIO_API_KEY;
      const voiceId = textValue(input.voiceId || process.env.FISH_AUDIO_VOICE_ID, 200);
      const modelId = textValue(input.modelId || process.env.FISH_AUDIO_MODEL_ID || process.env.FISH_AUDIO_MODEL_ID_EN || 's2-pro', 200);
      if (!key || !voiceId) throw new Error('Fish Audio API key and voice model ID are required');
      response = await fetch('https://api.fish.audio/v1/tts', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', accept: 'audio/mpeg', authorization: `Bearer ${key}`, model: modelId }, body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3' }) });
    } else if (provider === 'groq') {
      ({ response } = await fetchWithCredentialRotation('GROQ_API_KEY', (key) => fetch('https://api.groq.com/openai/v1/audio/speech', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', accept: 'audio/wav', authorization: `Bearer ${key}` }, body: JSON.stringify({ input: text, model: input.modelId || process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english', voice: input.voiceId || process.env.GROQ_TTS_VOICE || 'autumn', response_format: 'wav' }) })));
    } else throw new Error('Select ElevenLabs, Fish Audio, or Groq as the TTS provider');
    if (!response.ok) { const detail = await response.text(); throw new Error(`TTS provider returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`); }
    return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'audio/mpeg' };
  } finally { clearTimeout(timer); }
}

export async function synthesizeSpeech(input = {}) {
  const primary = input.provider || process.env.TTS_PROVIDER || 'browser';
  const order = [primary, 'groq', 'fish-audio', 'elevenlabs'].filter((value, index, items) => value !== 'browser' && items.indexOf(value) === index);
  let lastError;
  for (const provider of order) { try { return await synthesizeOne({ ...input, provider, modelId: provider === primary ? input.modelId : undefined, voiceId: provider === primary ? input.voiceId : undefined }); } catch (error) { lastError = error; } }
  throw lastError || new Error('No server TTS provider is configured');
}

export async function transcribeAudio(input = {}) {
  const bytes = Buffer.from(String(input.audio || ''), 'base64'); if (!bytes.length) throw new Error('audio is required'); if (bytes.length > 25 * 1024 * 1024) throw new Error('audio exceeds the 25 MB limit');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30_000);
  try { const { response, credentialRef } = await fetchWithCredentialRotation('GROQ_API_KEY', (key) => { const form = new FormData(); form.append('file', new Blob([bytes], { type: input.mimeType || 'audio/webm' }), input.fileName || 'speech.webm'); form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo'); form.append('response_format', 'json'); return fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${key}` }, body: form }); }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || `Groq transcription returned HTTP ${response.status}`); return { text: String(data.text || '').trim(), model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo', credentialSlot: credentialRef }; } finally { clearTimeout(timer); }
}
import { credentialEntries, fetchWithCredentialRotation } from './credentialPool.js';
