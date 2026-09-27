// Non-secret provider metadata. Endpoints and environment conventions are sourced
// from each provider's documentation; model IDs are discovered at connection time.
const api = (id, displayName, envName, defaultBaseUrl, documentationUrl, extra = {}) => ({
  id, displayName, providerType: 'API', authType: 'bearer', envNames: envName ? [envName] : [],
  defaultBaseUrl, supportsModelDiscovery: true, discoveryPath: '/models',
  apiFormat: 'openai-chat', capabilities: ['text'], configurationFields: ['apiKey'],
  documentationUrl, ...extra,
});

export const providerPresetRegistry = Object.freeze({
  vercel: api('vercel', 'Vercel AI Gateway', 'AI_GATEWAY_API_KEY', 'https://ai-gateway.vercel.sh/v1', 'https://vercel.com/docs/ai-gateway/openai-compat/rest-api'),
  openai: api('openai', 'OpenAI', 'OPENAI_API_KEY', 'https://api.openai.com/v1', 'https://platform.openai.com/docs/api-reference/models/list'),
  anthropic: api('anthropic', 'Claude / Anthropic', 'ANTHROPIC_API_KEY', 'https://api.anthropic.com/v1', 'https://platform.claude.com/docs/en/api/overview', { apiFormat: 'anthropic-messages', authType: 'anthropic', capabilities: ['text', 'tools'] }),
  gemini: api('gemini', 'Google Gemini', 'GEMINI_API_KEY', 'https://generativelanguage.googleapis.com/v1beta/openai', 'https://ai.google.dev/gemini-api/docs/openai'),
  openrouter: api('openrouter', 'OpenRouter', 'OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/docs/quickstart'),
  groq: api('groq', 'Groq', 'GROQ_API_KEY', 'https://api.groq.com/openai/v1', 'https://console.groq.com/docs/overview'),
  xai: api('xai', 'xAI / Grok', 'XAI_API_KEY', 'https://api.x.ai/v1', 'https://docs.x.ai/developers/rest-api-reference/inference'),
  nvidia: api('nvidia', 'NVIDIA', 'NVIDIA_API_KEY', 'https://integrate.api.nvidia.com/v1', 'https://docs.api.nvidia.com/nim/docs/api-quickstart'),
  mistral: api('mistral', 'Mistral AI', 'MISTRAL_API_KEY', 'https://api.mistral.ai/v1', 'https://docs.mistral.ai/api/endpoint/models'),
  deepseek: api('deepseek', 'DeepSeek', 'DEEPSEEK_API_KEY', 'https://api.deepseek.com', 'https://api-docs.deepseek.com/guides/harness'),
  together: api('together', 'Together AI', 'TOGETHER_API_KEY', 'https://api.together.ai/v1', 'https://docs.together.ai/docs/inference/openai-compatibility'),
  fireworks: api('fireworks', 'Fireworks AI', 'FIREWORKS_API_KEY', 'https://api.fireworks.ai/inference/v1', 'https://fireworks.ai/docs/api-reference/post-responses', { supportsModelDiscovery: false }),
  cerebras: api('cerebras', 'Cerebras', 'CEREBRAS_API_KEY', 'https://api.cerebras.ai/v1', 'https://inference-docs.cerebras.ai/api-reference/models/list-models'),
  opencode: api('opencode', 'OpenCode Zen', 'OPENCODE_API_KEY', 'https://opencode.ai/zen/v1', 'https://opencode.ai/docs/zen', { apiFormat: 'opencode-zen', capabilities: ['text'], autoRoute: false }),
  ollama: { id: 'ollama', displayName: 'Ollama local', providerType: 'LOCAL', authType: 'none', envNames: [], defaultBaseUrl: 'http://127.0.0.1:11434/v1', supportsModelDiscovery: true, discoveryPath: '/models', apiFormat: 'openai-chat', capabilities: ['text'], configurationFields: [], documentationUrl: 'https://docs.ollama.com/api/openai-compatibility' },
  custom: { id: 'custom', displayName: 'Custom OpenAI-compatible', providerType: 'API', authType: 'bearer', envNames: [], defaultBaseUrl: '', supportsModelDiscovery: true, discoveryPath: '/models', apiFormat: 'openai-chat', capabilities: ['text'], configurationFields: ['baseUrl', 'apiKey'], documentationUrl: '' },
});

export function presetFor(id) { return providerPresetRegistry[id] || null; }
export function publicProviderPresets() { return Object.values(providerPresetRegistry).map((item) => ({ ...item })); }
export function presetForEnvName(name) { return Object.values(providerPresetRegistry).find((item) => item.envNames.includes(name)) || null; }
