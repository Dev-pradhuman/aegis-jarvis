import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const legacyEnvFile = path.join(projectRoot, '.env.local');
export const envFile = path.join(projectRoot, 'server', 'data', 'credentials.env');
const modelCredentialSlots = Array.from({ length: 12 }, (_, index) => `MODEL_API_KEY_${index + 1}`);
const providerCredentialSlots = ['GROQ', 'GEMINI', 'OPENROUTER', 'OPENCODE_ZEN', 'NINEROUTER', 'CUSTOM'].flatMap((provider) => Array.from({ length: 4 }, (_, index) => `${provider}_API_KEY_${index + 1}`));
export const CONFIG_KEYS = ['OPENROUTER_API_KEY', 'OPENCODE_ZEN_API_KEY', 'NINEROUTER_API_KEY', 'CUSTOM_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', ...providerCredentialSlots, ...modelCredentialSlots, 'GROQ_CHAT_MODEL', 'GROQ_STT_MODEL', 'GROQ_TTS_MODEL', 'GROQ_TTS_VOICE', 'GEMINI_IMAGE_MODEL', 'GEMINI_VIDEO_MODEL', 'STT_PROVIDER', 'PROVIDER_FALLBACK_ORDER', 'MODEL_PROVIDER_POOLS', 'MODEL_MAX_OUTPUT_TOKENS', 'JARVIS_ROUTER_DEBUG', 'TOOL_FILTER_ENABLED', 'TOOL_FILTER_TOP_K', 'CONTEXT_MAX_CHARS', 'CONTEXT_RECENT_TURNS', 'CONTEXT_TURN_CHAR_LIMIT', 'CONTEXT_MEMORY_TOP_K', 'CONTEXT_MEMORY_MIN_SCORE', 'COMPOSIO_API_KEY', 'COMPOSIO_USER_ID', 'COMPOSIO_AUTH_CONFIGS', 'SEARCH_PROVIDER_URL', 'SEARCH_PROVIDER_KEY', 'JARVIS_PROJECT_ROOTS', 'JARVIS_MCP_SERVERS', 'JARVIS_DEVICE_PAIRING_CODE', 'COMMUNICATION_SIGNATURES', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'SLACK_SIGNING_SECRET', 'CALENDAR_API_URL', 'MESSAGING_API_URL', 'MESSAGING_TOKEN', 'SLACK_WEBHOOK_URL', 'HARDWARE_ENDPOINT', 'HARDWARE_TOKEN', 'JARVIS_AUTH_TOKEN', 'VOICE_STT_URL', 'VOICE_TTS_URL', 'TTS_PROVIDER', 'ELEVENLABS_API_KEY', 'ELEVENLABS_MODEL_ID', 'ELEVENLABS_VOICE_ID', 'FISH_AUDIO_API_KEY', 'FISH_AUDIO_MODEL_ID', 'FISH_AUDIO_VOICE_ID'];

export function decodeEnvValue(value = '') {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : parsed && typeof parsed === 'object' ? value : String(parsed);
  } catch {
    return value.replace(/^['"]|['"]$/g, '');
  }
}

export function loadEnvFile() {
  const source = fs.existsSync(envFile) ? envFile : legacyEnvFile;
  if (!fs.existsSync(source)) return;
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = decodeEnvValue(match[2]); }
}

export function publicConfig() { return Object.fromEntries(CONFIG_KEYS.map((key) => { const value = String(process.env[key] || ''); const configured = key === 'COMPOSIO_API_KEY' ? value.startsWith('ak_') : Boolean(value); return [key, { configured, value: '', ...(key === 'COMPOSIO_API_KEY' && value.startsWith('ck_') ? { issue: 'Consumer key detected; Platform Project API key required' } : {}) }]; })); }

export function saveConfig(values = {}) {
  const lines = [];
  for (const key of CONFIG_KEYS) { if (values[key] !== undefined && String(values[key]).length) process.env[key] = String(values[key]); if (process.env[key]) lines.push(`${key}=${JSON.stringify(process.env[key])}`); }
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(envFile, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  return publicConfig();
}

loadEnvFile();
