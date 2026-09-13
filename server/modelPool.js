import { modelRegistry } from './modelRouting.js';
import { credentialEnabled } from './credentialPool.js';

const openRouterPool = (prefix, modelId, extra = {}) => ['OPENROUTER_API_KEY', ...Array.from({ length: 4 }, (_, index) => `OPENROUTER_API_KEY_${index + 1}`)].map((credentialRef, index) => ({ id: `${prefix}-${index + 1}`, provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', modelId, credentialRef, ...extra }));
const compatiblePool = (prefix, provider, baseUrl, credentialPrefix, modelId, extra = {}) => [`${credentialPrefix}_API_KEY`, ...Array.from({ length: 4 }, (_, index) => `${credentialPrefix}_API_KEY_${index + 1}`)].map((credentialRef, index) => ({ id: `${prefix}-${index + 1}`, provider, baseUrl, modelId, credentialRef, capabilities: ['tools'], ...extra }));
const DEFAULT_POOLS = {
  'gemini-best': compatiblePool('gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'GEMINI', process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-pro'),
  'openai-best': compatiblePool('openai', 'openai', 'https://api.openai.com/v1', 'OPENAI', process.env.OPENAI_CHAT_MODEL || 'gpt-5'),
  'muse-spark-1.2': openRouterPool('muse', 'meta/muse-spark-1.2'),
  'deepseek-v4-flash': openRouterPool('deepseek', 'deepseek/deepseek-v4-flash'),
  'glm-5.2': openRouterPool('glm', 'z-ai/glm-5.2'),
  'laguna-s-2.1': openRouterPool('laguna', 'laguna-s-2.1'),
  'minimax-m3': openRouterPool('minimax', 'minimax/minimax-m3'),
  'nemotron-3-nano-omni': openRouterPool('nano-omni', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', { modalities: ['text', 'image', 'audio', 'video'] }),
  'mimo-v2.5': openRouterPool('mimo', 'xiaomi/mimo-v2.5', { modalities: ['text', 'image', 'audio', 'video'] }),
  'nemotron-3.5-lightning': openRouterPool('lightning', 'nvidia/nemotron-3.5-lightning'),
};

const inFlight = new Map();
const retryable = new Set(['PROVIDER_ERROR', 'TEMPORARILY_UNAVAILABLE', 'NETWORK_ERROR', 'INVALID_RESPONSE']);

export function failureClass(status, message = '') {
  if (status === 401 || status === 403) return 'INVALID_CREDENTIAL';
  if ([400, 404].includes(status) && /model.{0,40}(not found|unavailable|does not exist|not supported)|model_not_found/i.test(message)) return 'MODEL_UNAVAILABLE';
  if (status === 429 && /quota|credit|limit exhausted/i.test(message)) return 'QUOTA_EXHAUSTED';
  if (status === 429) return 'RATE_LIMITED';
  if ([408, 502, 503, 504].includes(status)) return 'TEMPORARILY_UNAVAILABLE';
  if (status >= 500) return 'PROVIDER_ERROR';
  if (status >= 400) return 'REQUEST_ERROR';
  return 'NETWORK_ERROR';
}

export function normalizeModality(value = 'text') {
  const type = String(value).toLowerCase();
  if (type.startsWith('image')) return 'image';
  if (type.startsWith('audio')) return 'audio';
  if (type.startsWith('video')) return 'video';
  return 'text';
}

export function configuredPools() {
  const defaults = structuredClone(DEFAULT_POOLS);
  for (const provider of defaults['openai-best']) provider.modelId = process.env.OPENAI_CHAT_MODEL || 'gpt-5';
  for (const provider of defaults['gemini-best']) provider.modelId = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-pro';
  try {
    const parsed = JSON.parse(process.env.MODEL_PROVIDER_POOLS || '{}');
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function publicPools() {
  return Object.fromEntries(Object.entries(configuredPools()).map(([model, providers]) => [model, providers.map((provider) => ({
    id: provider.id,
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    modelId: provider.modelId,
    credentialRef: provider.credentialRef,
    credentialConfigured: Boolean(process.env[provider.credentialRef]) && credentialEnabled(provider.credentialRef),
    modalities: provider.modalities || ['text'],
    capabilities: provider.capabilities || [],
  }))]));
}

function supportsCapability(model, capability, registry, pools) {
  if (!capability || capability === 'text') return true;
  if (registry[model]?.capabilities.includes(capability)) return true;
  return (pools[model] || []).some((provider) => provider.capabilities?.includes(capability));
}

function eligible(provider, health, timestamp) {
  const current = health[provider.id];
  if (!current) return true;
  if (['DISABLED', 'INVALID_CREDENTIAL', 'QUOTA_EXHAUSTED', 'MODEL_UNAVAILABLE'].includes(current.status)) return false;
  return !current.retryAfter || new Date(current.retryAfter).getTime() <= timestamp;
}

function cooldownMs(response, kind) {
  const retryAfter = response?.headers?.get?.('retry-after');
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(retryAfter || '');
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return kind === 'RATE_LIMITED' ? 60_000 : 15_000;
}

async function callProvider(provider, messages, fetchImpl, timeoutMs, tools = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env[provider.credentialRef]}` },
      body: JSON.stringify({ model: provider.modelId, messages, temperature: 0.2, max_tokens: Math.min(8192, Math.max(128, Number(process.env.MODEL_MAX_OUTPUT_TOKENS || 2048))), ...(tools.length ? { tools, tool_choice: 'auto' } : {}) }),
    });
  } catch (error) {
    return { ok: false, status: 0, headers: new Headers(), json: async () => ({ error: { message: error.name === 'AbortError' ? 'Provider request timed out' : error.message } }) };
  } finally {
    clearTimeout(timer);
  }
}

function continuationMessage(continuationState) {
  if (!continuationState) return null;
  return { role: 'system', content: `Continue the same JARVIS execution Run. Do not repeat completed tool actions. Structured execution state:\n${JSON.stringify(continuationState)}` };
}

function userContent(request, attachments, modality) {
  if (!attachments.length) return request;
  const content = [{ type: 'text', text: request }];
  for (const attachment of attachments) {
    if (attachment.providerContent && typeof attachment.providerContent === 'object') { content.push(attachment.providerContent); continue; }
    if (modality === 'image' && (attachment.url || attachment.dataUrl)) { content.push({ type: 'image_url', image_url: { url: attachment.url || attachment.dataUrl } }); continue; }
    if (modality === 'audio' && attachment.data) { content.push({ type: 'input_audio', input_audio: { data: attachment.data, format: attachment.format || 'wav' } }); continue; }
    const error = new Error(`Attachment cannot be encoded for ${modality} provider input`);
    error.code = 'REQUEST_ERROR';
    throw error;
  }
  return content;
}

export async function executeModelPool({ logicalModel, request, context = [], continuationState = null, attachments = [], tools = [], state = {}, fetchImpl = fetch, now = () => Date.now(), allowFallback = true, requiredModality = 'text', requiredCapability = 'text', timeoutMs = 20_000 }) {
  const registry = modelRegistry();
  const pools = configuredPools();
  const routing = state.modelRouting ??= {};
  const health = routing.providerHealth ??= {};
  const modality = normalizeModality(requiredModality);
  const continuation = continuationMessage(continuationState);
  const messages = [...context, ...(continuation ? [continuation] : []), { role: 'user', content: userContent(request, attachments, modality) }];
  const telemetry = { requestedModel: logicalModel, selectedModel: logicalModel, finalModel: null, providerAttempts: [], apiRotationCount: 0, modelFallbackUsed: false, fallbackFrom: null, fallbackTo: null };
  const visited = new Set();

  async function attemptModel(model) {
    if (visited.has(model)) return null;
    visited.add(model);
    const available = (pools[model] || [])
      .filter((provider) => process.env[provider.credentialRef] && credentialEnabled(provider.credentialRef) && eligible(provider, health, now()) && (!provider.modalities || provider.modalities.includes(modality)))
      .sort((a, b) => (inFlight.get(a.id) || 0) - (inFlight.get(b.id) || 0));

    for (const provider of available) {
      inFlight.set(provider.id, (inFlight.get(provider.id) || 0) + 1);
      let retry = 0;
      try {
        while (true) {
          const startedAt = new Date(now()).toISOString();
          const started = performance.now();
          const response = await callProvider(provider, messages, fetchImpl, timeoutMs, tools);
          const payload = await response.json().catch(() => ({}));
          const attempt = telemetry.providerAttempts.length + 1;
          const messageObject = payload.choices?.[0]?.message || {};
          const reply = typeof messageObject.content === 'string' ? messageObject.content : '';
          const toolCalls = Array.isArray(messageObject.tool_calls) ? messageObject.tool_calls : [];
          if (response.ok && (reply.trim() || toolCalls.length)) {
            health[provider.id] = { status: 'HEALTHY', consecutiveFailures: 0, lastSuccessAt: new Date(now()).toISOString() };
            telemetry.providerAttempts.push({ providerId: provider.id, modelId: provider.modelId, attempt, startedAt, latencyMs: Math.round(performance.now() - started), success: true, statusCode: response.status || 200 });
            telemetry.finalModel = model;
            telemetry.apiRotationCount = new Set(telemetry.providerAttempts.map((item) => item.providerId)).size - 1;
            return { reply, toolCalls, message: messageObject, tokens: Number(payload.usage?.total_tokens || 0), inputTokens: Number(payload.usage?.prompt_tokens || 0), outputTokens: Number(payload.usage?.completion_tokens || 0), cost: Number(payload.usage?.cost || 0), provider: provider.id, model: provider.modelId, logicalModel: model, routingTelemetry: telemetry };
          }

          const message = response.ok ? 'Provider returned a successful response without model output' : payload.error?.message || payload.message || '';
          const kind = response.ok ? 'INVALID_RESPONSE' : failureClass(response.status, message);
          telemetry.providerAttempts.push({ providerId: provider.id, modelId: provider.modelId, attempt, startedAt, latencyMs: Math.round(performance.now() - started), success: false, statusCode: response.status, failureClass: kind, failureReason: message.slice(0, 300) });
          if (kind === 'REQUEST_ERROR') {
            const error = new Error(message || `Request rejected with HTTP ${response.status}`);
            error.code = kind;
            error.routingTelemetry = telemetry;
            throw error;
          }
          if (retryable.has(kind) && retry++ === 0) continue;
          health[provider.id] = {
            status: kind,
            lastFailureAt: new Date(now()).toISOString(),
            retryAfter: ['RATE_LIMITED', 'TEMPORARILY_UNAVAILABLE', 'PROVIDER_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(kind) ? new Date(now() + cooldownMs(response, kind)).toISOString() : null,
            consecutiveFailures: Number(health[provider.id]?.consecutiveFailures || 0) + 1,
            failureReason: message.slice(0, 300),
          };
          break;
        }
      } finally {
        inFlight.set(provider.id, Math.max(0, (inFlight.get(provider.id) || 1) - 1));
      }
    }

    const fallback = registry[model]?.fallbackModel;
    if (allowFallback && fallback && !visited.has(fallback)) {
      if ((modality !== 'text' && !registry[fallback]?.capabilities.includes(modality)) || !supportsCapability(fallback, requiredCapability, registry, pools)) {
        const missing = modality !== 'text' ? modality : requiredCapability;
        const error = new Error(`Required capability unavailable: ${fallback} does not support ${missing}`);
        error.code = 'CAPABILITY_UNAVAILABLE';
        error.routingTelemetry = telemetry;
        throw error;
      }
      telemetry.modelFallbackUsed = true;
      telemetry.fallbackFrom = model;
      telemetry.fallbackTo = fallback;
      return attemptModel(fallback);
    }
    return null;
  }

  const result = await attemptModel(logicalModel);
  if (result) return result;
  const error = new Error(`All providers exhausted for ${logicalModel}${telemetry.fallbackTo ? ` and ${telemetry.fallbackTo}` : ''}`);
  error.code = 'MODEL_CAPACITY_EXHAUSTED';
  error.routingTelemetry = telemetry;
  throw error;
}

export function defaultPools() {
  return structuredClone(DEFAULT_POOLS);
}
