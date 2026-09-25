import http from 'node:http';
import { getState, updateState, activityEntry } from './store.js';
import { getTool, listCapabilities, listTools } from './registry.js';
import { validateToolInput } from './toolSchema.js';
import { publicPools } from './modelPool.js';
import { executeModelDelegation } from './modelDelegation.js';
import { assembleModelContext } from './contextAssembler.js';
import { modelRegistry } from './modelRouting.js';
import { selectLogicalModelWithClassifier } from './modelRouterService.js';
import { executeTool } from './toolExecutor.js';
import { runWorkflow, workflowSummary } from './workflowEngine.js';
import { diagnostics, ingestDocument, integrationStatus, researchSearch, searchMemory } from './systemModules.js';
import { tick } from './scheduler.js';
import crypto from 'node:crypto';
import { adapterStatus, embed, extractDocument, mcpError, mcpResponse, vectorSearch } from './extendedAdapters.js';
import { calendarRequest, createSession, validSession } from './liveAdapters.js';
import { beginRun, errorRun, finishRun } from './orchestrator.js';
import { transitionRun } from './runEngine.js';
import { routeRequest } from './router.js';
import { publicConfig, saveConfig } from './config.js';
import { synthesizeSpeech, transcribeAudio, ttsStatus } from './tts.js';
import { downloadVideoJob, generateMedia, readGeneratedMedia, refreshVideoJob } from './mediaGeneration.js';
import { composioStatus, composioToolRisk, createComposioConnectLink, listComposioAccounts, listComposioTools, validateComposioProjectKey } from './composioAdapter.js';
import { complete as completeConfiguredProvider, providerForLogicalModel } from './providerClient.js';
import { systemMetrics } from './systemMetrics.js';
import { browserManager } from './browser/index.js';
import { listProjectStatus } from './projectIntelligence.js';
import { discoverMcpServers } from './mcpDiscovery.js';
import { deviceStatus, ingestDeviceEvent, pairDevice, revokeDevice } from './deviceBridge.js';
import { planGroundedResearch } from './researchWorkflow.js';
import { requestOriginAllowed } from './requestSecurity.js';
import { executeModelToolLoop } from './modelToolLoop.js';
import { executeModelPool } from './modelPool.js';
import { invokeToolRequest } from './toolRuntime.js';
import { unattendedTool, unattendedTools } from './toolPolicy.js';

const port = Number(process.env.JARVIS_PORT || 8787);
const processStartedAt = Date.now();
const uptimeSeconds = () => Math.floor((Date.now() - processStartedAt) / 1000);
const schedulerEnabled = process.env.JARVIS_SCHEDULER !== '0';
const schedulerInterval = Math.max(10_000, Number(process.env.JARVIS_SCHEDULER_INTERVAL_MS || 30_000));
let lastSchedulerTick = null;
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function body(req) {
  let data = '';
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16_000_000) throw Object.assign(new Error('Request body exceeds 16 MB'), { code: 'PAYLOAD_TOO_LARGE' });
    data += chunk;
  }
  try { return data ? JSON.parse(data) : {}; }
  catch { throw Object.assign(new Error('Request body must be valid JSON'), { code: 'INVALID_JSON' }); }
}

function recordActivity(state, entry) {
  state.activity = [entry, ...(state.activity || [])].slice(0, 200);
}

function modelFailureReply(error, runId) {
  if (error?.code === 'REQUEST_ERROR') return `The model request was rejected before execution: ${error.message}`;
  if (error?.code === 'CAPABILITY_UNAVAILABLE') return `The required capability is temporarily unavailable. Run ${runId} was preserved without claiming the action succeeded.`;
  return `Model capacity is currently unavailable. Run ${runId} was preserved and can be resumed when a provider becomes available.`;
}

const server = http.createServer(async (req, res) => {
  if (!requestOriginAllowed(req.headers)) return json(res, 403, { error: 'Origin or host is not allowed' });
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': req.headers.origin || '', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization', vary: 'Origin' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/auth/status') return json(res, 200, { required: Boolean(process.env.JARVIS_AUTH_TOKEN), authenticated: !process.env.JARVIS_AUTH_TOKEN || authorized(req) });
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const input = await body(req);
      const expected = process.env.JARVIS_AUTH_TOKEN || '';
      const supplied = String(input.token || '');
      if (expected && (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)))) return json(res, 401, { error: 'Invalid credentials' });
      const session = createSession(input.user || 'local-operator');
      res.setHeader('set-cookie', `jarvis_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
      return json(res, 200, session);
    }
    const companionEndpoint = req.method === 'POST' && ['/api/device/pair', '/api/device/events'].includes(url.pathname);
    if (process.env.JARVIS_AUTH_TOKEN && !companionEndpoint && !authorized(req)) return json(res, 401, { error: 'Authentication required' });
    const state = await getState();
    if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, { projects: await listProjectStatus() });
    if (req.method === 'GET' && url.pathname === '/api/mcp/servers') return json(res, 200, { servers: await discoverMcpServers() });
    if (req.method === 'GET' && url.pathname === '/api/device/status') return json(res, 200, deviceStatus(state));
    if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: (state.modelRouting?.telemetry || []).flatMap((route) => (route.delegations || []).map((stage, index) => ({ id: `${route.runId || route.requestId}-${index}`, name: stage.logicalModel, status: route.success === false ? 'failed' : 'completed', provider: stage.provider, runId: route.runId || route.requestId, at: route.timestamp }))).slice(0, 50), dynamicAgentsAvailable: false });
    if (req.method === 'GET' && url.pathname === '/api/research/status') return json(res, 200, { configured: Boolean(process.env.SEARCH_PROVIDER_URL), provider: process.env.SEARCH_PROVIDER_URL ? 'configured search provider' : null, message: process.env.SEARCH_PROVIDER_URL ? 'Source search is available' : 'SEARCH_PROVIDER_URL is not configured' });
    if (req.method === 'POST' && url.pathname === '/api/research/plan') {
      const result = await planGroundedResearch(await body(req));
      return json(res, result.status === 'configuration_required' ? 503 : 200, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/media/jobs') return json(res, 200, { jobs: (state.mediaJobs || []).map(({ operationName, credentialSlot, downloadUri, ...job }) => ({ ...job, downloadUri: downloadUri ? `/api/media/jobs/${job.id}/download` : null })), configured: Boolean(process.env.GEMINI_API_KEY) });
    if (req.method === 'GET' && url.pathname === '/api/messaging/status') return json(res, 200, { configured: Boolean(process.env.MESSAGING_API_URL || process.env.SLACK_WEBHOOK_URL || process.env.SLACK_BOT_TOKEN), whatsappConnected: false, message: 'WhatsApp provider is not connected' });
    if (req.method === 'POST' && url.pathname === '/api/device/pair') {
      const input = await body(req); let result;
      try { await updateState((draft) => { result = pairDevice(draft, input); return draft; }); }
      catch (error) { return json(res, 403, { error: error.message, code: error.code || 'DEVICE_PAIRING_DENIED' }); }
      return json(res, 201, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/device/events') {
      const input = await body(req); let result;
      try { await updateState((draft) => { result = ingestDeviceEvent(draft, req.headers.authorization?.replace(/^Bearer\s+/i, ''), input); return draft; }); }
      catch (error) { return json(res, error.code === 'DEVICE_UNAUTHORIZED' ? 401 : 400, { error: error.message, code: error.code || 'DEVICE_EVENT_INVALID' }); }
      return json(res, 202, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/device/revoke') {
      const input = await body(req); let revoked = false;
      await updateState((draft) => { revoked = revokeDevice(draft, String(input.deviceId || '')); return draft; });
      return revoked ? json(res, 200, { revoked: true }) : json(res, 404, { error: 'Device not found' });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/generated/')) { const fileName = url.pathname.split('/').pop(); const media = await readGeneratedMedia(fileName); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.match(/^\/api\/media\/jobs\/[^/]+\/download$/)) { const id = url.pathname.split('/')[4]; const job = (state.mediaJobs || []).find((item) => item.id === id); if (!job) return json(res, 404, { error: 'Media job not found' }); const media = await downloadVideoJob(job); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.startsWith('/api/media/jobs/')) { const id = url.pathname.split('/').pop(); const existing = (state.mediaJobs || []).find((job) => job.id === id); if (!existing) return json(res, 404, { error: 'Media job not found' }); const job = await refreshVideoJob(existing); await updateState((draft) => { const index = (draft.mediaJobs || []).findIndex((item) => item.id === id); if (index >= 0) draft.mediaJobs[index] = job; return draft; }); return json(res, 200, { job: { ...job, operationName: undefined, credentialSlot: undefined, downloadUri: job.downloadUri ? `/api/media/jobs/${job.id}/download` : null } }); }
    if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, publicConfig());
    if (req.method === 'PATCH' && url.pathname === '/api/config') { const config = saveConfig(await body(req)); return json(res, 200, config); }
    if (req.method === 'GET' && url.pathname === '/api/voice/tts') return json(res, 200, ttsStatus());
    if (req.method === 'POST' && url.pathname === '/api/voice/tts') {
      const result = await synthesizeSpeech(await body(req));
      res.writeHead(200, { 'content-type': result.contentType, 'content-length': result.audio.length, 'cache-control': 'no-store' });
      return res.end(result.audio);
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/transcribe') return json(res, 200, await transcribeAudio(await body(req)));
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'jarvis', assistant: 'JARVIS', mode: 'local', uptimeSeconds: uptimeSeconds(), at: new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/api/system/metrics') return json(res, 200, systemMetrics());
    if (req.method === 'GET' && url.pathname === '/api/browser/status') return json(res, 200, browserManager.getStatus());
    if (req.method === 'GET' && url.pathname === '/api/runs') return json(res, 200, { runs: state.runs || [] });
    if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) { const run = (state.runs || []).find((item) => item.id === url.pathname.split('/').pop()); return run ? json(res, 200, { run }) : json(res, 404, { error: 'Run not found' }); }
    if (req.method === 'POST' && url.pathname.match(/^\/api\/runs\/[^/]+\/(cancel|resume)$/)) { const id = url.pathname.split('/')[3]; const action = url.pathname.split('/')[4]; let run; await updateState((draft) => { run = (draft.runs || []).find((item) => item.id === id); if (run) { run.status = action === 'cancel' ? 'cancelled' : 'running'; run.events.push({ type: `run.${action}`, at: new Date().toISOString() }); } return draft; }); return run ? json(res, 200, { run }) : json(res, 404, { error: 'Run not found' }); }
    if (req.method === 'GET' && url.pathname === '/api/telemetry') return json(res, 200, { uptimeSeconds: uptimeSeconds(), usage: state.runtime?.usage || { requests: 0, tokens: 0, cost: 0 }, latency: state.runtime?.latency || {}, provider: publicProvider(state.provider), modelRouting: { mode: state.modelRouting?.modelMode || 'auto', jarvisMode: state.modelRouting?.jarvisMode || 'normal', manualModel: state.modelRouting?.manualModel || null, last: state.runtime?.lastModelRoute || null } });
    if (req.method === 'GET' && url.pathname === '/api/provider') return json(res, 200, { provider: publicProvider(state.provider) });
    if (req.method === 'GET' && url.pathname === '/api/model-routing') return json(res, 200, { settings: { jarvisMode: state.modelRouting?.jarvisMode || 'normal', modelMode: state.modelRouting?.modelMode || 'auto', manualModel: state.modelRouting?.manualModel || 'muse-spark-1.2', manualFallbackAllowed: state.modelRouting?.manualFallbackAllowed !== false }, models: modelRegistry(), providerPools: publicPools(), providerHealth: state.modelRouting?.providerHealth || {}, recentTelemetry: (state.modelRouting?.telemetry || []).slice(0, 25), debug: process.env.JARVIS_ROUTER_DEBUG === 'true' });
    if (req.method === 'PATCH' && url.pathname === '/api/model-routing') { const input = await body(req); const updated = await updateState((draft) => { draft.modelRouting ??= {}; if (['normal', 'coding', 'deepthinking'].includes(input.jarvisMode)) draft.modelRouting.jarvisMode = input.jarvisMode; if (['auto', 'manual'].includes(input.modelMode)) draft.modelRouting.modelMode = input.modelMode; if (modelRegistry()[input.manualModel]) draft.modelRouting.manualModel = input.manualModel; if (typeof input.manualFallbackAllowed === 'boolean') draft.modelRouting.manualFallbackAllowed = input.manualFallbackAllowed; return draft; }); return json(res, 200, { settings: updated.modelRouting }); }
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
        const models = Array.isArray(payload.data) ? payload.data.map((item) => { const pricing = item.pricing || item.price || null; const prompt = pricing?.prompt ?? pricing?.input ?? pricing?.input_token_cost; const completion = pricing?.completion ?? pricing?.output ?? pricing?.output_token_cost; return { id: item.id, name: item.name || item.id, pricing, free: Boolean(item.free || item.is_free || /(?:^|[-:])free$/i.test(item.id || '') || (pricing && Number(prompt || 0) === 0 && Number(completion || 0) === 0)) }; }).filter((item) => item.id) : [];
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
    if (req.method === 'GET' && url.pathname === '/api/connections') return json(res, 200, { connections: connectionStatus(state.provider) });
    if (req.method === 'GET' && url.pathname === '/api/diagnostics') return json(res, 200, diagnostics(state));
    if (req.method === 'GET' && url.pathname === '/api/integrations') return json(res, 200, { integrations: integrationStatus(state) });
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
    if (req.method === 'GET' && url.pathname === '/api/permissions') return json(res, 200, { mode: 'assisted', consequential: ['command.execute', 'browser.evaluate', 'messages.send', 'calendar.create', 'mcp.call', 'composio.execute'], default: 'deny' });
    if (req.method === 'GET' && url.pathname === '/api/adapters') return json(res, 200, adapterStatus());
    if (req.method === 'GET' && url.pathname === '/api/calendar/events') return json(res, 200, await calendarRequest('GET'));
    if (req.method === 'POST' && url.pathname === '/api/calendar/events') {
      const input = await body(req);
      const { approvalId, idempotencyKey, runId, ...payload } = input;
      const result = await invokeToolRequest(state, { toolId: 'calendar.create', input: { payload }, approvalId, idempotencyKey, runId });
      return json(res, result.status, result.status === 200 ? result.body.data : result.body);
    }
    if (req.method === 'POST' && url.pathname === '/api/messages/send') {
      const input = await body(req);
      const { approvalId, idempotencyKey, runId, ...toolInput } = input;
      const result = await invokeToolRequest(state, { toolId: 'messages.send', input: toolInput, approvalId, idempotencyKey, runId });
      return json(res, result.status, result.status === 200 ? result.body.data : result.body);
    }
    if (req.method === 'POST' && url.pathname === '/api/hardware/command') return json(res, 501, { code: 'HARDWARE_CAPABILITY_UNAVAILABLE', error: 'Hardware commands need a paired capability-scoped device provider.' });
    if (req.method === 'POST' && url.pathname === '/api/mcp') {
      const request = await body(req); const id = request.id ?? null;
      if (request.method === 'initialize') return json(res, 200, mcpResponse(id, { protocolVersion: '2025-03-26', serverInfo: { name: 'aegis-jarvis', version: '1.0.0' }, capabilities: { tools: {} } }));
      if (request.method === 'notifications/initialized') return json(res, 200, {});
      if (request.method === 'tools/list') return json(res, 200, mcpResponse(id, { tools: unattendedTools().map((tool) => ({ name: tool.id, description: tool.description, inputSchema: tool.inputSchema })) }));
      if (request.method === 'tools/call') { try { if (!unattendedTool(request.params?.name)) throw new Error('Tool requires the authenticated JARVIS runtime'); const result = await invokeToolRequest(state, { toolId: request.params.name, input: request.params?.arguments || {} }); if (result.status !== 200 || !result.body?.ok) throw new Error(result.body?.error || result.body?.code || 'Tool call failed'); return json(res, 200, mcpResponse(id, { content: [{ type: 'text', text: JSON.stringify(result.body.data) }], isError: false })); } catch (error) { return json(res, 200, mcpError(id, -32000, error.message)); } }
      return json(res, 200, mcpError(id, -32601, 'MCP method not found'));
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
    if (req.method === 'POST' && url.pathname === '/api/events') {
      const input = await body(req); const type = String(input.type || '').trim();
      if (!type) return json(res, 400, { error: 'type is required' });
      const runs = [];
      for (const workflow of state.workflows || []) if (workflow.state === 'active' && (workflow.trigger === `event:${type}` || workflow.trigger === type)) runs.push(await runWorkflow(state, workflow));
      await updateState((draft) => { recordActivity(draft, activityEntry('event.received', type, { runs: runs.length })); return draft; });
      return json(res, 202, { accepted: true, type, runs: runs.map((run) => run.id) });
    }
    if (req.method === 'GET' && url.pathname === '/api/capabilities') return json(res, 200, { assistant: 'JARVIS', capabilities: listCapabilities() });
    if (req.method === 'GET' && url.pathname === '/api/tools') return json(res, 200, { tools: listTools() });
    if (req.method === 'GET' && url.pathname === '/api/workflows') return json(res, 200, { workflows: state.workflows || [], summary: workflowSummary(state.workflows || []) });
    if (req.method === 'POST' && url.pathname === '/api/workflows') {
      const input = await body(req);
      if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 20) return json(res, 400, { error: 'Workflow needs 1 to 20 executable tool steps' });
      let steps;
      try {
        steps = input.steps.map((step, index) => {
          const tool = step && typeof step === 'object' ? getTool(step.tool) : null;
          if (!tool?.enabled) throw new Error(`Step ${index + 1} does not name an available tool`);
          validateToolInput(tool.inputSchema, step.arguments || {});
          return { id: String(step.id || index + 1), tool: tool.id, arguments: step.arguments || {}, dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String).slice(0, 20) : [], maxRetries: Math.max(0, Math.min(3, Number(step.maxRetries || 0))) };
        });
      } catch (error) { return json(res, 400, { error: error.message, code: error.code || 'WORKFLOW_INVALID' }); }
      const workflow = { id: `workflow-${crypto.randomUUID()}`, name: String(input.name || 'Untitled workflow').slice(0, 120), trigger: String(input.trigger || 'Manual'), runs: 0, state: 'active', steps, dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn.map(String).slice(0, 10) : [], schedule: input.schedule?.enabled ? { enabled: true, intervalSeconds: Math.max(10, Number(input.schedule.intervalSeconds || 3600)), maxRetries: Math.min(3, Number(input.schedule.maxRetries || 0)) } : { enabled: false }, lastRun: null };
      await updateState((draft) => { draft.workflows ??= []; draft.workflows.unshift(workflow); recordActivity(draft, activityEntry('workflow.created', workflow.name, { workflowId: workflow.id })); return draft; });
      return json(res, 201, { workflow });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/workflows/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req); let workflow;
      await updateState((draft) => { workflow = (draft.workflows || []).find((item) => item.id === id); if (workflow && ['active', 'paused', 'cancelled'].includes(input.state)) { workflow.state = input.state; recordActivity(draft, activityEntry('workflow.' + input.state, workflow.name, { workflowId: id })); } return draft; });
      return workflow ? json(res, 200, { workflow }) : json(res, 404, { error: 'Workflow not found' });
    }
    if (req.method === 'POST' && url.pathname.match(/^\/api\/workflows\/[^/]+\/run$/)) {
      const id = url.pathname.split('/')[3]; const workflow = (state.workflows || []).find((item) => item.id === id);
      const run = workflow ? await runWorkflow(state, workflow, await body(req)) : null;
      if (run) await updateState((draft) => draft);
      return run ? json(res, 200, { run }) : json(res, 404, { error: 'Workflow not found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/scheduler') return json(res, 200, { enabled: schedulerEnabled, intervalSeconds: schedulerInterval / 1000, lastTickAt: lastSchedulerTick });
    if (req.method === 'POST' && url.pathname === '/api/scheduler/tick') { const runs = await tick(state); await updateState((draft) => draft); return json(res, 200, { runs, tickedAt: new Date().toISOString() }); }
    if (req.method === 'POST' && url.pathname === '/api/tools/execute') {
      const result = await invokeToolRequest(state, await body(req));
      return json(res, result.status, result.body);
    }
    if (req.method === 'GET' && url.pathname === '/api/tasks') return json(res, 200, { tasks: state.tasks });
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const input = await body(req);
      const result = await invokeToolRequest(state, { toolId: 'tasks.manage', input: { title: String(input.title || '').trim(), ...(input.status ? { status: input.status } : {}) }, idempotencyKey: req.headers['idempotency-key'] || input.idempotencyKey });
      if (result.status !== 200) return json(res, result.status, result.body);
      const task = result.body.data.task;
      if (!result.body.replayed) await updateState((draft) => { recordActivity(draft, activityEntry('task.created', task.title, { taskId: task.id })); return draft; });
      return json(res, 201, { task });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/tasks/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req);
      if (!state.tasks.find((item) => item.id === id)) return json(res, 404, { error: 'Task not found' });
      const result = await invokeToolRequest(state, { toolId: 'tasks.manage', input: { id, ...(input.title !== undefined ? { title: input.title } : {}), ...(input.status !== undefined ? { status: input.status } : {}) }, idempotencyKey: req.headers['idempotency-key'] || input.idempotencyKey });
      if (result.status !== 200) return json(res, result.status, result.body);
      const updated = result.body.data.task;
      if (!result.body.replayed) await updateState((draft) => { recordActivity(draft, activityEntry('task.updated', updated.title, { taskId: id })); return draft; });
      return json(res, 200, { task: updated });
    }
    if (req.method === 'GET' && url.pathname === '/api/approvals') return json(res, 200, { approvals: state.approvals.filter((item) => item.status === 'pending') });
    if (req.method === 'POST' && url.pathname.startsWith('/api/approvals/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req); let approval;
      await updateState((draft) => {
        const current = draft.approvals.find((item) => item.id === id);
        if (!current || current.status !== 'pending' || Date.parse(current.expiresAt || 0) <= Date.now()) return draft;
        current.status = input.outcome === 'approved' ? 'approved' : 'rejected';
        approval = current;
        recordActivity(draft, activityEntry(`approval.${current.status}`, current.title, { approvalId: id }));
        if (current.status === 'rejected' && current.pendingRequest?.runId) {
          const run = draft.runs.find((item) => item.id === current.pendingRequest.runId);
          if (run && run.status === 'waiting_for_approval') {
            const step = run.steps.find((item) => item.status === 'waiting_for_approval');
            if (step) { step.status = 'cancelled'; step.completedAt = new Date().toISOString(); }
            transitionRun(run, 'cancelled');
          }
        }
        return draft;
      });
      if (!approval) return json(res, 404, { error: 'Approval is unavailable, expired, or already resolved' });
      if (approval.status !== 'approved' || !approval.pendingRequest) return json(res, 200, { approval });
      try {
        const result = await invokeToolRequest(await getState(), { ...approval.pendingRequest, approvalId: id });
        await updateState((draft) => {
          const run = draft.runs.find((item) => item.id === approval.pendingRequest.runId);
          if (run) {
            const step = run.steps.find((item) => item.status === 'waiting_for_approval');
            if (step) { step.status = result.status === 200 && result.body?.ok ? 'completed' : 'failed'; step.result = result.body; step.completedAt = new Date().toISOString(); }
            run.toolCalls.push({ id: `tool-call-${crypto.randomUUID()}`, tool: approval.pendingRequest.toolId, status: result.status === 200 && result.body?.ok ? 'completed' : 'failed', resultId: approval.pendingRequest.idempotencyKey });
            if (result.status === 200 && result.body?.ok) finishRun(run, { toolId: approval.pendingRequest.toolId, dispatch: result.body.data });
            else errorRun(run, new Error(result.body?.error || 'Approved desktop action failed'));
          }
          return draft;
        });
        return json(res, result.status, { approval, result: result.body });
      } catch (error) {
        await updateState((draft) => { const run = draft.runs.find((item) => item.id === approval.pendingRequest.runId); if (run) { const step = run.steps.find((item) => item.status === 'waiting_for_approval'); if (step) { step.status = 'failed'; step.error = error.message; step.completedAt = new Date().toISOString(); } errorRun(run, error); } return draft; });
        return json(res, 502, { approval, error: error.message, code: error.code || 'INPUT_FAILED' });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/activity') return json(res, 200, { activity: state.activity || [] });
    if (req.method === 'GET' && url.pathname === '/api/chats') return json(res, 200, { messages: state.conversations || [] });
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const input = await body(req); const text = String(input.message || '').trim();
      if (!text) return json(res, 400, { error: 'message is required' });
      const routeStarted = performance.now(); const route = routeRequest(text);
      if (route.route === 'TOOL_CALL' && route.confidence >= 0.9) {
        const run = await beginRun(state, { request: text, type: 'tool', conversationId: input.conversationId || null }); transitionRun(run, 'running');
        const toolStarted = performance.now(); let data; let reply;
        const invokeChatTool = async (toolId, args = {}) => {
          const step = run.steps[0];
          step.type = 'tool'; step.capability = toolId; step.status = 'running'; step.startedAt ||= new Date().toISOString();
          let response;
          try { response = await invokeToolRequest(state, { toolId, input: args, runId: run.id, idempotencyKey: `${run.id}:${toolId}`, resumeOnApproval: toolId === 'computer.keypress' || toolId === 'computer.type' }); }
          catch (error) { step.status = 'failed'; step.error = error.message; step.completedAt = new Date().toISOString(); throw error; }
          if (response.status === 202 && response.body?.approvalRequired) {
            step.status = 'waiting_for_approval';
            run.approvals.push(response.body.approval.id);
            transitionRun(run, 'waiting_for_approval');
            return response.body;
          }
          const succeeded = response.status === 200 && response.body?.ok === true;
          step.status = succeeded ? 'completed' : 'failed'; step.completedAt = new Date().toISOString();
          step.result = { ok: succeeded, code: response.body?.code || null };
          run.toolCalls.push({ id: `tool-call-${crypto.randomUUID()}`, tool: toolId, status: step.status, input: args, resultId: `${run.id}:${toolId}` });
          if (response.status !== 200) throw Object.assign(new Error(response.body?.error || response.body?.code || `${toolId} failed`), { code: response.body?.code || 'TOOL_UNAVAILABLE', httpStatus: response.status });
          return response.body;
        };
        try {
        if (route.capability === 'browser.open') { data = { action: 'open_url', url: route.args.url, label: route.args.label }; reply = `Opening ${route.args.label}.`; }
        else if (route.capability.startsWith('audio.')) {
          const response = { status: 200, body: await invokeChatTool(route.capability, route.args) };
          if (response.status !== 200 || !response.body.ok) {
            errorRun(run, Object.assign(new Error(response.body.error || 'Audio action failed'), { code: response.body.code || 'AUDIO_ACTION_FAILED' }));
            await updateState((draft) => draft);
            return json(res, response.status === 200 ? 502 : response.status, { reply: response.body.error || 'Audio action failed', runId: run.id, code: response.body.code || 'AUDIO_ACTION_FAILED' });
          }
          data = response.body.data;
          reply = route.capability === 'audio.get_volume' ? `System volume is ${data.volume} percent${data.muted ? ' and muted' : ''}.` : `System volume is now ${data.volume} percent${data.muted ? ' and muted' : ''}.`;
        }
        else if (route.capability.startsWith('media.') && route.capability !== 'media.generate') {
          const response = { status: 200, body: await invokeChatTool(route.capability, route.args) };
          data = response.body.data || response.body;
          if (response.status !== 200 || !response.body.ok || route.capability === 'media.status' && data.status !== 'available') {
            const message = data.status === 'ambiguous' ? `Multiple media players are available: ${data.players.map((item) => item.application).join(', ')}. Specify a player.` : data.status === 'unavailable' ? 'No MPRIS media player is available.' : 'The media action could not be verified.';
            errorRun(run, Object.assign(new Error(message), { code: 'MEDIA_ACTION_UNVERIFIED' }));
            await updateState((draft) => draft);
            return json(res, response.status === 200 ? 409 : response.status, { reply: message, runId: run.id, data, code: 'MEDIA_ACTION_UNVERIFIED' });
          }
          reply = route.capability === 'media.status' ? `${data.application} is ${data.state}${data.title ? `: ${data.title}` : ''}.` : `${data.player.application} is now ${data.player.state}${data.player.title ? `: ${data.player.title}` : ''}.`;
        }
        else if (route.capability === 'apps.open') {
          const result = await invokeChatTool('apps.open', route.args);
          data = result.data;
          reply = data.status === 'launched' ? `Requested ${data.app.name} from the desktop launcher. Window opening could not be verified.`
            : data.status === 'ambiguous' ? `I found multiple matches: ${data.candidates.map((app) => `${app.name} (${app.id})`).join(', ')}. Please specify one.`
              : `I could not find an installed application named ${route.args.name}.`;
        }
        else if (route.capability === 'computer.keypress' || route.capability === 'computer.type') {
          const result = await invokeChatTool(route.capability, route.args);
          if (result.approvalRequired) {
            await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
            return json(res, 202, { reply: 'Desktop input is waiting for your exact-action approval and desktop portal consent.', runId: run.id, approvalRequired: true, approval: result.approval });
          }
          data = result.data;
          reply = 'The desktop portal accepted the input. The focused application result has not been verified.';
        }
        else if (route.capability === 'tasks.list') { data = (await invokeChatTool('tasks.list')).data; reply = data.tasks.length ? `You have ${data.tasks.length} tasks.` : 'You have no tasks.'; }
        else if (route.capability === 'gmail.latest') {
          const tool = await invokeChatTool('gmail.latest', { limit: route.args.limit });
          const emails = (Array.isArray(tool.data?.messages) ? tool.data.messages : []).sort((a, b) => Date.parse(b.messageTimestamp || 0) - Date.parse(a.messageTimestamp || 0)).slice(0, route.args.limit);
          data = { emails };
          reply = emails.length ? `Your latest ${emails.length} inbox emails:\n${emails.map((email, index) => `${index + 1}. ${email.subject || '(no subject)'} — ${email.sender || 'Unknown sender'} (${email.messageTimestamp ? new Date(email.messageTimestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown time'})`).join('\n')}` : 'Your Gmail inbox has no matching emails.';
        }
        else if (route.capability === 'runtime.telemetry') { data = { provider: publicProvider(state.provider), usage: state.runtime?.usage || {}, uptimeSeconds: uptimeSeconds() }; reply = `Using ${data.provider.label} with model ${data.provider.model}.`; }
        else if (route.capability === 'models.list') { const result = await invokeChatTool('models.list'); data = result.data; const ready = Object.entries(data.providerPools).filter(([, providers]) => providers.some((provider) => provider.credentialConfigured)).map(([id]) => id); reply = ready.length ? `Configured model routes: ${ready.join(', ')}.` : 'No model provider credentials are configured for the logical model pools.'; }
        else if (route.capability === 'mcp.servers') { const result = await invokeChatTool('mcp.servers'); data = result.data; reply = data.servers.length ? `MCP servers: ${data.servers.map((server) => `${server.name} (${server.status})`).join(', ')}.` : 'No outbound MCP servers are configured.'; }
        else if (route.capability === 'projects.status') { const result = await invokeChatTool('projects.status'); data = result.data; const selected = route.args.name ? data.projects.filter((project) => project.name.toLowerCase() === route.args.name.toLowerCase() || project.name.toLowerCase().includes(route.args.name.toLowerCase())) : data.projects; reply = selected.length ? selected.map((project) => `${project.name}: ${project.status}${project.branch ? ` on ${project.branch}` : ''}${project.changedFiles === null ? '' : `, ${project.changedFiles} changed files`}`).join('\n') : `No connected project matches ${route.args.name}.`; }
        else if (route.capability === 'research.plan') { const result = await invokeChatTool('research.plan', route.args); data = result.data; reply = data.status === 'sources_collected' ? `Collected ${data.sources.length} attributable sources for ${data.topic}. Source verification and synthesis remain next steps.` : data.message; }
        else if (route.capability === 'diagnostics') { data = (await invokeChatTool('diagnostics')).data; reply = `JARVIS service is ${data.service}; persistence is ${data.persistence}.`; }
        else if (route.capability === 'memory.search') { const result = await invokeChatTool('memory.search', { query: route.args.q }); data = { memories: result.data.results }; reply = data.memories.length ? `I found ${data.memories.length} relevant memory records.` : 'I did not find relevant stored memory.'; }
        else if (route.capability === 'media.generate') { const media = (await invokeChatTool('media.generate', { kind: route.args.kind, prompt: route.args.prompt })).data; data = { media }; reply = media.status === 'completed' ? `Generated your ${media.kind} with ${media.model}.` : `Started ${media.kind} generation with ${media.model}. Job ${media.id} is processing.`; run.model = media.model; run.provider = 'gemini'; }
        else { const result = await invokeChatTool('files.read', route.args); data = result.data; reply = `README.md is ${data.bytes} bytes and is available in the project workspace.`; }
        } catch (error) {
          errorRun(run, error);
          await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
          return json(res, error.httpStatus || 502, { reply: error.message, runId: run.id, code: error.code || 'TOOL_ERROR' });
        }
        if (run.steps[0]?.status === 'queued') { run.steps[0].status = 'completed'; run.steps[0].startedAt = run.steps[0].startedAt || new Date().toISOString(); run.steps[0].completedAt = new Date().toISOString(); }
        finishRun(run, data, { total: 0 });
        await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); Object.assign(stored, run); if (data?.media?.kind === 'video') { draft.mediaJobs ??= []; draft.mediaJobs.unshift(data.media); draft.mediaJobs = draft.mediaJobs.slice(0, 100); } draft.runtime ??= { usage: {}, latency: {} }; draft.runtime.usage ??= { requests: 0, tokens: 0, cost: 0 }; draft.runtime.usage.requests += 1; draft.runtime.latency ??= { samples: 0 }; draft.runtime.latency.routerMs = routeStarted ? Math.round(performance.now() - routeStarted) : 0; draft.runtime.latency.toolMs = Math.round(performance.now() - toolStarted); draft.runtime.latency.totalMs = Math.round(performance.now() - routeStarted); draft.runtime.latency.samples = Number(draft.runtime.latency.samples || 0) + 1; draft.conversations ??= []; draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [text] }, { who: 'JARVIS', time: new Date().toISOString(), lines: [reply], media: data?.media || null }); draft.conversations = draft.conversations.slice(-100); return draft; });
        return json(res, 200, { reply, assistant: 'JARVIS', grounded: true, runId: run.id, route, action: data?.action ? data : null, media: data?.media || null });
      }
      const run = await beginRun(state, { request: text, type: 'chat', conversationId: input.conversationId || null });
      transitionRun(run, 'running');
      const taskIntent = /^(create|add|remember)\s+(a\s+)?task\b/i.test(text);
      let createdTask = null;
      if (taskIntent) {
        const title = text.replace(/^(create|add|remember)\s+(a\s+)?task\s*:?[\s-]*/i, '') || text;
        const result = await invokeToolRequest(state, { toolId: 'tasks.manage', input: { title }, runId: run.id });
        if (result.status !== 200) throw new Error(result.body?.error || 'Task creation failed');
        createdTask = result.body.data.task;
        if (run.steps[0]) { run.steps[0].capability = 'tasks.manage'; run.steps[0].status = 'completed'; run.steps[0].startedAt = run.startedAt; run.steps[0].completedAt = new Date().toISOString(); run.steps[0].result = { taskId: createdTask.id }; }
        run.toolCalls.push({ id: `tool-call-${crypto.randomUUID()}`, tool: 'tasks.manage', input: { title }, status: 'completed', resultId: createdTask.id });
        await updateState((draft) => { recordActivity(draft, activityEntry('task.created', createdTask.title, { taskId: createdTask.id, source: 'chat' })); return draft; });
      }
      let reply = createdTask ? `Task created: ${createdTask.title}` : '';
      let providerResult = null; let modelRoute = null; let modelFailure = null;
      if (!createdTask) {
        const modelStarted = performance.now();
        modelRoute = await selectLogicalModelWithClassifier(text, state.modelRouting || {}, { hasMedia: Boolean(input.attachments?.length) }, state);
        const assembledContext = assembleModelContext({ query: text, conversations: state.conversations || [], memories: state.memories || [], includeTools: modelRoute.requiresTools });
        try {
          providerResult = await executeModelDelegation({ route: modelRoute, request: text, context: assembledContext.context, continuationState: { runId: run.id, plan: run.plan, currentStep: run.currentStep, completedToolCalls: run.toolCalls.filter((call) => call.status === 'completed').map((call) => ({ id: call.id, tool: call.tool, resultId: call.resultId })) }, state, attachments: input.attachments || [], allowFallback: state.modelRouting?.manualFallbackAllowed !== false, execute: (options) => modelRoute.requiresTools && options.continuationState?.delegationStage === 0 ? executeModelToolLoop(options) : executeModelPool(options) });
          if (providerResult.executedToolCalls?.length) run.toolCalls.push(...providerResult.executedToolCalls);
          reply = providerResult.reply; run.provider = providerResult.provider; run.model = providerResult.logicalModel;
          run.routing = { ...modelRoute, ...providerResult.routingTelemetry, ...assembledContext.telemetry, routingConfidence: modelRoute.confidence, routingReason: modelRoute.reason, routerProviderAttempts: modelRoute.classifierTelemetry?.providerAttempts || [], routerMs: (modelRoute.classifierTelemetry?.providerAttempts || []).reduce((sum, attempt) => sum + Number(attempt.latencyMs || 0), 0), modelMs: Math.round(performance.now() - modelStarted), toolMs: 0, policyMs: 0, databaseMs: assembledContext.telemetry.memoryMs, totalMs: Math.round(performance.now() - routeStarted), inputTokens: providerResult.inputTokens || 0, outputTokens: providerResult.outputTokens || 0, toolCalls: run.toolCalls.length };
        } catch (error) {
          let terminalError = error;
          if (error.code === 'MODEL_CAPACITY_EXHAUSTED' && publicProvider(state.provider).configured) {
            try {
              const intendedModel = error.routingTelemetry?.selectedModel || modelRoute.primaryModel;
              const emergencyProvider = providerForLogicalModel(state.provider, intendedModel);
              const emergency = await completeConfiguredProvider(emergencyProvider, text, assembledContext.context);
              if (emergency) {
                providerResult = { ...emergency, logicalModel: emergency.model, inputTokens: 0, outputTokens: Number(emergency.tokens || 0) };
                reply = emergency.reply; run.provider = emergency.provider; run.model = emergency.model;
                run.routing = { ...modelRoute, ...(error.routingTelemetry || {}), ...assembledContext.telemetry, finalModel: emergency.model, modelFallbackUsed: true, fallbackFrom: error.routingTelemetry?.selectedModel || modelRoute.primaryModel, fallbackTo: emergency.model, activeProviderFallback: true, providerAttempts: [...(error.routingTelemetry?.providerAttempts || []), { providerId: emergency.provider, modelId: emergency.model, attempt: Number(error.routingTelemetry?.providerAttempts?.length || 0) + 1, startedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - modelStarted), success: true, statusCode: 200 }], routingConfidence: modelRoute.confidence, routingReason: `${modelRoute.reason} Logical pools were unavailable, so the explicitly configured active provider was used.`, routerMs: 0, modelMs: Math.round(performance.now() - modelStarted), toolMs: 0, policyMs: 0, databaseMs: assembledContext.telemetry.memoryMs, totalMs: Math.round(performance.now() - routeStarted), inputTokens: 0, outputTokens: Number(emergency.tokens || 0), toolCalls: run.toolCalls.length };
              }
            } catch (fallbackError) { terminalError = Object.assign(fallbackError, { code: error.code, routingTelemetry: error.routingTelemetry }); }
          }
          if (!providerResult) {
            modelFailure = terminalError;
            run.provider = null;
            run.model = null;
            run.routing = { ...modelRoute, ...(terminalError.routingTelemetry || {}), ...assembledContext.telemetry, routingConfidence: modelRoute?.confidence || 0, routingReason: modelRoute?.reason || '', failureReason: terminalError.message, routerMs: (modelRoute?.classifierTelemetry?.providerAttempts || []).reduce((sum, attempt) => sum + Number(attempt.latencyMs || 0), 0), modelMs: Math.round(performance.now() - modelStarted), toolMs: 0, policyMs: 0, databaseMs: assembledContext.telemetry.memoryMs, totalMs: Math.round(performance.now() - routeStarted), inputTokens: 0, outputTokens: 0, toolCalls: run.toolCalls.length };
            errorRun(run, terminalError); reply = modelFailureReply(terminalError, run.id);
          }
        }
      }
      await updateState((draft) => { draft.runtime ??= { startedAt: new Date().toISOString(), usage: { requests: 0, tokens: 0, cost: 0 } }; draft.runtime.usage ??= { requests: 0, tokens: 0, cost: 0 }; draft.runtime.usage.requests += 1; draft.runtime.usage.tokens += providerResult?.tokens || 0; draft.runtime.usage.cost += providerResult?.cost || 0; if (run.routing) { draft.modelRouting ??= { telemetry: [], providerHealth: {} }; draft.modelRouting.providerHealth = state.modelRouting?.providerHealth || {}; draft.modelRouting.telemetry = [{ requestId: run.id, runId: run.id, timestamp: new Date().toISOString(), ...run.routing, success: !modelFailure }, ...(draft.modelRouting.telemetry || [])].slice(0, 200); draft.runtime.lastModelRoute = run.routing; draft.runtime.latency ??= {}; Object.assign(draft.runtime.latency, { routerMs: run.routing.routerMs || 0, modelMs: run.routing.modelMs || 0, toolMs: run.routing.toolMs || 0, policyMs: run.routing.policyMs || 0, databaseMs: run.routing.databaseMs || 0, totalMs: run.routing.totalMs || 0, samples: Number(draft.runtime.latency.samples || 0) + 1 }); } draft.conversations ??= []; const modelIndicator = run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null; const routingDebug = process.env.JARVIS_ROUTER_DEBUG === 'true' && run.routing ? { taskType: run.routing.taskType, confidence: run.routing.routingConfidence, apiRotationCount: run.routing.apiRotationCount, modelFallbackUsed: run.routing.modelFallbackUsed, totalMs: run.routing.totalMs } : null; draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [text] }, { who: 'JARVIS', time: new Date().toISOString(), lines: [reply], modelIndicator, routingDebug }); draft.conversations = draft.conversations.slice(-100); return draft; });
      if (!modelFailure) {
        if (run.plan.intent === 'direct' && run.steps[0]?.status === 'queued') { run.steps[0].status = 'completed'; run.steps[0].startedAt = run.startedAt; run.steps[0].completedAt = new Date().toISOString(); }
        finishRun(run, { reply, task: createdTask }, providerResult ? { input: providerResult.inputTokens, output: providerResult.outputTokens, total: providerResult.tokens } : { total: 0 });
      }
      await updateState((draft) => { const stored = draft.runs?.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
      return json(res, modelFailure ? (modelFailure.code === 'REQUEST_ERROR' ? 400 : 503) : 200, { reply, task: createdTask, assistant: 'JARVIS', grounded: true, runId: run.id, intent: run.plan.intent, plan: run.plan, model: run.model, modelIndicator: run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null, routing: process.env.JARVIS_ROUTER_DEBUG === 'true' ? run.routing : undefined });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { console.error(error); return json(res, error.code === 'PAYLOAD_TOO_LARGE' ? 413 : error.code === 'INVALID_JSON' || error.code === 'TOOL_INPUT_INVALID' ? 400 : error.code === 'HUMAN_ACTION_REQUIRED' ? 409 : error.code?.startsWith('BROWSER_') || error.code === 'NAVIGATION_FAILED' ? 502 : 500, { error: 'JARVIS service error', code: error.code || 'SERVICE_ERROR', detail: error.message }); }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') { console.error(`JARVIS could not start because port ${port} is already in use. If /api/health responds, JARVIS is already running.`); process.exitCode = 1; return; }
  console.error(`JARVIS server error: ${error.message}`); process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`JARVIS service listening on http://127.0.0.1:${port}`));

async function shutdownBrowser() {
  server.close();
  await browserManager.close().catch((error) => console.warn(`[browser] shutdown: ${error.message}`));
  process.exit(0);
}
process.once('SIGINT', shutdownBrowser);
process.once('SIGTERM', shutdownBrowser);

const schedulerTimer = setInterval(async () => {
  if (!schedulerEnabled) return;
  try { const state = await getState(); await tick(state); lastSchedulerTick = new Date().toISOString(); await updateState((draft) => draft); } catch (error) { console.warn(`Scheduler tick failed: ${error.message}`); }
}, schedulerInterval);
schedulerTimer.unref();

function publicProvider(provider = {}) {
  const credentialKeys = { openrouter: 'OPENROUTER_API_KEY', 'opencode-zen': 'OPENCODE_ZEN_API_KEY', '9router': 'NINEROUTER_API_KEY', custom: 'CUSTOM_API_KEY', groq: 'GROQ_API_KEY' };
  const credentialReady = provider.id === 'local' ? provider.configured === true : Boolean(process.env[credentialKeys[provider.id]]);
  return { id: provider.id || 'local', label: provider.label || 'Local model', model: provider.model || 'Not configured', baseUrl: provider.baseUrl || '', configured: provider.configured === true && credentialReady };
}

function connectionStatus(provider = {}) {
  const env = (name) => Boolean(process.env[name]);
  return [
    { id: 'local', name: 'Local model', kind: 'runtime', status: provider.id === 'local' ? (provider.configured ? 'configured' : 'available') : 'available', detail: provider.baseUrl || '127.0.0.1:11434' },
    { id: 'openrouter', name: 'OpenRouter', kind: 'provider', status: env('OPENROUTER_API_KEY') ? 'configured' : 'needs key', detail: 'openrouter.ai/api/v1' },
    { id: 'groq', name: 'Groq', kind: 'provider', status: env('GROQ_API_KEY') ? 'configured' : 'needs key', detail: 'api.groq.com/openai/v1' },
    { id: 'opencode-zen', name: 'OpenCode Zen', kind: 'provider', status: env('OPENCODE_ZEN_API_KEY') ? 'configured' : 'needs key', detail: 'provider adapter ready' },
    { id: '9router', name: '9router', kind: 'provider', status: env('NINEROUTER_API_KEY') ? 'configured' : 'needs key', detail: 'provider adapter ready' },
    { id: 'custom', name: 'Custom OpenAI-compatible API', kind: 'provider', status: provider.id === 'custom' && provider.baseUrl ? 'configured' : 'not configured', detail: provider.baseUrl || 'Set a base URL' },
  ];
}

function authorized(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers.cookie?.match(/(?:^|;\s*)jarvis_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const expected = process.env.JARVIS_AUTH_TOKEN || '';
  if (validSession(token)) return true;
  return Boolean(token && token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)));
}
