import http from 'node:http';

import { startHUDManager, toggleHUD } from './hudManager.js';

import { createGoal, spawnAgent, updateAgentMemory, completeAgentTask } from './agentManager.js';


import { getState, updateState, activityEntry } from './store.js';
import { getTool, listCapabilities, listTools } from './registry.js';
import { validateToolInput } from './toolSchema.js';
import { publicPools } from './modelPool.js';
import { assembleModelContext } from './contextAssembler.js';
import { modelRegistry, selectLogicalModel } from './modelRouting.js';
import { executeBrainWorkflow } from './brainWorkflow.js';
import { openWebAiSession, webAiStatus } from './webAiProvider.js';
import { paidApiUsageEnabled, pricingClass } from './spendPolicy.js';
import { executeTool } from './toolExecutor.js';
import { runWorkflow, workflowSummary } from './workflowEngine.js';
import { resolveApprovalRequest } from './approvalContinuation.js';
import { executeApiTool } from './apiToolRun.js';
import { capabilityStatus } from './capabilityStatus.js';
import { publicApprovalPolicy, validateApprovalRules } from './approvalPolicy.js';
import { expirePendingApprovals } from './approvalExpiry.js';
import { diagnostics, ingestDocument, integrationStatus, researchSearch, searchMemory } from './systemModules.js';
import { tick } from './scheduler.js';
import { claimDueReminders, deliverDesktopReminder } from './reminders.js';
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
import { brainCatalog } from './brainSources.js';
import { detectedCliSources, discoverBrainModels, ollamaRuntimeStatus, testBrainSource } from './brainService.js';
import { publicProviderPresets, presetFor } from './providerPresets.js';
import systemRoutes from './routes/system.js';
import chatRoutes from './routes/chat.js';
import deviceRoutes from './routes/device.js';
import brainRoutes from './routes/brain.js';


const port = Number(process.env.JARVIS_PORT || 8787);
const processStartedAt = Date.now();
const uptimeSeconds = () => Math.floor((Date.now() - processStartedAt) / 1000);
const desktopErrorStatus = (code) => ({ WINDOW_NOT_FOUND: 404, AMBIGUOUS_TARGET: 409, WINDOW_FOCUS_FAILED: 409, TARGET_FOCUS_CHANGED: 409, WINDOW_OPERATION_UNSUPPORTED: 503, WINDOW_BACKEND_UNAVAILABLE: 503, WINDOW_BACKEND_TIMEOUT: 504, APP_LAUNCH_FAILED: 502 })[code];
const schedulerEnabled = process.env.JARVIS_SCHEDULER !== '0';
const schedulerInterval = Math.max(10_000, Number(process.env.JARVIS_SCHEDULER_INTERVAL_MS || 30_000));
let lastSchedulerTick = null;
let schedulerTickInFlight = null;
async function processSchedulerTick() {
  if (schedulerTickInFlight) return schedulerTickInFlight;
  schedulerTickInFlight = (async () => {
    const current = await getState();
    expirePendingApprovals(current);
    const runs = await tick(current);
    const reminders = claimDueReminders(current);
    lastSchedulerTick = new Date().toISOString();
    await updateState((draft) => draft);
    for (const reminder of reminders) {
      const delivered = await deliverDesktopReminder(reminder);
      await updateState((draft) => {
        const item = (draft.reminders || []).find((entry) => entry.id === reminder.id);
        if (item?.status === 'due') item.desktopDelivery = delivered.status;
        return draft;
      });
    }
    return { runs, reminders };
  })();
  try { return await schedulerTickInFlight; }
  finally { schedulerTickInFlight = null; }
}
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
  if (error?.code === 'NO_ZERO_COST_MODEL_AVAILABLE') return 'No compatible local model, authorized web session, or verified zero-cost API model is available. No paid API call was made.';
  if (error?.code === 'HUMAN_ACTION_REQUIRED') return 'Human verification is required in the browser before JARVIS can continue.';
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
        const ctx = { json, body, recordActivity, modelFailureReply, publicProvider, connectionStatus, authorized, uptimeSeconds, desktopErrorStatus, processSchedulerTick, lastSchedulerTick, schedulerEnabled, schedulerInterval, port };
    await systemRoutes(req, res, url, state, ctx);
    if (res.headersSent) return;
    await chatRoutes(req, res, url, state, ctx);
    if (res.headersSent) return;
    await deviceRoutes(req, res, url, state, ctx);
    if (res.headersSent) return;
    await brainRoutes(req, res, url, state, ctx);
    if (res.headersSent) return;

    return json(res, 404, { error: 'Not found' });
  } catch (error) { if (!desktopErrorStatus(error.code)) console.error(error); return json(res, desktopErrorStatus(error.code) || (error.code === 'PAYLOAD_TOO_LARGE' ? 413 : error.code === 'INVALID_JSON' || error.code === 'TOOL_INPUT_INVALID' ? 400 : error.code === 'HUMAN_ACTION_REQUIRED' ? 409 : error.code?.startsWith('BROWSER_') || error.code === 'NAVIGATION_FAILED' ? 502 : 500), { error: desktopErrorStatus(error.code) ? error.message : 'JARVIS service error', code: error.code || 'SERVICE_ERROR', detail: error.message }); }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') { console.error(`JARVIS could not start because port ${port} is already in use. If /api/health responds, JARVIS is already running.`); process.exitCode = 1; return; }
  console.error(`JARVIS server error: ${error.message}`); process.exitCode = 1;
});

startHUDManager(
  async (text) => {
    // Treat text as a new chat message
    try {
      await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: text })
      });
    } catch(e) {}
  },
  () => {
    // trigger voice listen logic here
  }
);
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
  try { await processSchedulerTick(); } catch (error) { console.warn(`Scheduler tick failed: ${error.message}`); }
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

process.on('jarvis_resume_chat', async (runId) => {
  try {
    const state = await getState();
    const run = (state.runs || []).find((item) => item.id === runId);
    if (!run || run.status !== 'running' || run.type !== 'chat') return;
    const text = run.request;
    const routeStarted = performance.now();

    let providerResult = null; let modelRoute = null; let modelFailure = null; let reply = '';
    const modelStarted = performance.now();
    modelRoute = selectLogicalModel(text, state.modelRouting || {}, { hasMedia: false });
    const assembledContext = assembleModelContext({ query: text, conversations: state.conversations || [], memories: state.memories || [], includeTools: modelRoute.requiresTools });
    try {
      const brain = await executeBrainWorkflow({ route: modelRoute, request: text, context: assembledContext.context, continuationState: { runId: run.id, plan: run.plan, currentStep: run.currentStep, completedToolCalls: run.toolCalls.filter((call) => call.status === 'completed' || call.status === 'failed').map((call) => ({ id: call.id, tool: call.tool, resultId: call.resultId })) }, state, attachments: [], allowFallback: state.modelRouting?.manualFallbackAllowed !== false, execute: (options) => modelRoute.requiresTools && options.continuationState?.delegationStage === 0 ? executeModelToolLoop(options) : executeModelPool(options) });
      providerResult = brain.result;
      modelRoute.executionDecision = brain.decision;
      if (providerResult.executedToolCalls?.length) run.toolCalls.push(...providerResult.executedToolCalls);
      if (providerResult.approvalRequired) {
        run.approvals.push(providerResult.approval.id);
        transitionRun(run, 'waiting_for_approval');
        await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
        return; // Pause again
      }
      reply = providerResult.reply; run.provider = providerResult.provider; run.model = providerResult.model || providerResult.logicalModel;
      run.routing = { ...modelRoute, ...providerResult.routingTelemetry, ...assembledContext.telemetry, actualModel: providerResult.model || null, routingConfidence: modelRoute.confidence, routingReason: modelRoute.reason, routerProviderAttempts: modelRoute.classifierTelemetry?.providerAttempts || [], routerMs: (modelRoute.classifierTelemetry?.providerAttempts || []).reduce((sum, attempt) => sum + Number(attempt.latencyMs || 0), 0), modelMs: Math.round(performance.now() - modelStarted), toolMs: 0, policyMs: 0, databaseMs: assembledContext.telemetry.memoryMs, totalMs: Math.round(performance.now() - routeStarted), inputTokens: providerResult.inputTokens || 0, outputTokens: providerResult.outputTokens || 0, toolCalls: run.toolCalls.length };
    } catch (error) {
      let terminalError = error;
      if (paidApiUsageEnabled() && error.code === 'MODEL_CAPACITY_EXHAUSTED' && publicProvider(state.provider).configured) {
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
    await updateState((draft) => { draft.runtime ??= { startedAt: new Date().toISOString(), usage: { requests: 0, tokens: 0, cost: 0 } }; draft.runtime.usage ??= { requests: 0, tokens: 0, cost: 0 }; draft.runtime.usage.requests += 1; draft.runtime.usage.tokens += providerResult?.tokens || 0; draft.runtime.usage.cost += providerResult?.cost || 0; if (run.routing) { draft.modelRouting ??= { telemetry: [], providerHealth: {} }; draft.modelRouting.providerHealth = state.modelRouting?.providerHealth || {}; draft.modelRouting.telemetry = [{ requestId: run.id, runId: run.id, timestamp: new Date().toISOString(), ...run.routing, success: !modelFailure }, ...(draft.modelRouting.telemetry || [])].slice(0, 200); draft.runtime.lastModelRoute = run.routing; draft.runtime.latency ??= {}; Object.assign(draft.runtime.latency, { routerMs: run.routing.routerMs || 0, modelMs: run.routing.modelMs || 0, toolMs: run.routing.toolMs || 0, policyMs: run.routing.policyMs || 0, databaseMs: run.routing.databaseMs || 0, totalMs: run.routing.totalMs || 0, samples: Number(draft.runtime.latency.samples || 0) + 1 }); } draft.conversations ??= []; const modelIndicator = run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null; const routingDebug = process.env.JARVIS_ROUTER_DEBUG === 'true' && run.routing ? { taskType: run.routing.taskType, confidence: run.routing.routingConfidence, apiRotationCount: run.routing.apiRotationCount, modelFallbackUsed: run.routing.modelFallbackUsed, totalMs: run.routing.totalMs } : null; draft.conversations.push({ who: 'JARVIS', time: new Date().toISOString(), lines: [reply], modelIndicator, routingDebug }); draft.conversations = draft.conversations.slice(-100); return draft; });
    if (!modelFailure) {
      if (run.plan.intent === 'direct' && run.steps[0]?.status === 'queued') { run.steps[0].status = 'completed'; run.steps[0].startedAt = run.startedAt; run.steps[0].completedAt = new Date().toISOString(); }
      finishRun(run, { reply }, providerResult ? { input: providerResult.inputTokens, output: providerResult.outputTokens, total: providerResult.tokens } : { total: 0 });
    }
    await updateState((draft) => { const stored = draft.runs?.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
  } catch (error) {
    console.error('Chat resumption error:', error);
  }
});

export { server };
