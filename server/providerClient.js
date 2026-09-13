import { credentialEnabled } from './credentialPool.js';

const keyFor = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', 'opencode-zen': 'OPENCODE_ZEN_API_KEY', '9router': 'NINEROUTER_API_KEY', custom: 'CUSTOM_API_KEY', groq: 'GROQ_API_KEY' };
const defaults = { openai: ['OpenAI', 'https://api.openai.com/v1', 'OPENAI_CHAT_MODEL', 'gpt-5'], gemini: ['Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'GEMINI_CHAT_MODEL', 'gemini-2.5-pro'], groq: ['Groq', 'https://api.groq.com/openai/v1', 'GROQ_CHAT_MODEL', 'openai/gpt-oss-20b'], openrouter: ['OpenRouter', 'https://openrouter.ai/api/v1', 'OPENROUTER_MODEL', 'openai/gpt-oss-20b'], 'opencode-zen': ['OpenCode Zen', 'https://opencode.ai/zen/v1', 'OPENCODE_ZEN_MODEL', 'openai/gpt-oss-20b'], '9router': ['9router', 'https://9router.com/v1', 'NINEROUTER_MODEL', 'openai/gpt-oss-20b'] };

const opencodeLogicalModels = {
  'muse-spark-1.2': 'muse-spark-1.2',
  'deepseek-v4-flash': 'deepseek-v4-flash',
  'glm-5.2': 'glm-5.2',
  'laguna-s-2.1': 'laguna-s-2.1-free',
  'minimax-m3': 'minimax-m3',
  'mimo-v2.5': 'mimo-v2.5-free',
  'nemotron-3.5-lightning': 'nemotron-3.5-lightning-free',
};

const opencodeFreeLogicalModels = {
  'muse-spark-1.2': 'muse-spark-1.2-contributor-free',
  'deepseek-v4-flash': 'deepseek-v4-flash-free',
  'laguna-s-2.1': 'laguna-s-2.1-free',
  'mimo-v2.5': 'mimo-v2.5-free',
  'nemotron-3.5-lightning': 'nemotron-3.5-lightning-free',
};

export function providerForLogicalModel(provider = {}, logicalModel) {
  if (!logicalModel) return provider;
  if (provider.id === 'opencode-zen') {
    const preferFree = /(?:^|[-:])free$/i.test(provider.model || '');
    return { ...provider, model: (preferFree ? opencodeFreeLogicalModels[logicalModel] : null) || opencodeLogicalModels[logicalModel] || logicalModel };
  }
  return provider;
}

async function completeOne(provider, message, context = []) {
  if (!provider.baseUrl || !provider.model) return null;
  const credentialRef = keyFor[provider.id] || 'CUSTOM_API_KEY';
  const key = provider.id === 'local' ? '' : process.env[credentialRef];
  if (provider.id !== 'local' && (!key || !credentialEnabled(credentialRef))) return null;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
  try { const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: provider.model, messages: [{ role: 'system', content: 'You are JARVIS, the single assistant for A.E.G.I.S. Be concise and honest about tool availability.' }, ...context, { role: 'user', content: message }], temperature: 0.2, max_tokens: Math.min(8192, Math.max(128, Number(process.env.MODEL_MAX_OUTPUT_TOKENS || 2048))) }) }); if (!response.ok) throw new Error(`${provider.id} returned HTTP ${response.status}`); const data = await response.json(); const reply = data.choices?.[0]?.message?.content; return reply ? { reply: String(reply), tokens: Number(data.usage?.total_tokens || message.length + reply.length), cost: Number(data.usage?.cost || 0), provider: provider.id, model: provider.model } : null; } finally { clearTimeout(timer); }
}

export async function complete(provider = {}, message, context = []) {
  const order = String(process.env.PROVIDER_FALLBACK_ORDER || 'groq,openrouter,opencode-zen,9router').split(',').map((id) => id.trim()).filter(Boolean);
  const candidates = [provider, ...order.filter((id) => id !== provider.id).map((id) => { const item = defaults[id]; return item ? { id, label: item[0], baseUrl: item[1], model: process.env[item[2]] || item[3], configured: true } : null; }).filter(Boolean)]; let lastError;
  for (const candidate of candidates) { try { const result = await completeOne(candidate, message, context); if (result) return { ...result, fallback: candidate.id !== provider.id }; } catch (error) { lastError = error; } }
  if (lastError) throw lastError; return null;
}
