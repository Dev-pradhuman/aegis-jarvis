import http from 'node:http';
import { startHUDManager, toggleHUD } from '../hudManager.js';
import { createGoal, spawnAgent, updateAgentMemory, completeAgentTask } from '../agentManager.js';
import { getState, updateState, activityEntry } from '../store.js';
import { getTool, listCapabilities, listTools } from '../registry.js';
import { validateToolInput } from '../toolSchema.js';
import { publicPools } from '../modelPool.js';
import { assembleModelContext } from '../contextAssembler.js';
import { modelRegistry, selectLogicalModel } from '../modelRouting.js';
import { executeBrainWorkflow } from '../brainWorkflow.js';
import { openWebAiSession, webAiStatus } from '../webAiProvider.js';
import { paidApiUsageEnabled, pricingClass } from '../spendPolicy.js';
import { executeTool } from '../toolExecutor.js';
import { runWorkflow, workflowSummary } from '../workflowEngine.js';
import { resolveApprovalRequest } from '../approvalContinuation.js';
import { executeApiTool } from '../apiToolRun.js';
import { capabilityStatus } from '../capabilityStatus.js';
import { publicApprovalPolicy, validateApprovalRules } from '../approvalPolicy.js';
import { expirePendingApprovals } from '../approvalExpiry.js';
import { diagnostics, ingestDocument, integrationStatus, researchSearch, searchMemory } from '../systemModules.js';
import { tick } from '../scheduler.js';
import { claimDueReminders, deliverDesktopReminder } from '../reminders.js';
import crypto from 'node:crypto';
import { adapterStatus, embed, extractDocument, mcpError, mcpResponse, vectorSearch } from '../extendedAdapters.js';
import { calendarRequest, createSession, validSession } from '../liveAdapters.js';
import { beginRun, errorRun, finishRun } from '../orchestrator.js';
import { transitionRun } from '../runEngine.js';
import { routeRequest } from '../router.js';
import { publicConfig, saveConfig } from '../config.js';
import { synthesizeSpeech, transcribeAudio, ttsStatus } from '../tts.js';
import { downloadVideoJob, generateMedia, readGeneratedMedia, refreshVideoJob } from '../mediaGeneration.js';
import { composioStatus, composioToolRisk, createComposioConnectLink, listComposioAccounts, listComposioTools, validateComposioProjectKey } from '../composioAdapter.js';
import { complete as completeConfiguredProvider, providerForLogicalModel } from '../providerClient.js';
import { systemMetrics } from '../systemMetrics.js';
import { browserManager } from '../browser/index.js';
import { listProjectStatus } from '../projectIntelligence.js';
import { discoverMcpServers } from '../mcpDiscovery.js';
import { deviceStatus, ingestDeviceEvent, pairDevice, revokeDevice } from '../deviceBridge.js';
import { planGroundedResearch } from '../researchWorkflow.js';
import { requestOriginAllowed } from '../requestSecurity.js';
import { executeModelToolLoop } from '../modelToolLoop.js';
import { executeModelPool } from '../modelPool.js';
import { invokeToolRequest } from '../toolRuntime.js';
import { unattendedTool, unattendedTools } from '../toolPolicy.js';
import { brainCatalog } from '../brainSources.js';
import { detectedCliSources, discoverBrainModels, ollamaRuntimeStatus, testBrainSource } from '../brainService.js';
import { publicProviderPresets, presetFor } from '../providerPresets.js';

export default async function brainRoutes(req, res, url, state, ctx) {
  const { json, body, recordActivity, modelFailureReply, publicProvider, connectionStatus, authorized, uptimeSeconds, desktopErrorStatus, processSchedulerTick, lastSchedulerTick, schedulerEnabled, schedulerInterval, port } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/research/status') return json(res, 200, { configured: Boolean(process.env.SEARCH_PROVIDER_URL), provider: process.env.SEARCH_PROVIDER_URL ? 'configured search provider' : null, message: process.env.SEARCH_PROVIDER_URL ? 'Source search is available' : 'SEARCH_PROVIDER_URL is not configured' });
    if (req.method === 'POST' && url.pathname === '/api/research/plan') {
        const result = await planGroundedResearch(await body(req));
        return json(res, result.status === 'configuration_required' ? 503 : 200, result);
      }
    if (req.method === 'GET' && url.pathname === '/api/brain') {
        const runtime = await ollamaRuntimeStatus();
        const voice = ttsStatus();
        const status = brainCatalog.publicStatus(state.modelRouting?.providerHealth);
        if (runtime.status !== 'MODEL_AVAILABLE') for (const source of status.sources) if (source.presetId === 'ollama') source.health = runtime.status;
        if (runtime.status !== 'MODEL_AVAILABLE' && status.sources.every((source) => source.type === 'LOCAL')) status.status = runtime.status;
        return json(res, 200, { ...status, configurationLocked: false, localRuntime: runtime, headlessWeb: webAiStatus(), voice: { provider: voice.provider, sttProvider: voice.sttProvider, apiSpeechDisabledByZeroSpend: voice.apiSpeechDisabledByZeroSpend }, spendPolicy: { zeroSpendMode: !paidApiUsageEnabled(), allowPaidApiUsage: paidApiUsageEnabled(), freeCreditsAutomatic: false }, presets: publicProviderPresets(), cli: detectedCliSources(), models: modelRegistry(), routing: { modelMode: state.modelRouting?.modelMode || 'auto', manualModel: state.modelRouting?.manualModel || null, lockedSourceId: state.modelRouting?.lockedSourceId || null, manualFallbackAllowed: state.modelRouting?.manualFallbackAllowed !== false, dataPolicy: state.modelRouting?.dataPolicy || 'auto', routingWorkflow: state.modelRouting?.routingWorkflow || 'cascade' }, events: (state.modelRouting?.telemetry || []).flatMap((item) => item.providerAttempts || []).slice(-30), runs: state.modelRouting?.telemetry || [] });
      }
    if (req.method === 'POST' && /^\/api\/brain\/web\/(chatgpt|claude|gemini|googleFlow)\/open$/.test(url.pathname)) {
        const site = url.pathname.split('/')[4];
        return json(res, 200, await openWebAiSession(site));
      }
    if (req.method === 'POST' && url.pathname === '/api/brain/test-all') {
        const tasks = brainCatalog.list().flatMap((source) => source.type === 'API' ? source.credentials.filter((key) => key.enabled).map((key) => ({ source, credentialId: key.id })) : [{ source, credentialId: null }]);
        const results = await Promise.all(tasks.map(async ({ source, credentialId }) => {
          const result = await testBrainSource(source.id, credentialId, { force: true });
          await updateState((draft) => { draft.modelRouting ??= {}; draft.modelRouting.providerHealth ??= {}; draft.modelRouting.providerHealth[`brain-${credentialId || source.id}`] = { status: result.status, pricingType: result.pricingType || null, lastCheckedAt: new Date().toISOString() }; return draft; });
          return { sourceId: source.id, credentialId, ...result };
        }));
        return json(res, 200, { results });
      }
    if (req.method === 'POST' && url.pathname.match(/^\/api\/brain\/presets\/[^/]+\/connect$/)) {
        const presetId = url.pathname.split('/')[4]; const preset = presetFor(presetId);
        if (!preset || presetId === 'custom') return json(res, 400, { error: 'Choose a known provider preset' });
        const input = await body(req);
        if (preset.providerType === 'API' && !String(input.secret || '').trim()) return json(res, 400, { error: 'Paste an API key' });
        try {
          const source = brainCatalog.addPresetSource(presetId);
          const credential = preset.providerType === 'API' ? brainCatalog.addCredential(source.id, { secret: input.secret }) : null;
          const result = await testBrainSource(source.id, credential?.id || null, { force: true });
          await updateState((draft) => { draft.modelRouting ??= {}; draft.modelRouting.providerHealth ??= {}; draft.modelRouting.providerHealth[`brain-${credential?.id || source.id}`] = { status: result.status, pricingType: result.pricingType || null, lastCheckedAt: new Date().toISOString() }; return draft; });
          return json(res, 200, { sourceId: source.id, credentialId: credential?.id || null, result });
        } catch (error) { if (error.code?.startsWith('BRAIN_')) return json(res, 400, { code: error.code, error: error.message }); throw error; }
      }
    if (req.method === 'GET' && url.pathname === '/api/brain/sources') return json(res, 200, { sources: brainCatalog.list(state.modelRouting?.providerHealth) });
    if (req.method === 'POST' && url.pathname === '/api/brain/sources') { const source = brainCatalog.addSource(await body(req)); return json(res, 201, { source }); }
    if (req.method === 'GET' && url.pathname === '/api/provider') return json(res, 200, { provider: publicProvider(state.provider) });
    if (req.method === 'GET' && url.pathname === '/api/model-routing') return json(res, 200, { settings: { jarvisMode: state.modelRouting?.jarvisMode || 'normal', modelMode: state.modelRouting?.modelMode || 'auto', manualModel: state.modelRouting?.manualModel || 'agent_brain', manualFallbackAllowed: state.modelRouting?.manualFallbackAllowed !== false, dataPolicy: state.modelRouting?.dataPolicy || 'auto', routingWorkflow: state.modelRouting?.routingWorkflow || 'cascade' }, models: modelRegistry(), providerPools: publicPools(), providerHealth: state.modelRouting?.providerHealth || {}, recentTelemetry: (state.modelRouting?.telemetry || []).slice(0, 25), debug: process.env.JARVIS_ROUTER_DEBUG === 'true' });
    if (req.method === 'PATCH' && url.pathname === '/api/model-routing') { const input = await body(req); const updated = await updateState((draft) => { draft.modelRouting ??= {}; if (['normal', 'coding', 'deepthinking'].includes(input.jarvisMode)) draft.modelRouting.jarvisMode = input.jarvisMode; if (['auto', 'manual'].includes(input.modelMode)) draft.modelRouting.modelMode = input.modelMode; if (modelRegistry()[input.manualModel]) draft.modelRouting.manualModel = input.manualModel; if (typeof input.manualFallbackAllowed === 'boolean') draft.modelRouting.manualFallbackAllowed = input.manualFallbackAllowed; if (input.lockedSourceId === null || brainCatalog.list().some((source) => source.id === input.lockedSourceId)) draft.modelRouting.lockedSourceId = input.lockedSourceId; if (['local', 'cloud', 'auto'].includes(input.dataPolicy)) draft.modelRouting.dataPolicy = input.dataPolicy; if (['cascade', 'local-first', 'web-first'].includes(input.routingWorkflow)) draft.modelRouting.routingWorkflow = input.routingWorkflow; return draft; }); return json(res, 200, { settings: updated.modelRouting }); }
    if (req.method === 'GET' && url.pathname === '/api/provider/models') {
        const provider = state.provider || {};
        if (!provider.baseUrl) return json(res, 400, { error: 'Provider base URL is not configured' });
        const keys = { openrouter: 'OPENROUTER_API_KEY', 'opencode-zen': 'OPENCODE_ZEN_API_KEY', '9router': 'NINEROUTER_API_KEY', custom: 'CUSTOM_API_KEY', groq: 'GROQ_API_KEY' };
        const key = process.env[keys[provider.id] || ''] || '';
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/models`, { signal: controller.signal, headers: { accept: 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) } });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) return json(res, response.status, { error: payload.error?.message || `Provider returned HTTP ${response.status}` });
          const models = Array.isArray(payload.data) ? payload.data.map((item) => { const pricingType = pricingClass(item); return { id: item.id, name: item.name || item.id, pricingType, free: pricingType === 'FREE_MODEL' }; }).filter((item) => item.id) : [];
          return json(res, 200, { provider: provider.id, models });
        } catch (error) { return json(res, 502, { error: error.name === 'AbortError' ? 'Model request timed out' : error.message }); }
        finally { clearTimeout(timer); }
      }
    if (req.method === 'PATCH' && url.pathname === '/api/provider') {
        const input = await body(req);
        const allowed = ['id', 'label', 'model', 'baseUrl', 'configured'];
        const provider = await updateState((draft) => { draft.provider = { ...(draft.provider || {}), ...Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])) }; recordActivity(draft, activityEntry('provider.updated', draft.provider.label || draft.provider.id)); return draft; });
        return json(res, 200, { provider: publicProvider(provider.provider) });
      }
    if (req.method === 'GET' && url.pathname === '/api/composio/status') return json(res, 200, composioStatus());
    if (req.method === 'PATCH' && url.pathname === '/api/composio/config') {
        const input = await body(req);
        try {
          await validateComposioProjectKey(input.apiKey);
          saveConfig({ COMPOSIO_API_KEY: String(input.apiKey).trim(), ...(input.userId ? { COMPOSIO_USER_ID: String(input.userId).trim() } : {}) });
          return json(res, 200, { status: composioStatus() });
        } catch (error) {
          return json(res, [400, 401, 403, 429].includes(error.status) ? error.status : 502, { error: error.message || 'Composio key validation failed', code: 'COMPOSIO_KEY_INVALID' });
        }
      }
    if (req.method === 'GET' && url.pathname === '/api/composio/accounts') {
        if (!composioStatus().configured) return json(res, 503, { error: 'COMPOSIO_API_KEY is not configured', ...composioStatus() });
        return json(res, 200, { accounts: await listComposioAccounts({ toolkit: url.searchParams.get('toolkit') || undefined }) });
      }
    if (req.method === 'GET' && url.pathname === '/api/composio/tools') {
        if (!composioStatus().configured) return json(res, 503, { error: 'COMPOSIO_API_KEY is not configured', ...composioStatus() });
        return json(res, 200, { tools: await listComposioTools({ toolkit: url.searchParams.get('toolkit') || undefined, query: url.searchParams.get('q') || undefined, limit: url.searchParams.get('limit') || 50 }) });
      }
    if (req.method === 'POST' && url.pathname === '/api/composio/connect') {
        const connectionStatus = composioStatus();
        if (!connectionStatus.connectReady && connectionStatus.hasCredential) return json(res, 400, { error: connectionStatus.configurationError, code: 'COMPOSIO_PROJECT_KEY_REQUIRED' });
        if (!connectionStatus.configured) return json(res, 503, { error: 'COMPOSIO_API_KEY is not configured' });
        try {
          const connection = await createComposioConnectLink(await body(req));
          saveConfig({ COMPOSIO_AUTH_CONFIGS: process.env.COMPOSIO_AUTH_CONFIGS || '{}' });
          await updateState((draft) => { recordActivity(draft, activityEntry('composio.connect.requested', connection.toolkit, { toolkit: connection.toolkit, connectedAccountId: connection.connectedAccountId })); return draft; });
          return json(res, 201, { connection });
        } catch (error) {
          const status = [400, 401, 403, 404, 422, 429].includes(error.status) ? error.status : 502;
          return json(res, status, { error: error.message || 'Composio connection failed', code: 'COMPOSIO_CONNECT_FAILED' });
        }
      }
    if (req.method === 'POST' && url.pathname === '/api/composio/execute') {
        const input = await body(req);
        const { approvalId, idempotencyKey, runId, ...toolInput } = input;
        const result = await invokeToolRequest(state, { toolId: 'composio.execute', input: toolInput, approvalId, idempotencyKey, runId });
        return json(res, result.status, result.status === 200 ? { successful: result.body.ok, toolSlug: toolInput.toolSlug, data: result.body.data, logId: result.body.meta?.logId || null, riskLevel: composioToolRisk(toolInput.toolSlug), replayed: result.body.replayed || false } : result.body);
      }
    if (req.method === 'GET' && url.pathname === '/api/memory') return json(res, 200, { memories: state.memories || [] });
    if (req.method === 'GET' && url.pathname === '/api/memory/search') return json(res, 200, { memories: searchMemory(state.memories || [], url.searchParams.get('q') || '') });
    if (req.method === 'POST' && url.pathname === '/api/memory') {
        const input = await body(req); const memory = { id: `memory-${Date.now()}`, text: String(input.text || '').trim(), kind: input.kind || 'project', embedding: embed(String(input.text || '')), createdAt: new Date().toISOString() };
        if (!memory.text) return json(res, 400, { error: 'text is required' });
        await updateState((draft) => { draft.memories ??= []; draft.memories.unshift(memory); recordActivity(draft, activityEntry('memory.created', memory.text, { memoryId: memory.id })); return draft; });
        return json(res, 201, { memory });
      }
    if (req.method === 'GET' && url.pathname === '/api/documents') return json(res, 200, { documents: (state.documents || []).map(({ content, ...metadata }) => ({ ...metadata, characters: content.length })) });
    if (req.method === 'POST' && url.pathname === '/api/documents') {
        const document = await ingestDocument(state.documents || [], await body(req));
        document.extraction = extractDocument(document.content);
        await updateState((draft) => { draft.documents ??= []; draft.documents.unshift(document); recordActivity(draft, activityEntry('document.ingested', document.name, { documentId: document.id })); return draft; });
        return json(res, 201, { document: { ...document, content: undefined } });
      }
    if (req.method === 'POST' && url.pathname === '/api/memory/index') {
        const input = await body(req); let indexed;
        await updateState((draft) => { const memory = (draft.memories || []).find((item) => item.id === input.id); if (memory) { memory.embedding = embed(memory.text); indexed = memory; } return draft; });
        return indexed ? json(res, 200, { memory: indexed }) : json(res, 404, { error: 'Memory not found' });
      }
    if (req.method === 'GET' && url.pathname === '/api/memory/vector-search') return json(res, 200, { memories: vectorSearch(state.memories || [], url.searchParams.get('q') || '') });
    if (req.method === 'POST' && url.pathname === '/api/research/search') {
        const input = await body(req); const query = String(input.query || '').trim();
        if (!query) return json(res, 400, { error: 'query is required' });
        const result = await researchSearch(query);
        if (!result.configured) return json(res, 503, result);
        await updateState((draft) => { recordActivity(draft, activityEntry('research.completed', query, { sources: result.sources.length })); return draft; });
        return json(res, 200, result);
      }

  return false;
}
