const textValue = (value, max = 5000) => String(value || '').trim().slice(0, max);
const GROQ_TTS_MODELS=new Set(['canopylabs/orpheus-v1-english','canopylabs/orpheus-arabic-saudi']);
const GROQ_ENGLISH_VOICES=new Set(['autumn','diana','hannah','austin','daniel','troy']);
function groqModel(value){const model=textValue(value,200);if(model==='playai-tts')return'canopylabs/orpheus-v1-english';if(model==='playai-tts-arabic')return'canopylabs/orpheus-arabic-saudi';if(!GROQ_TTS_MODELS.has(model))throw Object.assign(new Error(`Unsupported Groq TTS model: ${model}`),{code:'CONFIG_REQUIRED'});return model;}
function chunks(text,max=200){const result=[];let remaining=text.trim();while(remaining.length>max){let at=Math.max(remaining.lastIndexOf('. ',max),remaining.lastIndexOf(' ',max));if(at<80)at=max;result.push(remaining.slice(0,at+1).trim());remaining=remaining.slice(at+1).trim();}if(remaining)result.push(remaining);return result;}
function wavPart(buffer){if(buffer.length<44||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE')throw new Error('Groq returned invalid WAV audio');let offset=12,format=null,data=null;while(offset+8<=buffer.length){const id=buffer.toString('ascii',offset,offset+4),size=buffer.readUInt32LE(offset+4),start=offset+8;if(id==='fmt ')format=buffer.subarray(start,start+size);if(id==='data')data=buffer.subarray(start,start+size);offset=start+size+(size%2);}if(!format||!data)throw new Error('Groq returned incomplete WAV audio');return{format,data};}
function mergeWav(buffers){if(buffers.length===1)return buffers[0];const parts=buffers.map(wavPart),format=parts[0].format;if(parts.some(part=>!part.format.equals(format)))throw new Error('Groq returned incompatible WAV chunks');const data=Buffer.concat(parts.map(part=>part.data)),output=Buffer.alloc(12+8+format.length+(format.length%2)+8+data.length);output.write('RIFF',0);output.writeUInt32LE(output.length-8,4);output.write('WAVE',8);let offset=12;output.write('fmt ',offset);output.writeUInt32LE(format.length,offset+4);format.copy(output,offset+8);offset+=8+format.length+(format.length%2);output.write('data',offset);output.writeUInt32LE(data.length,offset+4);data.copy(output,offset+8);return output;}

export function ttsStatus() {
  const provider = process.env.TTS_PROVIDER || 'browser';
  const groqCredentials = credentialEntries('GROQ_API_KEY');
  const requestedSttProvider = process.env.STT_PROVIDER || 'browser';
  const sttProvider = requestedSttProvider === 'groq' && !groqCredentials.length ? 'browser' : requestedSttProvider;
  return {
    provider,
    sttProvider,
    requestedSttProvider,
    sttIssue: requestedSttProvider === 'groq' && !groqCredentials.length ? 'Groq STT is selected but no GROQ_API_KEY is configured. Browser recognition will be used.' : null,
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
    groq: { configured: groqCredentials.length > 0, credentialCount: groqCredentials.length, sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo', ttsModel: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english', voice: process.env.GROQ_TTS_VOICE || 'autumn', maximumCharactersPerRequest:200, supportedTtsModels:[...GROQ_TTS_MODELS] },
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
      const model=groqModel(input.modelId || process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english');const voice=textValue(input.voiceId || process.env.GROQ_TTS_VOICE || 'autumn',50).toLowerCase();
      if(model==='canopylabs/orpheus-v1-english'&&!GROQ_ENGLISH_VOICES.has(voice))throw Object.assign(new Error(`Unsupported Groq English voice: ${voice}`),{code:'CONFIG_REQUIRED'});
      const audio=[];
      for(const inputChunk of chunks(text)){({ response } = await fetchWithCredentialRotation('GROQ_API_KEY', (key) => fetch('https://api.groq.com/openai/v1/audio/speech', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', accept: 'audio/wav', authorization: `Bearer ${key}` }, body: JSON.stringify({ input: inputChunk, model, voice, response_format: 'wav' }) })));if(!response.ok){const detail=await response.text();throw new Error(`TTS provider returned HTTP ${response.status}${detail?`: ${detail.slice(0,300)}`:''}`);}audio.push(Buffer.from(await response.arrayBuffer()));}
      return {audio:mergeWav(audio),contentType:'audio/wav'};
    } else throw new Error('Select ElevenLabs, Fish Audio, or Groq as the TTS provider');
    if (!response.ok) { const detail = await response.text(); throw new Error(`TTS provider returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`); }
    return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'audio/mpeg' };
  } finally { clearTimeout(timer); }
}

export async function synthesizeSpeech(input = {}) {
  const primary = input.provider || process.env.TTS_PROVIDER || 'browser';
  const configured = (provider) => {
    if (provider === 'groq') return credentialEntries('GROQ_API_KEY').length > 0;
    if (provider === 'fish-audio') return Boolean(process.env.FISH_AUDIO_API_KEY && process.env.FISH_AUDIO_VOICE_ID);
    if (provider === 'elevenlabs') return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
    return false;
  };
  const candidates = [primary, 'groq', 'fish-audio', 'elevenlabs'].filter((value, index, items) => value !== 'browser' && items.indexOf(value) === index);
  const order = candidates.filter((provider, index) => index === 0 || configured(provider));
  const errors = [];
  for (const provider of order) {
    try { return await synthesizeOne({ ...input, provider, modelId: provider === primary ? input.modelId : undefined, voiceId: provider === primary ? input.voiceId : undefined }); }
    catch (error) { errors.push({ provider, error }); }
  }
  if (!errors.length) throw new Error('No server TTS provider is configured');
  const [first, ...fallbacks] = errors;
  const fallbackDetail = fallbacks.length ? ` Fallbacks also failed: ${fallbacks.map(({ provider, error }) => `${provider}: ${error.message}`).join('; ')}` : '';
  throw Object.assign(new Error(`${first.provider}: ${first.error.message}${fallbackDetail}`), { code: first.error.code || 'TTS_FAILED', attempts: errors.map(({ provider }) => provider) });
}

export async function transcribeAudio(input = {}) {
  const bytes = Buffer.from(String(input.audio || ''), 'base64');
  if (!bytes.length) throw Object.assign(new Error('audio is required'), { code: 'REQUEST_ERROR' });
  if (bytes.length > 25 * 1024 * 1024) throw Object.assign(new Error('audio exceeds the 25 MB limit'), { code: 'REQUEST_ERROR' });
  if (!credentialEntries('GROQ_API_KEY').length) throw Object.assign(new Error('Groq transcription is not configured. Add GROQ_API_KEY or select Browser recognition in Settings.'), { code: 'CONFIG_REQUIRED' });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30_000);
  try { const { response, credentialRef } = await fetchWithCredentialRotation('GROQ_API_KEY', (key) => { const form = new FormData(); form.append('file', new Blob([bytes], { type: input.mimeType || 'audio/webm' }), input.fileName || 'speech.webm'); form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo'); form.append('response_format', 'json'); form.append('temperature', '0'); form.append('prompt', 'JARVIS Windows voice command. Common commands include open Notepad, open YouTube, open Instagram, Gmail and WhatsApp. Transcribe English or Hindi accurately. Write spoken Hindi in Latin Hinglish text.'); return fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${key}` }, body: form }); }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || `Groq transcription returned HTTP ${response.status}`); return { text: String(data.text || '').trim(), model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo', credentialSlot: credentialRef }; } finally { clearTimeout(timer); }
}
import { credentialEntries, fetchWithCredentialRotation } from './credentialPool.js';
