import { assertPaidApiAllowed, paidApiUsageEnabled } from './spendPolicy.js';

const textValue = (value, max = 5000) => String(value || '').trim().slice(0, max);

export const COOLDOWN_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const ttsProviderCooldownUntil = new Map();
export const providerCooldownUntil = ttsProviderCooldownUntil;

export function isProviderOnCooldown(provider) {
  const until = ttsProviderCooldownUntil.get(provider);
  if (!until) return false;
  if (Date.now() > until) {
    ttsProviderCooldownUntil.delete(provider);
    return false;
  }
  return true;
}

export function setProviderCooldown(provider, reason = '', statusCode = null) {
  const until = Date.now() + COOLDOWN_DURATION_MS;
  ttsProviderCooldownUntil.set(provider, until);
  console.warn(`[TTS CircuitBreaker] Marked provider '${provider}' on cooldown for 30m until ${new Date(until).toISOString()} (HTTP ${statusCode || 'ERR'}: ${reason || 'Quota/Auth error'})`);
}

export function clearProviderCooldown(provider) {
  if (provider) ttsProviderCooldownUntil.delete(provider);
  else ttsProviderCooldownUntil.clear();
}

export function detectReplyLanguage(text = '', explicitLanguage = '') {
  if (explicitLanguage === 'hi' || explicitLanguage === 'hindi') return 'hi';
  if (explicitLanguage === 'en' || explicitLanguage === 'english') return 'en';
  const str = String(text || '');
  if (/\p{Script=Devanagari}/u.test(str)) return 'hi';
  if (/\b(namaste|namaskar|theek|kaise|kya|haan|nahi|nahin|shukriya|dhanyawad|aap|hum|meri|mera|aapka|batao|karo|accha|achha)\b/i.test(str)) {
    return 'hi';
  }
  return 'en';
}

export function getLanguageTtsCascade(language = 'en') {
  // English: Fish Audio -> ElevenLabs -> text only
  // Hindi:   ElevenLabs -> Fish Audio -> text only
  if (language === 'hi') {
    return ['elevenlabs', 'fish-audio'];
  }
  return ['fish-audio', 'elevenlabs'];
}

export function ttsStatus() {
  const provider = process.env.TTS_PROVIDER || 'cascade';
  const hasGroq = credentialEntries('GROQ_API_KEY').length > 0;
  const preferredStt = process.env.STT_PROVIDER || (hasGroq ? 'groq' : 'browser');
  const now = Date.now();
  const cooldowns = {};
  for (const [p, until] of ttsProviderCooldownUntil.entries()) {
    if (until > now) {
      cooldowns[p] = {
        active: true,
        remainingMs: until - now,
        until: new Date(until).toISOString()
      };
    }
  }

  return {
    provider,
    apiSpeechDisabledByZeroSpend: !paidApiUsageEnabled(),
    sttProvider: process.env.STT_PROVIDER === 'browser' ? 'browser' : (hasGroq ? 'groq' : preferredStt),
    configuredSttProvider: preferredStt,
    cooldowns,
    outputDesign: {
      english: ['fish-audio', 'elevenlabs', 'text-only'],
      hindi: ['elevenlabs', 'fish-audio', 'text-only']
    },
    elevenlabs: {
      configured: Boolean(process.env.ELEVENLABS_API_KEY),
      onCooldown: isProviderOnCooldown('elevenlabs'),
      modelIdEn: process.env.ELEVENLABS_MODEL_ID_EN || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      modelIdHi: process.env.ELEVENLABS_MODEL_ID_HI || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      voiceIdEn: process.env.ELEVENLABS_VOICE_ID || 'bIHbv24MWmeRgasZH58o',
      voiceIdHi: process.env.ELEVENLABS_VOICE_ID_HI || 'czQ9pLzjRaF61EAYjcPC',
      voiceIdConfigured: Boolean(process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID_HI),
    },
    fishAudio: {
      configured: Boolean(process.env.FISH_AUDIO_API_KEY),
      onCooldown: isProviderOnCooldown('fish-audio'),
      modelIdEn: process.env.FISH_AUDIO_MODEL_ID_EN || process.env.FISH_AUDIO_MODEL_ID || 's2-pro',
      modelIdHi: process.env.FISH_AUDIO_MODEL_ID_HI || process.env.FISH_AUDIO_MODEL_ID || 's2-pro',
      voiceIdEn: process.env.FISH_AUDIO_VOICE_ID || '05b36da8574341d0803391491850db20',
      voiceIdHi: process.env.FISH_AUDIO_VOICE_ID_HI || '817eba7f1aea469f9802326568d427b9',
      voiceIdConfigured: Boolean(process.env.FISH_AUDIO_VOICE_ID || process.env.FISH_AUDIO_VOICE_ID_HI),
    },
    groq: {
      configured: credentialEntries('GROQ_API_KEY').length > 0,
      onCooldown: isProviderOnCooldown('groq'),
      credentialCount: credentialEntries('GROQ_API_KEY').length,
      sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
      ttsModel: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english',
      voice: process.env.GROQ_TTS_VOICE || 'autumn'
    },
  };
}

async function synthesizeOne(input = {}) {
  const provider = input.provider || process.env.TTS_PROVIDER;
  const text = textValue(input.text);
  if (!text) throw new Error('text is required');
  const language = input.language || detectReplyLanguage(text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    let response;
    if (provider === 'fish-audio') {
      const key = process.env.FISH_AUDIO_API_KEY;
      const voiceId = textValue(
        input.voiceId ||
        (language === 'hi'
          ? (process.env.FISH_AUDIO_VOICE_ID_HI || '817eba7f1aea469f9802326568d427b9')
          : (process.env.FISH_AUDIO_VOICE_ID || process.env.FISH_AUDIO_VOICE_ID_EN || '05b36da8574341d0803391491850db20')),
        200
      );
      const modelId = textValue(
        input.modelId ||
        (language === 'hi'
          ? (process.env.FISH_AUDIO_MODEL_ID_HI || process.env.FISH_AUDIO_MODEL_ID)
          : (process.env.FISH_AUDIO_MODEL_ID_EN || process.env.FISH_AUDIO_MODEL_ID)) ||
        's2-pro',
        200
      );
      if (!key) throw new Error('Fish Audio API key is not configured');
      if (!voiceId) throw new Error('Fish Audio voice ID is required');

      response = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'audio/mpeg',
          authorization: `Bearer ${key}`,
          model: modelId
        },
        body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3' })
      });
    } else if (provider === 'elevenlabs') {
      const key = process.env.ELEVENLABS_API_KEY;
      const voiceId = textValue(
        input.voiceId ||
        (language === 'hi'
          ? (process.env.ELEVENLABS_VOICE_ID_HI || 'czQ9pLzjRaF61EAYjcPC')
          : (process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID_EN || 'bIHbv24MWmeRgasZH58o')),
        200
      );
      const requestedModelId = textValue(
        input.modelId ||
        (language === 'hi'
          ? (process.env.ELEVENLABS_MODEL_ID_HI || process.env.ELEVENLABS_MODEL_ID)
          : (process.env.ELEVENLABS_MODEL_ID_EN || process.env.ELEVENLABS_MODEL_ID)) ||
        'eleven_multilingual_v2',
        200
      );
      const modelId = /^eleven_[a-z0-9_]+$/i.test(requestedModelId) ? requestedModelId : 'eleven_multilingual_v2';
      if (!key) throw new Error('ElevenLabs API key is not configured');
      if (!voiceId) throw new Error('ElevenLabs voice ID is required');

      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'audio/mpeg',
          'xi-api-key': key
        },
        body: JSON.stringify({ text, model_id: modelId })
      });

      if (!response.ok && response.status === 402 && voiceId !== (process.env.ELEVENLABS_VOICE_ID || 'bIHbv24MWmeRgasZH58o')) {
        const fallbackVoice = process.env.ELEVENLABS_VOICE_ID || 'bIHbv24MWmeRgasZH58o';
        console.warn(`[ElevenLabs] Voice ${voiceId} returned 402 (library voice restriction). Retrying with account voice ${fallbackVoice}...`);
        response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(fallbackVoice)}?output_format=mp3_44100_128`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            accept: 'audio/mpeg',
            'xi-api-key': key
          },
          body: JSON.stringify({ text, model_id: modelId })
        });
      }
    } else if (provider === 'groq') {
      ({ response } = await fetchWithCredentialRotation('GROQ_API_KEY', (key) =>
        fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            accept: 'audio/wav',
            authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            input: text,
            model: input.modelId || process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english',
            voice: input.voiceId || process.env.GROQ_TTS_VOICE || 'autumn',
            response_format: 'wav'
          })
        })
      ));
    } else {
      throw new Error(`Select ElevenLabs or Fish Audio as the TTS provider (${provider})`);
    }

    if (!response.ok) {
      const detail = await response.text();
      if ([401, 402, 429].includes(response.status)) {
        setProviderCooldown(provider, detail.slice(0, 200), response.status);
      }
      throw new Error(`TTS provider returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return {
      audio: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      provider,
      language
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function synthesizeSpeech(input = {}) {
  const text = textValue(input.text);
  if (!text) throw new Error('text is required');

  const language = detectReplyLanguage(text, input.language);
  const cascadeOrder = getLanguageTtsCascade(language);

  // If a specific provider was explicitly requested, test it first
  const order = (input.provider && input.provider !== 'cascade' && input.provider !== 'bilingual' && input.provider !== 'browser')
    ? [input.provider, ...cascadeOrder.filter((p) => p !== input.provider)]
    : cascadeOrder;

  let lastError = null;
  for (const provider of order) {
    if (isProviderOnCooldown(provider)) {
      console.info(`[TTS CircuitBreaker] Skipping '${provider}' (${language}) - provider is on cooldown.`);
      continue;
    }
    try {
      const result = await synthesizeOne({
        ...input,
        provider,
        language,
        modelId: provider === input.provider ? input.modelId : undefined,
        voiceId: provider === input.provider ? input.voiceId : undefined
      });
      return { ...result, provider, language };
    } catch (error) {
      console.warn(`[TTS] ${provider} (${language}) failed: ${error.message}. Moving to next provider in cascade...`);
      lastError = error;
    }
  }

  // Diagram: "Text only (if both fail)"
  return {
    audio: null,
    textOnly: true,
    language,
    error: lastError?.message || 'Both TTS providers failed, falling back to text only'
  };
}

export async function transcribeAudio(input = {}) {
  assertPaidApiAllowed('Hosted speech recognition');
  const bytes = Buffer.from(String(input.audio || ''), 'base64');
  if (!bytes.length) throw new Error('audio is required');
  if (bytes.length > 25 * 1024 * 1024) throw new Error('audio exceeds the 25 MB limit');

  if (bytes.length < 500) {
    return { text: '', noSpeech: true, message: 'Audio recording was too short or empty. Please speak clearly or type your request.' };
  }

  const WHISPER_HALLUCINATIONS = /^(thank you(\.|\!)?|thanks for watching(\.|\!)?|thank you for watching(\.|\!)?|subscribe(\.|\!)?|please subscribe(\.|\!)?|you(\.|\!)?|\.|\.\.\.|\[.*\]|jarvis(\.|\!)?)$/i;
  const models = [
    process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    'whisper-large-v3'
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    let lastError = null;
    for (const model of models) {
      try {
        const { response, credentialRef } = await fetchWithCredentialRotation('GROQ_API_KEY', (key) => {
          const form = new FormData();
          form.append('file', new Blob([bytes], { type: input.mimeType || 'audio/webm' }), input.fileName || 'speech.webm');
          form.append('model', model);
          form.append('response_format', 'json');
          form.append('temperature', '0');
          form.append('prompt', input.prompt || 'JARVIS voice assistant. User speaks clear commands in English, Hindi, and Hinglish. Namaste, jarvis, open, check, search, volume, reminders, tasks, email, calendar.');
          if (input.language) form.append('language', input.language);
          return fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            signal: controller.signal,
            headers: { authorization: `Bearer ${key}` },
            body: form
          });
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error?.message || `Groq transcription returned HTTP ${response.status}`);
        }

        const text = String(data.text || '').trim();
        if (text && !WHISPER_HALLUCINATIONS.test(text)) {
          return { text, model, credentialSlot: credentialRef };
        }
        console.warn(`[Groq STT] Model ${model} returned empty or hallucination: "${text}". Trying fallback model...`);
      } catch (err) {
        console.warn(`[Groq STT] Model ${model} failed: ${err.message}. Trying fallback model...`);
        lastError = err;
      }
    }

    return {
      text: '',
      noSpeech: true,
      askUserToType: true,
      message: 'No clear speech detected. Please speak closer to your microphone or type your request.'
    };
  } finally {
    clearTimeout(timer);
  }
}
import { credentialEntries, fetchWithCredentialRotation } from './credentialPool.js';
