import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { brainCatalog } from './brainSources.js';
import { presetFor } from './providerPresets.js';
import { paidApiUsageEnabled, pricingClass } from './spendPolicy.js';

const commands = [
  { id: 'codex', command: 'codex', label: 'Codex CLI' },
  { id: 'claude', command: 'claude', label: 'Claude Code' },
  { id: 'opencode', command: 'opencode', label: 'OpenCode' },
];

function executable(command) {
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(folder, command);
    try { fs.accessSync(file, fs.constants.X_OK); return file; } catch {}
  }
  return null;
}

export function detectedCliSources() {
  return commands.map((item) => {
    const location = executable(item.command);
    const result = location ? spawnSync(location, ['--version'], { encoding: 'utf8', timeout: 3000, env: process.env }) : null;
    return { id: item.id, label: item.label, executable: location, version: result?.status === 0 ? String(result.stdout || result.stderr).trim().slice(0, 120) : null, status: !location ? 'NOT_INSTALLED' : result?.status === 0 ? 'DETECTED_AUTH_UNVERIFIED' : 'ERROR' };
  });
}

export async function ollamaRuntimeStatus({ fetchImpl = fetch, catalog = brainCatalog } = {}) {
  const source = catalog.list().find((item) => item.presetId === 'ollama');
  const base = source ? new URL(source.baseUrl).origin : 'http://127.0.0.1:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const [versionResponse, tagsResponse] = await Promise.all([fetchImpl(`${base}/api/version`, { signal: controller.signal }), fetchImpl(`${base}/api/tags`, { signal: controller.signal })]);
    if (!versionResponse.ok || !tagsResponse.ok) return { status: 'RUNTIME_STOPPED', modelInstalled: false };
    const version = await versionResponse.json();
    const tags = await tagsResponse.json();
    const modelInstalled = (tags.models || []).some((item) => item.name === (source?.modelId || 'qwen3:4b'));
    return { status: modelInstalled ? 'MODEL_AVAILABLE' : 'MODEL_MISSING', version: version.version, modelInstalled };
  } catch { return { status: 'RUNTIME_STOPPED', modelInstalled: false }; }
  finally { clearTimeout(timeout); }
}

function sourceHeaders(source, secret) {
  const preset = presetFor(source.presetId || source.provider);
  return { accept: 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...(preset?.apiFormat === 'anthropic-messages' ? { 'anthropic-version': '2023-06-01' } : {}) };
}

function modelCapabilities(item) {
  const capabilities = ['text'];
  const input = item.modalities?.input || item.architecture?.input_modalities || item.input_modalities || [];
  if (input.includes('image') || item.capabilities?.vision) capabilities.push('image');
  if (input.includes('audio')) capabilities.push('audio');
  if (item.capabilities?.tools || item.capabilities?.function_calling || item.supported_parameters?.includes?.('tools') || item.tags?.includes?.('tool-use')) capabilities.push('tools');
  if (item.capabilities?.reasoning || item.tags?.includes?.('reasoning')) capabilities.push('reasoning');
  return capabilities;
}

const nonChat = /embed|rerank|moderation|whisper|transcrib|speech|tts|image|dall-e|realtime|audio|video|guard|classifier/i;
export function chooseDiscoveredModel(models = [], { freeOnly = false } = {}) {
  return models.filter((item) => !nonChat.test(item.id) && (!item.type || ['chat', 'language'].includes(item.type)) && item.capabilities?.includes('text') && (!freeOnly || item.pricingType === 'FREE_MODEL'))
    .sort((a, b) => Number(b.created || 0) - Number(a.created || 0) || Number(b.capabilities?.includes('tools')) - Number(a.capabilities?.includes('tools')) || a.id.localeCompare(b.id))[0] || null;
}

async function requestModels(source, secret, fetchImpl, signal) {
  const preset = presetFor(source.presetId || source.provider);
  if (preset?.supportsModelDiscovery === false) return { models: [], status: 'UNSUPPORTED' };
  const response = await fetchImpl(`${source.baseUrl.replace(/\/$/, '')}${preset?.discoveryPath || '/models'}`, { signal, headers: sourceHeaders(source, secret) });
  if (!response.ok) return { models: [], status: response.status === 401 || response.status === 403 ? 'INVALID_CREDENTIAL' : response.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE', httpStatus: response.status };
  const payload = await response.json().catch(() => ({}));
  const list = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  return { models: list.map((item) => { const entry = typeof item === 'string' ? { id: item } : item; return { id: entry.id || entry.name, name: entry.display_name || entry.name || entry.id, type: entry.type || null, created: entry.created || entry.created_at || 0, capabilities: modelCapabilities(entry), pricingType: pricingClass(entry) }; }).filter((item) => item.id).slice(0, 1000), status: 'HEALTHY' };
}

async function quickInference(source, secret, fetchImpl, signal, tools = false) {
  const preset = presetFor(source.presetId || source.provider);
  const anthropic = preset?.apiFormat === 'anthropic-messages';
  const nativeOllama = preset?.id === 'ollama';
  const prompt = tools ? `${source.type === 'LOCAL' ? '/no_think\n' : ''}Call report_ready with value true now. No explanation.` : `${source.type === 'LOCAL' ? '/no_think\n' : ''}Reply with exactly: JARVIS_LOCAL_OK`;
  const maxTokens = source.type === 'LOCAL' ? 256 : tools ? 128 : 80;
  const body = nativeOllama ? { model: source.modelId, think: false, options: { num_predict: maxTokens }, stream: false, messages: [{ role: 'user', content: prompt }] } : anthropic ? { model: source.modelId, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] } : { model: source.modelId, ...(preset?.id === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }), stream: false, messages: [{ role: 'user', content: prompt }] };
  if (tools) body.tools = anthropic ? [{ name: 'report_ready', description: 'Report readiness', input_schema: { type: 'object', properties: { value: { type: 'boolean' } }, required: ['value'] } }] : [{ type: 'function', function: { name: 'report_ready', description: 'Report readiness', parameters: { type: 'object', properties: { value: { type: 'boolean' } }, required: ['value'] } } }];
  const url = nativeOllama ? `${new URL(source.baseUrl).origin}/api/chat` : `${source.baseUrl.replace(/\/$/, '')}${anthropic ? '/messages' : '/chat/completions'}`;
  const response = await fetchImpl(url, { method: 'POST', signal, headers: { ...sourceHeaders(source, secret), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) return { status: response.status === 401 || response.status === 403 ? 'INVALID_CREDENTIAL' : response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'DEGRADED' : 'MODEL_UNAVAILABLE', httpStatus: response.status };
  const payload = await response.json().catch(() => ({}));
  const content = nativeOllama ? payload.message?.content : anthropic ? payload.content?.filter((item) => item.type === 'text').map((item) => item.text).join('') : payload.choices?.[0]?.message?.content;
  const toolCalls = nativeOllama ? payload.message?.tool_calls : anthropic ? payload.content?.filter((item) => item.type === 'tool_use') : payload.choices?.[0]?.message?.tool_calls;
  const metrics = nativeOllama ? { tokensPerSecond: payload.eval_duration ? Math.round(payload.eval_count / payload.eval_duration * 1e10) / 10 : null, generationMs: payload.eval_duration ? Math.round(payload.eval_duration / 1e6) : null, loadMs: payload.load_duration ? Math.round(payload.load_duration / 1e6) : null } : {};
  return tools ? { status: toolCalls?.some((item) => (item.name || item.function?.name) === 'report_ready') ? 'HEALTHY' : 'UNSUPPORTED', ...metrics } : { status: source.type === 'LOCAL' ? String(content || '').trim().endsWith('JARVIS_LOCAL_OK') ? 'HEALTHY' : 'UNVERIFIED' : String(content || '').trim() ? 'HEALTHY' : 'UNVERIFIED', responseObserved: Boolean(content), ...metrics };
}

export async function testBrainSource(sourceId, credentialId = null, { catalog = brainCatalog, fetchImpl = fetch } = {}) {
  const source = catalog.find(sourceId);
  if (source.type === 'CLI') {
    const detected = detectedCliSources().find((entry) => entry.id === source.adapter);
    return detected || { status: 'NOT_INSTALLED' };
  }
  const credential = credentialId ? source.credentials.find((item) => item.id === credentialId) : source.credentials.find((item) => item.enabled && catalog.credentialSecret(item.id));
  if (source.type === 'API' && !credential) return { status: 'CONFIGURATION_REQUIRED', message: 'Add an API key' };
  if (credentialId && !credential) return { status: 'BRAIN_CREDENTIAL_NOT_FOUND' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.type === 'LOCAL' ? 90_000 : 12_000);
  const started = performance.now();
  try {
    const secret = credential ? catalog.credentialSecret(credential.id) : '';
    const preset = presetFor(source.presetId || source.provider);
    if (preset?.autoRoute === false && source.modelId === 'auto') {
      const discovery = await requestModels(source, secret, fetchImpl, controller.signal);
      return { status: discovery.status === 'HEALTHY' ? 'MODEL_SELECTION_REQUIRED' : discovery.status, latencyMs: Math.round(performance.now() - started), modelCount: discovery.models.length };
    }
    let selected = null;
    if (source.modelId === 'auto' || source.type === 'API' && !paidApiUsageEnabled()) {
      const discovery = await requestModels(source, secret, fetchImpl, controller.signal);
      if (discovery.status !== 'HEALTHY') return { status: discovery.status, latencyMs: Math.round(performance.now() - started) };
      selected = source.modelId === 'auto'
        ? chooseDiscoveredModel(discovery.models, { freeOnly: source.type === 'API' && !paidApiUsageEnabled() })
        : discovery.models.find((model) => model.id === source.modelId);
      if (!selected) return { status: source.type === 'API' && !paidApiUsageEnabled() ? 'UNKNOWN_PRICING_DISABLED' : 'MODEL_SELECTION_REQUIRED', latencyMs: Math.round(performance.now() - started) };
      if (source.type === 'API' && !paidApiUsageEnabled() && selected.pricingType !== 'FREE_MODEL') return { status: selected.pricingType, latencyMs: Math.round(performance.now() - started), modelId: selected.id };
    }
    const testedSource = selected ? { ...source, modelId: selected.id } : source;
    if (source.type === 'LOCAL') {
      const inference = await quickInference(testedSource, secret, fetchImpl, controller.signal);
      if (inference.status !== 'HEALTHY') return { ...inference, latencyMs: Math.round(performance.now() - started) };
      const toolResult = await quickInference(testedSource, secret, fetchImpl, controller.signal, true);
      const capabilities = toolResult.status === 'HEALTHY' ? ['text', 'tools'] : ['text'];
      catalog.updateSource(source.id, { capabilities });
      return { status: 'HEALTHY', capabilities, toolStatus: toolResult.status, latencyMs: Math.round(performance.now() - started), tokensPerSecond: inference.tokensPerSecond, generationMs: inference.generationMs, loadMs: inference.loadMs };
    }
    if (preset?.id === 'openrouter') {
      const response = await fetchImpl(`${source.baseUrl}/key`, { signal: controller.signal, headers: sourceHeaders(source, secret) });
      if (!response.ok) return { status: response.status === 401 || response.status === 403 ? 'INVALID_CREDENTIAL' : 'UNVERIFIED', latencyMs: Math.round(performance.now() - started) };
    }
    if (testedSource.modelId === 'auto') return { status: 'MODEL_SELECTION_REQUIRED', latencyMs: Math.round(performance.now() - started) };
    const inference = await quickInference(testedSource, secret, fetchImpl, controller.signal);
    if (inference.status !== 'HEALTHY') return { status: inference.status, latencyMs: Math.round(performance.now() - started), modelId: testedSource.modelId };
    const capabilities = [...(selected?.capabilities || source.capabilities)];
    let toolStatus = null;
    if (preset?.capabilities?.includes('tools') || capabilities.includes('tools')) {
      const toolResult = await quickInference(testedSource, secret, fetchImpl, controller.signal, true);
      toolStatus = toolResult.status;
      if (toolStatus === 'HEALTHY' && !capabilities.includes('tools')) capabilities.push('tools');
      if (toolStatus !== 'HEALTHY' && capabilities.includes('tools')) capabilities.splice(capabilities.indexOf('tools'), 1);
    }
    catalog.updateSource(source.id, { modelId: testedSource.modelId, capabilities });
    return { status: 'HEALTHY', pricingType: selected?.pricingType || (paidApiUsageEnabled() ? 'PAID_USAGE_ALLOWED' : 'UNKNOWN_PRICING_DISABLED'), latencyMs: Math.round(performance.now() - started), modelId: testedSource.modelId, capabilities, toolStatus };
  } catch (error) { return { status: error.name === 'AbortError' ? 'TIMEOUT' : 'OFFLINE', latencyMs: Math.round(performance.now() - started) }; }
  finally { clearTimeout(timeout); }
}

export async function discoverBrainModels(sourceId, { catalog = brainCatalog, fetchImpl = fetch } = {}) {
  const source = catalog.find(sourceId);
  if (source.type === 'CLI') return { models: [], status: 'UNSUPPORTED' };
  const credential = source.credentials.find((item) => item.enabled);
  const secret = credential ? catalog.credentialSecret(credential.id) : '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await requestModels(source, secret, fetchImpl, controller.signal);
  } catch { return { models: [], status: 'OFFLINE' }; }
  finally { clearTimeout(timeout); }
}

export async function resolveAutoBrainModels({ catalog = brainCatalog, fetchImpl = fetch } = {}) {
  const now = Date.now();
  const pending = catalog.list().filter((source) => source.modelId === 'auto' && source.secretConfigured && presetFor(source.presetId || source.provider)?.autoRoute !== false && now - (autoProbeAttempt.get(source.id) || 0) > 300_000);
  await Promise.allSettled(pending.map(async (source) => {
    autoProbeAttempt.set(source.id, now);
    await testBrainSource(source.id, null, { catalog, fetchImpl });
  }));
}

const autoProbeAttempt = new Map();
