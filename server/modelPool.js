import { modelRegistry } from './modelRouting.js';
import { brainCatalog } from './brainSources.js';
import { resolveAutoBrainModels } from './brainService.js';
import { presetFor } from './providerPresets.js';
import { paidApiUsageEnabled, zeroSpendEligible } from './spendPolicy.js';
import { spawn } from 'node:child_process';

const openRouterPool = (prefix, modelId, extra = {}) => ['OPENROUTER_API_KEY', ...Object.keys(process.env).filter((key) => /^OPENROUTER_API_KEY_\d+$/.test(key)).sort((a, b) => Number(a.match(/\d+$/)?.[0]) - Number(b.match(/\d+$/)?.[0]))].map((credentialRef, index) => ({ id: `${prefix}-${index + 1}`, provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', modelId, credentialRef, priority: 990_000, ...extra }));
const DEFAULT_POOL_MODELS = {
  'agent_brain': ['muse', 'muse/spark-1.2'],
  'deepseek-v4-flash': ['deepseek', 'deepseek/deepseek-v4-flash'],
  'fallback': ['glm', 'z-ai/fallback'],
  'laguna-s-2.1': ['laguna', 'laguna-s-2.1'],
  'minimax-m3': ['minimax', 'minimax/minimax-m3'],
  'perception': ['nano-omni', 'nvidia/perception', { modalities: ['text', 'image', 'audio', 'video'] }],
  'mimo-v2.5': ['mimo', 'xiaomi/mimo-v2.5', { modalities: ['text', 'image', 'audio', 'video'] }],
  'nemotron-3.5-lightning': ['lightning', 'nvidia/nemotron-3.5-lightning'],
};
const defaultPoolMap = () => Object.fromEntries(Object.entries(DEFAULT_POOL_MODELS).map(([logicalModel, args]) => [logicalModel, openRouterPool(...args)]));

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

export function configuredPools(catalog = brainCatalog) {
  let parsed = {};
  try { parsed = JSON.parse(process.env.MODEL_PROVIDER_POOLS || '{}'); } catch {}
  const merged = { ...defaultPoolMap(), ...parsed };
  for (const entry of catalog.poolEntries()) (merged[entry.logicalModel] ??= []).unshift(entry);
  return merged;
}

export function publicPools(catalog = brainCatalog) {
  return Object.fromEntries(Object.entries(configuredPools(catalog)).map(([model, providers]) => [model, providers.map((provider) => ({
    id: provider.id,
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    modelId: provider.modelId,
    credentialRef: provider.credentialRef || null,
    credentialConfigured: provider.type === 'API' ? Boolean(catalog.credentialSecret(provider.credentialId)) : provider.type ? true : Boolean(process.env[provider.credentialRef]),
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
  const modelHealth = provider.sourceId && health[`brain-model-${provider.sourceId}-${provider.modelId}`];
  if (modelHealth?.retryAfter && new Date(modelHealth.retryAfter).getTime() > timestamp) return false;
  if (!current) return true;
  if (['DISABLED', 'INVALID_CREDENTIAL'].includes(current.status)) return false;
  return !current.retryAfter || new Date(current.retryAfter).getTime() <= timestamp;
}

function safeReason(message, provider, catalog) {
  let result = String(message || '').slice(0, 300);
  const secret = provider.credentialId ? catalog.credentialSecret(provider.credentialId) : process.env[provider.credentialRef];
  if (secret) result = result.replaceAll(secret, '[redacted]');
  return result;
}

function cooldownMs(response, kind) {
  const retryAfter = response?.headers?.get?.('retry-after');
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(retryAfter || '');
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return kind === 'QUOTA_EXHAUSTED' ? 15 * 60_000 : kind === 'RATE_LIMITED' ? 60_000 : 15_000;
}

async function callProvider(provider, messages, fetchImpl, timeoutMs, toolSpecs = [], catalog = brainCatalog, onToken = null) {
  if (provider.type === 'CLI') return callCliProvider(provider, messages, timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.presetId === 'ollama' ? Math.max(timeoutMs, 90_000) : timeoutMs);
  try {
    const secret = provider.credentialId ? catalog.credentialSecret(provider.credentialId) : process.env[provider.credentialRef];
    const anthropic = presetFor(provider.presetId)?.apiFormat === 'anthropic-messages';
    const ollama = provider.presetId === 'ollama';
    const system = messages.filter((item) => item.role === 'system').map((item) => item.content).filter((item) => typeof item === 'string').join('\n');
    const requestMessages = anthropic ? messages.filter((item) => item.role !== 'system').map((item) => {
      if (item.role === 'tool') return { role: 'user', content: [{ type: 'tool_result', tool_use_id: item.tool_call_id, content: String(item.content || '') }] };
      if (item.role === 'assistant' && item.tool_calls?.length) {
        const content = typeof item.content === 'string' && item.content ? [{ type: 'text', text: item.content }] : [];
        for (const call of item.tool_calls) {
          let input = {};
          try { input = JSON.parse(call.function?.arguments || '{}'); } catch {}
          content.push({ type: 'tool_use', id: call.id, name: call.function?.name, input });
        }
        return { role: 'assistant', content };
      }
      return item;
    }) : messages;
    const maxTokens = Math.min(8192, Math.max(128, Number(process.env.MODEL_MAX_OUTPUT_TOKENS || 2048)));
    // Some installed Qwen templates prefill a thinking block even with think:false.
    // JSON-constrained final answers keep internal deliberation out of ordinary chat.
    const structuredOllamaAnswer = ollama && !toolSpecs.length && messages.every((item) => typeof item.content === 'string');
    const stream = !!onToken && !toolSpecs.length;
    const body = ollama ? { model: provider.modelId, messages: [{ role: 'system', content: '/no_think\nReturn only the final answer.' }, ...messages], stream, think: false, options: { num_predict: Math.min(512, maxTokens) }, ...(structuredOllamaAnswer ? { format: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false } } : {}), ...(toolSpecs.length ? { tools: toolSpecs } : {}) } : anthropic ? { model: provider.modelId, max_tokens: maxTokens, messages: requestMessages, stream, ...(system ? { system } : {}), ...(toolSpecs.length ? { tools: toolSpecs.map((item) => ({ name: item.function.name, description: item.function.description || '', input_schema: item.function.parameters || { type: 'object' } })) } : {}) } : { model: provider.modelId, messages, max_tokens: maxTokens, stream, ...(toolSpecs.length ? { tools: toolSpecs, tool_choice: 'auto' } : {}) };
    const endpoint = ollama ? `${new URL(provider.baseUrl).origin}/api/chat` : `${provider.baseUrl.replace(/\/$/, '')}${anthropic ? '/messages' : '/chat/completions'}`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...(anthropic ? { 'anthropic-version': '2023-06-01' } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) return response;
    if (!stream && !anthropic && !ollama) return response;
    
    if (stream && response.body) {
      let accumulatedContent = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (ollama || trimmed.startsWith('data: ')) {
              try {
                const data = ollama ? JSON.parse(trimmed) : JSON.parse(trimmed.slice(6));
                let chunkText = '';
                if (ollama) {
                  chunkText = data.message?.content || '';
                } else if (anthropic) {
                  if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                    chunkText = data.delta.text || '';
                  }
                } else {
                  chunkText = data.choices?.[0]?.delta?.content || '';
                }
                if (chunkText) {
                  accumulatedContent += chunkText;
                  onToken(chunkText);
                }
              } catch (e) {}
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (ollama) {
        let answer = accumulatedContent.split('</think>').at(-1).trim();
        return { ok: true, status: response.status, headers: response.headers, json: async () => ({ choices: [{ message: { content: answer, tool_calls: [] } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }) };
      }
      return { ok: true, status: response.status, headers: response.headers, json: async () => ({ choices: [{ message: { content: accumulatedContent, tool_calls: [] } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }) };
    }

    const payload = await response.json().catch(() => ({}));
    if (ollama) {
      let answer = String(payload.message?.content || '').split('</think>').at(-1).trim();
      if (structuredOllamaAnswer) {
        try { const parsed = JSON.parse(answer); answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''; }
        catch { answer = ''; }
      }
      return { ok: true, status: response.status, headers: response.headers, json: async () => ({ choices: [{ message: { content: answer, tool_calls: payload.message?.tool_calls?.map((item, index) => ({ id: item.id || `ollama-tool-${index}`, type: 'function', function: { name: item.function?.name || item.name, arguments: JSON.stringify(item.function?.arguments || item.arguments || {}) } })) || [] } }], usage: { prompt_tokens: payload.prompt_eval_count || 0, completion_tokens: payload.eval_count || 0, total_tokens: Number(payload.prompt_eval_count || 0) + Number(payload.eval_count || 0) } }) };
    }
    const content = payload.content?.filter((item) => item.type === 'text').map((item) => item.text).join('') || '';
    const toolCalls = payload.content?.filter((item) => item.type === 'tool_use').map((item) => ({ id: item.id, type: 'function', function: { name: item.name, arguments: JSON.stringify(item.input || {}) } })) || [];
    return { ok: true, status: response.status, headers: response.headers, json: async () => ({ choices: [{ message: { content, tool_calls: toolCalls } }], usage: { prompt_tokens: payload.usage?.input_tokens, completion_tokens: payload.usage?.output_tokens, total_tokens: Number(payload.usage?.input_tokens || 0) + Number(payload.usage?.output_tokens || 0) } }) };
  } catch (error) {
    return { ok: false, status: 0, headers: new Headers(), json: async () => ({ error: { message: error.name === 'AbortError' ? 'Provider request timed out' : error.message } }) };
  } finally {
    clearTimeout(timer);
  }
}

function callCliProvider(provider, messages, timeoutMs) {
  const command = provider.adapter === 'codex' ? 'codex' : provider.adapter === 'claude' ? 'claude' : null;
  if (!command) return Promise.resolve({ ok: false, status: 503, headers: new Headers(), json: async () => ({ error: { message: 'CLI adapter is not available for inference' } }) });
  const args = provider.adapter === 'codex' ? ['exec', '--sandbox', 'read-only', '--ephemeral', ...(provider.modelId && provider.modelId !== 'default' ? ['--model', provider.modelId] : []), '-'] : ['-p', '--tools', '', '--output-format', 'text', ...(provider.modelId && provider.modelId !== 'default' ? ['--model', provider.modelId] : [])];
  const prompt = messages.map((item) => `${item.role}: ${typeof item.content === 'string' ? item.content : JSON.stringify(item.content)}`).join('\n\n');
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errorOutput = '', settled = false;
    const finish = (ok, message) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ok, status: ok ? 200 : 503, headers: new Headers(), json: async () => ok ? { choices: [{ message: { content: output.trim() } }] } : { error: { message } } }); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(false, 'CLI request timed out'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 2_000_000) { child.kill('SIGTERM'); finish(false, 'CLI output exceeded limit'); } });
    child.stderr.on('data', (chunk) => { errorOutput += chunk; if (errorOutput.length > 8_000) errorOutput = errorOutput.slice(-8_000); });
    child.on('error', () => finish(false, 'CLI executable unavailable'));
    child.stdin.on('error', () => {});
    child.on('close', (code) => finish(code === 0 && Boolean(output.trim()), code === 0 ? 'CLI returned no output' : `CLI exited with status ${code}`));
    child.stdin.end(prompt);
  });
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
    if (modality === 'image') {
      const url = attachment.url || attachment.dataUrl || (attachment.base64 ? `data:${attachment.mimeType || 'image/png'};base64,${attachment.base64}` : null);
      if (url) { content.push({ type: 'image_url', image_url: { url } }); continue; }
    }
    if (modality === 'audio' && attachment.data) { content.push({ type: 'input_audio', input_audio: { data: attachment.data, format: attachment.format || 'wav' } }); continue; }
    const error = new Error(`Attachment cannot be encoded for ${modality} provider input`);
    error.code = 'REQUEST_ERROR';
    throw error;
  }
  return content;
}

export async function executeModelPool({ logicalModel, request, context = [], continuationState = null, attachments = [], state = {}, fetchImpl = fetch, now = () => Date.now(), allowFallback = true, requiredModality = 'text', requiredCapability = 'text', sourceTier = 'all', timeoutMs = 20_000, toolSpecs = [], messagesOverride = null, catalog = brainCatalog, onToken = null }) {
  if (catalog.list().some((source) => source.modelId === 'auto' && source.secretConfigured)) await resolveAutoBrainModels({ catalog, fetchImpl });
  const registry = modelRegistry();
  const pools = configuredPools(catalog);
  const routing = state.modelRouting ??= {};
  const health = routing.providerHealth ??= {};
  const modality = normalizeModality(requiredModality);
  const continuation = continuationMessage(continuationState);
  const messages = messagesOverride || [...context, ...(continuation ? [continuation] : []), { role: 'user', content: userContent(request, attachments, modality) }];
  const telemetry = { requestedModel: logicalModel, selectedModel: logicalModel, finalModel: null, providerAttempts: [], apiRotationCount: 0, modelFallbackUsed: false, fallbackFrom: null, fallbackTo: null };
  const visited = new Set();
  let spendBlocked = false;

  async function attemptModel(model) {
    if (visited.has(model)) return null;
    visited.add(model);
    const candidates = (pools[model] || [])
      .filter((provider) => !(routing.modelMode === 'manual' && routing.lockedSourceId) || provider.sourceId === routing.lockedSourceId)
      .filter((provider) => sourceTier === 'all' || sourceTier === 'local' && provider.type === 'LOCAL' || sourceTier === 'api' && provider.type !== 'LOCAL' && provider.type !== 'CLI')
      .filter((provider) => (provider.type === 'LOCAL' || provider.type === 'CLI' || provider.credentialId && catalog.credentialSecret(provider.credentialId) || process.env[provider.credentialRef]) && eligible(provider, health, now()) && (!provider.modalities || provider.modalities.includes(modality)) && (!provider.type || ((!toolSpecs.length || provider.type !== 'CLI' && provider.capabilities?.includes('tools')) && (!requiredCapability || requiredCapability === 'text' || provider.capabilities?.includes(requiredCapability)))))
      .sort((a, b) => (a.priority ?? 500) - (b.priority ?? 500) || (inFlight.get(a.id) || 0) - (inFlight.get(b.id) || 0));
    const available = [];
    for (const provider of candidates) {
      const secret = provider.credentialId ? catalog.credentialSecret(provider.credentialId) : process.env[provider.credentialRef];
      if (await zeroSpendEligible(provider, { fetchImpl, now: now(), secret })) available.push(provider);
      else if (provider.type !== 'LOCAL' && !paidApiUsageEnabled()) spendBlocked = true;
    }

    for (const provider of available) {
      inFlight.set(provider.id, (inFlight.get(provider.id) || 0) + 1);
      let retry = 0;
      try {
        while (true) {
          const startedAt = new Date(now()).toISOString();
          const started = performance.now();
          const response = await callProvider(provider, messages, fetchImpl, timeoutMs, toolSpecs, catalog, onToken);
          const payload = await response.json().catch(() => ({}));
          const attempt = telemetry.providerAttempts.length + 1;
          const messageResult = payload.choices?.[0]?.message;
          const reply = messageResult?.content;
          const toolCalls = Array.isArray(messageResult?.tool_calls) ? messageResult.tool_calls : [];
          if (response.ok && ((typeof reply === 'string' && reply.trim()) || toolCalls.length)) {
            health[provider.id] = { status: 'HEALTHY', consecutiveFailures: 0, lastSuccessAt: new Date(now()).toISOString() };
            telemetry.providerAttempts.push({ providerId: provider.id, modelId: provider.modelId, attempt, startedAt, latencyMs: Math.round(performance.now() - started), success: true, statusCode: response.status || 200 });
            telemetry.finalModel = model;
            telemetry.apiRotationCount = new Set(telemetry.providerAttempts.map((item) => item.providerId)).size - 1;
            return { reply: typeof reply === 'string' ? reply : '', toolCalls, tokens: Number(payload.usage?.total_tokens || 0), inputTokens: Number(payload.usage?.prompt_tokens || 0), outputTokens: Number(payload.usage?.completion_tokens || 0), cost: Number(payload.usage?.cost || 0), provider: provider.id, model: provider.modelId, logicalModel: model, routingTelemetry: telemetry };
          }

          const rawMessage = response.ok ? 'Provider returned a successful response without model output' : payload.error?.message || payload.message || '';
          const kind = response.ok ? 'INVALID_RESPONSE' : failureClass(response.status, rawMessage);
          const message = safeReason(rawMessage, provider, catalog);
          telemetry.providerAttempts.push({ providerId: provider.id, modelId: provider.modelId, attempt, startedAt, latencyMs: Math.round(performance.now() - started), success: false, statusCode: response.status, failureClass: kind, failureReason: message.slice(0, 300) });
          if (kind === 'REQUEST_ERROR') {
            const error = new Error(message || `Request rejected with HTTP ${response.status}`);
            error.code = kind;
            error.routingTelemetry = telemetry;
            throw error;
          }
          if (retryable.has(kind) && retry++ === 0 && provider.type !== 'CLI') continue;
          if (kind === 'MODEL_UNAVAILABLE' && provider.sourceId) {
            health[`brain-model-${provider.sourceId}-${provider.modelId}`] = { status: kind, lastFailureAt: new Date(now()).toISOString(), retryAfter: new Date(now() + cooldownMs(response, kind)).toISOString() };
            break;
          }
          health[provider.id] = {
            status: kind,
            lastFailureAt: new Date(now()).toISOString(),
            retryAfter: ['RATE_LIMITED', 'QUOTA_EXHAUSTED', 'MODEL_UNAVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'PROVIDER_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(kind) ? new Date(now() + cooldownMs(response, kind)).toISOString() : null,
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
  const error = new Error(spendBlocked ? 'No compatible model has verified zero-cost pricing' : `All providers exhausted for ${logicalModel}${telemetry.fallbackTo ? ` and ${telemetry.fallbackTo}` : ''}`);
  error.code = spendBlocked ? 'NO_ZERO_COST_MODEL_AVAILABLE' : 'MODEL_CAPACITY_EXHAUSTED';
  error.routingTelemetry = telemetry;
  throw error;
}

export function defaultPools() {
  return defaultPoolMap();
}
