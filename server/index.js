import http from 'node:http';
import { getState, updateState, activityEntry } from './store.js';
import { listCapabilities, listTools } from './registry.js';
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
import { calendarRequest, createSession, hardwareCommand, messageActionHash, validSession } from './liveAdapters.js';
import { beginRun, errorRun, finishRun } from './orchestrator.js';
import { routeRequest } from './router.js';
import { publicConfig, saveConfig } from './config.js';
import { synthesizeSpeech, transcribeAudio, ttsStatus } from './tts.js';
import { findToolReplay, rememberToolResult } from './idempotency.js';
import { downloadVideoJob, generateMedia, readGeneratedMedia, refreshVideoJob } from './mediaGeneration.js';
import { composioActionHash, composioStatus, composioToolRisk, createComposioConnectLink, executeComposioTool, listComposioAccounts, listComposioTools, validateComposioProjectKey } from './composioAdapter.js';
import { complete as completeConfiguredProvider, providerForLogicalModel } from './providerClient.js';
import { systemMetrics } from './systemMetrics.js';
import { browserManager } from './browser/index.js';
import { listProjectStatus } from './projectIntelligence.js';
import { discoverMcpServers } from './mcpDiscovery.js';
import { deviceStatus, ingestDeviceEvent, pairDevice, revokeDevice } from './deviceBridge.js';
import { planGroundedResearch } from './researchWorkflow.js';
import { mcpActionHash } from './mcpDiscovery.js';

const port = Number(process.env.JARVIS_PORT || 8787);
const processStartedAt = Date.now();
const uptimeSeconds = () => Math.floor((Date.now() - processStartedAt) / 1000);
const schedulerEnabled = process.env.JARVIS_SCHEDULER !== '0';
const schedulerInterval = Math.max(10_000, Number(process.env.JARVIS_SCHEDULER_INTERVAL_MS || 30_000));
let lastSchedulerTick = null;
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};

async function body(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
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
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/auth/login') { const input = await body(req); if (process.env.JARVIS_AUTH_TOKEN && input.token !== process.env.JARVIS_AUTH_TOKEN) return json(res, 401, { error: 'Invalid credentials' }); return json(res, 200, createSession(input.user || 'local-operator')); }
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
    if (req.method === 'GET' && url.pathname.startsWith('/api/generated/')) { const fileName = url.pathname.split('/').pop(); const media = await readGeneratedMedia(fileName); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600', 'access-control-allow-origin': '*' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.match(/^\/api\/media\/jobs\/[^/]+\/download$/)) { const id = url.pathname.split('/')[4]; const job = (state.mediaJobs || []).find((item) => item.id === id); if (!job) return json(res, 404, { error: 'Media job not found' }); const media = await downloadVideoJob(job); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600', 'access-control-allow-origin': '*' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.startsWith('/api/media/jobs/')) { const id = url.pathname.split('/').pop(); const existing = (state.mediaJobs || []).find((job) => job.id === id); if (!existing) return json(res, 404, { error: 'Media job not found' }); const job = await refreshVideoJob(existing); await updateState((draft) => { const index = (draft.mediaJobs || []).findIndex((item) => item.id === id); if (index >= 0) draft.mediaJobs[index] = job; return draft; }); return json(res, 200, { job: { ...job, operationName: undefined, credentialSlot: undefined, downloadUri: job.downloadUri ? `/api/media/jobs/${job.id}/download` : null } }); }
    if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, publicConfig());
    if (req.method === 'PATCH' && url.pathname === '/api/config') { const config = saveConfig(await body(req)); return json(res, 200, config); }
    if (req.method === 'GET' && url.pathname === '/api/voice/tts') return json(res, 200, ttsStatus());
    if (req.method === 'POST' && url.pathname === '/api/voice/tts') {
      const result = await synthesizeSpeech(await body(req));
      res.writeHead(200, { 'content-type': result.contentType, 'content-length': result.audio.length, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
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
      if (!composioStatus().configured) return json(res, 503, { error: 'COMPOSIO_API_KEY is not configured' });
      const input = await body(req); const toolSlug = String(input.toolSlug || '').toUpperCase(); const riskLevel = composioToolRisk(toolSlug); const toolId = `composio:${toolSlug}`; const replayInput = { arguments: input.arguments || {}, connectedAccountId: input.connectedAccountId || null, userId: input.userId || null };
      const replay = findToolReplay(state, input.idempotencyKey, toolId, replayInput);
      if (replay) return json(res, 200, { ...replay.result, replayed: true, idempotencyKey: replay.idempotencyKey });
      if (riskLevel !== 'READ_ONLY') {
        const actionHash = composioActionHash(input); const approval = input.approvalId ? (state.approvals || []).find((item) => item.id === input.approvalId) : null;
        if (!approval) {
          const pending = { id: `approval-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, icon: 'shield', risk: 'high', title: `Approve ${toolSlug}`, sub: 'External action through Composio', status: 'pending', toolName: 'composio.execute', actionHash, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), consumedAt: null };
          await updateState((draft) => { draft.approvals ??= []; draft.approvals.unshift(pending); recordActivity(draft, activityEntry('approval.requested', pending.title, { approvalId: pending.id, toolSlug })); return draft; });
          return json(res, 202, { approvalRequired: true, approval: pending });
        }
        if (approval.status !== 'approved' || approval.toolName !== 'composio.execute' || approval.actionHash !== actionHash || approval.consumedAt || Date.parse(approval.expiresAt || 0) <= Date.now()) return json(res, 403, { error: 'A current approval bound to this exact Composio action is required' });
      }
      const result = await executeComposioTool(input);
      if (!result.successful) return json(res, 502, result);
      await updateState((draft) => { if (input.approvalId) { const approval = (draft.approvals || []).find((item) => item.id === input.approvalId); if (approval) { approval.status = 'consumed'; approval.consumedAt = new Date().toISOString(); } } rememberToolResult(draft, { idempotencyKey: input.idempotencyKey, runId: input.runId, toolId, input: replayInput, result }); recordActivity(draft, activityEntry('composio.tool.executed', toolSlug, { toolSlug, logId: result.logId, runId: input.runId || null })); return draft; });
      return json(res, 200, { ...result, riskLevel });
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
    if (req.method === 'GET' && url.pathname === '/api/permissions') return json(res, 200, { mode: 'assisted', consequential: ['command.execute', 'messages.send', 'calendar.write', 'files.delete'], default: 'deny' });
    if (req.method === 'GET' && url.pathname === '/api/adapters') return json(res, 200, adapterStatus());
    if (req.method === 'GET' && url.pathname === '/api/calendar/events') return json(res, 200, await calendarRequest('GET'));
    if (req.method === 'POST' && url.pathname === '/api/calendar/events') return json(res, 200, await calendarRequest('POST', await body(req)));
    if (req.method === 'POST' && url.pathname === '/api/messages/send') {
      const input = await body(req);
      if (!process.env.MESSAGING_API_URL && !process.env.SLACK_WEBHOOK_URL && !process.env.SLACK_BOT_TOKEN) return json(res, 503, { configured: false, error: 'No messaging provider is configured' });
      if (!String(input.text || input.message || '').trim()) return json(res, 400, { error: 'Message text is required' });
      const approval = input.approvalId ? state.approvals.find((item) => item.id === input.approvalId) : null;
      if (!approval) {
        const pending = { id: `approval-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, icon: 'shield', risk: 'high', title: 'Approve message send', sub: 'External communication', status: 'pending', toolName: 'messages.send', actionHash: messageActionHash(input), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), consumedAt: null };
        await updateState((draft) => { draft.approvals ??= []; draft.approvals.unshift(pending); recordActivity(draft, activityEntry('approval.requested', pending.title, { approvalId: pending.id })); return draft; });
        return json(res, 202, { approvalRequired: true, approval: pending });
      }
      const approvalForExecution = { ...approval };
      let claimed = false;
      await updateState((draft) => { const current = (draft.approvals || []).find((item) => item.id === approval.id); if (current?.status === 'approved' && current.toolName === 'messages.send' && !current.consumedAt && Date.parse(current.expiresAt || 0) > Date.now() && current.actionHash === messageActionHash(input)) { current.status = 'consumed'; current.consumedAt = new Date().toISOString(); claimed = true; } return draft; });
      if (!claimed) return json(res, 403, { error: 'A current approval bound to this exact message is required' });
      const result = (await executeTool('messages.send', input, { approval: approvalForExecution })).data;
      return json(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/hardware/command') return json(res, 200, await hardwareCommand(await body(req)));
    if (req.method === 'POST' && url.pathname === '/api/mcp') {
      const request = await body(req); const id = request.id ?? null;
      if (request.method === 'initialize') return json(res, 200, mcpResponse(id, { protocolVersion: '2025-03-26', serverInfo: { name: 'aegis-jarvis', version: '1.0.0' }, capabilities: { tools: {} } }));
      if (request.method === 'notifications/initialized') return json(res, 200, {});
      if (request.method === 'tools/list') return json(res, 200, mcpResponse(id, { tools: listTools().map((tool) => ({ name: tool.id, description: tool.name, inputSchema: { type: 'object' } })) }));
      if (request.method === 'tools/call') { try { const result = await executeTool(request.params?.name, request.params?.arguments || {}); return json(res, 200, mcpResponse(id, { content: [{ type: 'text', text: JSON.stringify(result.data) }], isError: false })); } catch (error) { return json(res, 200, mcpError(id, -32000, error.message)); } }
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
      await updateState(async (draft) => { for (const workflow of draft.workflows || []) if (workflow.state === 'active' && (workflow.trigger === `event:${type}` || workflow.trigger === type)) runs.push(await runWorkflow(draft, workflow)); recordActivity(draft, activityEntry('event.received', type, { runs: runs.length })); return draft; });
      return json(res, 202, { accepted: true, type, runs: runs.map((run) => run.id) });
    }
    if (req.method === 'GET' && url.pathname === '/api/capabilities') return json(res, 200, { assistant: 'JARVIS', capabilities: listCapabilities() });
    if (req.method === 'GET' && url.pathname === '/api/tools') return json(res, 200, { tools: listTools() });
    if (req.method === 'GET' && url.pathname === '/api/workflows') return json(res, 200, { workflows: state.workflows || [], summary: workflowSummary(state.workflows || []) });
    if (req.method === 'POST' && url.pathname === '/api/workflows') {
      const input = await body(req); const workflow = { id: `workflow-${Date.now()}`, name: String(input.name || 'Untitled workflow'), trigger: String(input.trigger || 'Manual'), runs: 0, state: 'active', steps: Array.isArray(input.steps) && input.steps.length ? input.steps.map(String).slice(0, 20) : ['Prepare', 'Execute', 'Verify'], dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn.map(String).slice(0, 10) : [], schedule: input.schedule?.enabled ? { enabled: true, intervalSeconds: Math.max(10, Number(input.schedule.intervalSeconds || 3600)), maxRetries: Math.min(3, Number(input.schedule.maxRetries || 0)) } : { enabled: false }, lastRun: null };
      await updateState((draft) => { draft.workflows ??= []; draft.workflows.unshift(workflow); recordActivity(draft, activityEntry('workflow.created', workflow.name, { workflowId: workflow.id })); return draft; });
      return json(res, 201, { workflow });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/workflows/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req); let workflow;
      await updateState((draft) => { workflow = (draft.workflows || []).find((item) => item.id === id); if (workflow && ['active', 'paused', 'cancelled'].includes(input.state)) { workflow.state = input.state; recordActivity(draft, activityEntry('workflow.' + input.state, workflow.name, { workflowId: id })); } return draft; });
      return workflow ? json(res, 200, { workflow }) : json(res, 404, { error: 'Workflow not found' });
    }
    if (req.method === 'POST' && url.pathname.match(/^\/api\/workflows\/[^/]+\/run$/)) {
      const id = url.pathname.split('/')[3]; let run;
      await updateState(async (draft) => { const workflow = (draft.workflows || []).find((item) => item.id === id); if (!workflow) return draft; run = await runWorkflow(draft, workflow, await body(req)); return draft; });
      return run ? json(res, 200, { run }) : json(res, 404, { error: 'Workflow not found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/scheduler') return json(res, 200, { enabled: schedulerEnabled, intervalSeconds: schedulerInterval / 1000, lastTickAt: lastSchedulerTick });
    if (req.method === 'POST' && url.pathname === '/api/scheduler/tick') return json(res, 200, { runs: await tick(state), tickedAt: new Date().toISOString() });
    if (req.method === 'POST' && url.pathname === '/api/tools/execute') {
      const input = await body(req); const toolId = String(input.toolId || '');
      const toolInput = input.input || {};
      const replay = findToolReplay(state, input.idempotencyKey, toolId, toolInput);
      if (replay) return json(res, 200, { ...replay.result, replayed: true, idempotencyKey: replay.idempotencyKey });
      if (toolId === 'messages.send' && !process.env.MESSAGING_API_URL && !process.env.SLACK_WEBHOOK_URL && !process.env.SLACK_BOT_TOKEN) return json(res, 503, { configured: false, error: 'No messaging provider is configured' });
      const approval = input.approvalId ? state.approvals.find((item) => item.id === input.approvalId) : null;
      const exactAction = toolId === 'mcp.call' || toolId === 'messages.send';
      const exactHash = toolId === 'mcp.call' ? mcpActionHash(toolInput) : toolId === 'messages.send' ? messageActionHash(toolInput) : null;
      if (exactAction && !approval) {
        if (toolId === 'mcp.call' && (!toolInput.server || !toolInput.tool || typeof toolInput.arguments !== 'object' && toolInput.arguments !== undefined)) return json(res, 400, { error: 'server, tool and object arguments are required' });
        if (toolId === 'messages.send' && !String(toolInput.text || toolInput.message || '').trim()) return json(res, 400, { error: 'Message text is required' });
        const pending = { id: `approval-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, icon: 'shield', risk: 'high', title: toolId === 'mcp.call' ? `Approve MCP ${toolInput.server}/${toolInput.tool}` : 'Approve message send', sub: toolId === 'mcp.call' ? 'External MCP action' : 'External communication', status: 'pending', toolName: toolId, actionHash: exactHash, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), consumedAt: null };
        await updateState((draft) => { draft.approvals ??= []; draft.approvals.unshift(pending); recordActivity(draft, activityEntry('approval.requested', pending.title, { approvalId: pending.id })); return draft; });
        return json(res, 202, { approvalRequired: true, approval: pending });
      }
      const approvalForExecution = approval ? { ...approval } : null;
      if (exactAction && approval) {
        let claimed = false;
        await updateState((draft) => { const current = (draft.approvals || []).find((item) => item.id === approval.id); if (current?.status === 'approved' && current.toolName === toolId && !current.consumedAt && Date.parse(current.expiresAt || 0) > Date.now() && current.actionHash === exactHash) { current.status = 'consumed'; current.consumedAt = new Date().toISOString(); claimed = true; } return draft; });
        if (!claimed) return json(res, 403, { error: 'A current approval bound to this exact action is required' });
      }
      const result = await executeTool(toolId, toolInput, { approval: approvalForExecution });
      await updateState((draft) => { rememberToolResult(draft, { idempotencyKey: input.idempotencyKey, runId: input.runId, toolId, input: toolInput, result }); recordActivity(draft, activityEntry('tool.executed', toolId, { toolId, runId: input.runId || null })); return draft; });
      return json(res, 200, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/tasks') return json(res, 200, { tasks: state.tasks });
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const input = await body(req);
      const task = { id: `task-${Date.now()}`, title: String(input.title || 'Untitled task').trim(), sub: String(input.sub || 'Created by JARVIS'), icon: input.icon || 'cyan', svg: input.svg || 'notes', pct: 0, status: 'pending', createdAt: new Date().toISOString() };
      await updateState((draft) => { draft.tasks.unshift(task); recordActivity(draft, activityEntry('task.created', task.title, { taskId: task.id })); return draft; });
      return json(res, 201, { task });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/tasks/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req);
      let updated;
      await updateState((draft) => { const task = draft.tasks.find((item) => item.id === id); if (!task) return draft; Object.assign(task, input); updated = task; recordActivity(draft, activityEntry('task.updated', task.title, { taskId: id })); return draft; });
      return updated ? json(res, 200, { task: updated }) : json(res, 404, { error: 'Task not found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/approvals') return json(res, 200, { approvals: state.approvals.filter((item) => item.status === 'pending') });
    if (req.method === 'POST' && url.pathname.startsWith('/api/approvals/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req); let approval;
      await updateState((draft) => { approval = draft.approvals.find((item) => item.id === id); if (approval) { approval.status = input.outcome === 'approved' ? 'approved' : 'rejected'; recordActivity(draft, activityEntry(`approval.${approval.status}`, approval.title, { approvalId: id })); } return draft; });
      return approval ? json(res, 200, { approval }) : json(res, 404, { error: 'Approval not found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/activity') return json(res, 200, { activity: state.activity || [] });
    if (req.method === 'GET' && url.pathname === '/api/chats') return json(res, 200, { messages: state.conversations || [] });
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const input = await body(req); const text = String(input.message || '').trim();
      if (!text) return json(res, 400, { error: 'message is required' });
      const routeStarted = performance.now(); const route = routeRequest(text);
      if (route.route === 'TOOL_CALL' && route.confidence >= 0.9) {
        const run = await beginRun(state, { request: text, type: 'tool', conversationId: input.conversationId || null }); run.status = 'running';
        const toolStarted = performance.now(); let data; let reply;
        if (route.capability === 'browser.open') { data = { action: 'open_url', url: route.args.url, label: route.args.label }; reply = `Opening ${route.args.label}.`; }
        else if (route.capability === 'apps.open') {
          const result = await executeTool('apps.open', route.args);
          data = result.data;
          reply = data.status === 'launched' ? `Requested ${data.app.name} from the desktop launcher. Window opening could not be verified.`
            : data.status === 'ambiguous' ? `I found multiple matches: ${data.candidates.map((app) => `${app.name} (${app.id})`).join(', ')}. Please specify one.`
              : `I could not find an installed application named ${route.args.name}.`;
        }
        else if (route.capability === 'tasks.list') { data = { tasks: state.tasks }; reply = state.tasks.length ? `You have ${state.tasks.length} tasks.` : 'You have no tasks.'; }
        else if (route.capability === 'gmail.latest') {
          const tool = await executeTool('composio.execute', { toolSlug: 'GMAIL_FETCH_EMAILS', arguments: { user_id: 'me', max_results: route.args.limit, verbose: false, include_payload: false, label_ids: ['INBOX'] } });
          const emails = (Array.isArray(tool.data?.messages) ? tool.data.messages : []).sort((a, b) => Date.parse(b.messageTimestamp || 0) - Date.parse(a.messageTimestamp || 0)).slice(0, route.args.limit);
          data = { emails };
          reply = emails.length ? `Your latest ${emails.length} inbox emails:\n${emails.map((email, index) => `${index + 1}. ${email.subject || '(no subject)'} — ${email.sender || 'Unknown sender'} (${email.messageTimestamp ? new Date(email.messageTimestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown time'})`).join('\n')}` : 'Your Gmail inbox has no matching emails.';
        }
        else if (route.capability === 'runtime.telemetry') { data = { provider: publicProvider(state.provider), usage: state.runtime?.usage || {}, uptimeSeconds: uptimeSeconds() }; reply = `Using ${data.provider.label} with model ${data.provider.model}.`; }
        else if (route.capability === 'models.list') { const result = await executeTool('models.list'); data = result.data; const ready = Object.entries(data.providerPools).filter(([, providers]) => providers.some((provider) => provider.credentialConfigured)).map(([id]) => id); reply = ready.length ? `Configured model routes: ${ready.join(', ')}.` : 'No model provider credentials are configured for the logical model pools.'; }
        else if (route.capability === 'mcp.servers') { const result = await executeTool('mcp.servers'); data = result.data; reply = data.servers.length ? `MCP servers: ${data.servers.map((server) => `${server.name} (${server.status})`).join(', ')}.` : 'No outbound MCP servers are configured.'; }
        else if (route.capability === 'projects.status') { const result = await executeTool('projects.status'); data = result.data; const selected = route.args.name ? data.projects.filter((project) => project.name.toLowerCase() === route.args.name.toLowerCase() || project.name.toLowerCase().includes(route.args.name.toLowerCase())) : data.projects; reply = selected.length ? selected.map((project) => `${project.name}: ${project.status}${project.branch ? ` on ${project.branch}` : ''}${project.changedFiles === null ? '' : `, ${project.changedFiles} changed files`}`).join('\n') : `No connected project matches ${route.args.name}.`; }
        else if (route.capability === 'research.plan') { const result = await executeTool('research.plan', route.args); data = result.data; reply = data.status === 'sources_collected' ? `Collected ${data.sources.length} attributable sources for ${data.topic}. Source verification and synthesis remain next steps.` : data.message; }
        else if (route.capability === 'diagnostics') { data = diagnostics(state); reply = `JARVIS service is ${data.service}; persistence is ${data.persistence}.`; }
        else if (route.capability === 'memory.search') { data = { memories: searchMemory(state.memories || [], route.args.q) }; reply = data.memories.length ? `I found ${data.memories.length} relevant memory records.` : 'I did not find relevant stored memory.'; }
        else if (route.capability === 'media.generate') { const media = await generateMedia(route.args.kind, route.args.prompt); data = { media }; reply = media.status === 'completed' ? `Generated your ${media.kind} with ${media.model}.` : `Started ${media.kind} generation with ${media.model}. Job ${media.id} is processing.`; run.model = media.model; run.provider = 'gemini'; }
        else { const result = await executeTool('files.read', route.args); data = result.data; reply = `README.md is ${data.bytes} bytes and is available in the project workspace.`; }
        finishRun(run, data, { total: 0 });
        await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); Object.assign(stored, run); if (data?.media?.kind === 'video') { draft.mediaJobs ??= []; draft.mediaJobs.unshift(data.media); draft.mediaJobs = draft.mediaJobs.slice(0, 100); } draft.runtime ??= { usage: {}, latency: {} }; draft.runtime.usage ??= { requests: 0, tokens: 0, cost: 0 }; draft.runtime.usage.requests += 1; draft.runtime.latency ??= { samples: 0 }; draft.runtime.latency.routerMs = routeStarted ? Math.round(performance.now() - routeStarted) : 0; draft.runtime.latency.toolMs = Math.round(performance.now() - toolStarted); draft.runtime.latency.totalMs = Math.round(performance.now() - routeStarted); draft.runtime.latency.samples = Number(draft.runtime.latency.samples || 0) + 1; draft.conversations ??= []; draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [text] }, { who: 'JARVIS', time: new Date().toISOString(), lines: [reply], media: data?.media || null }); draft.conversations = draft.conversations.slice(-100); return draft; });
        return json(res, 200, { reply, assistant: 'JARVIS', grounded: true, runId: run.id, route, action: data?.action ? data : null, media: data?.media || null });
      }
      const run = await beginRun(state, { request: text, type: 'chat', conversationId: input.conversationId || null });
      run.status = 'running';
      const taskIntent = /^(create|add|remember)\s+(a\s+)?task\b/i.test(text);
      let createdTask = null;
      if (taskIntent) {
        await updateState((draft) => { createdTask = { id: `task-${Date.now()}`, title: text.replace(/^(create|add|remember)\s+(a\s+)?task\s*:?[\s-]*/i, '') || text, sub: 'Created from JARVIS chat', icon: 'cyan', svg: 'notes', pct: 0, status: 'pending', createdAt: new Date().toISOString() }; draft.tasks.unshift(createdTask); recordActivity(draft, activityEntry('task.created', createdTask.title, { taskId: createdTask.id, source: 'chat' })); return draft; });
      }
      let reply = createdTask ? `Task created: ${createdTask.title}` : '';
      let providerResult = null; let modelRoute = null; let modelFailure = null;
      if (!createdTask) {
        const modelStarted = performance.now();
        modelRoute = await selectLogicalModelWithClassifier(text, state.modelRouting || {}, { hasMedia: Boolean(input.attachments?.length) }, state);
        const assembledContext = assembleModelContext({ query: text, conversations: state.conversations || [], memories: state.memories || [], includeTools: modelRoute.requiresTools });
        try {
          providerResult = await executeModelDelegation({ route: modelRoute, request: text, context: assembledContext.context, continuationState: { runId: run.id, plan: run.plan, currentStep: run.currentStep, completedToolCalls: run.toolCalls.filter((call) => call.status === 'completed').map((call) => ({ id: call.id, tool: call.tool, resultId: call.resultId })) }, state, attachments: input.attachments || [], allowFallback: state.modelRouting?.manualFallbackAllowed !== false });
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
      if (!modelFailure) finishRun(run, { reply, task: createdTask }, providerResult ? { input: providerResult.inputTokens, output: providerResult.outputTokens, total: providerResult.tokens } : { total: 0 });
      await updateState((draft) => { const stored = draft.runs?.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
      return json(res, modelFailure ? (modelFailure.code === 'REQUEST_ERROR' ? 400 : 503) : 200, { reply, task: createdTask, assistant: 'JARVIS', grounded: true, runId: run.id, intent: run.plan.intent, plan: run.plan, model: run.model, modelIndicator: run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null, routing: process.env.JARVIS_ROUTER_DEBUG === 'true' ? run.routing : undefined });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { console.error(error); return json(res, error.code === 'HUMAN_ACTION_REQUIRED' ? 409 : error.code?.startsWith('BROWSER_') || error.code === 'NAVIGATION_FAILED' ? 502 : 500, { error: 'JARVIS service error', code: error.code || 'SERVICE_ERROR', detail: error.message }); }
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
  try { await updateState(async (draft) => { await tick(draft); lastSchedulerTick = new Date().toISOString(); return draft; }); } catch (error) { console.warn(`Scheduler tick failed: ${error.message}`); }
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
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const expected = process.env.JARVIS_AUTH_TOKEN || '';
  if (validSession(token)) return true;
  return Boolean(token && token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)));
}
