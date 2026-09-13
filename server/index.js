import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getState, updateState, activityEntry } from './store.js';
import { listCapabilities, listTools } from './registry.js';
import { publicPools } from './modelPool.js';
import { executeModelDelegation } from './modelDelegation.js';
import { assembleModelContext } from './contextAssembler.js';
import { contextualToolRoute } from './contextResolver.js';
import { modelRegistry } from './modelRouting.js';
import { selectLogicalModelWithClassifier } from './modelRouterService.js';
import { executeToolCall } from './toolExecutor.js';
import { resumeWorkflowAfterApproval, runWorkflow, workflowSummary } from './workflowEngine.js';
import { diagnostics, integrationStatus } from './systemModules.js';
import { tick } from './scheduler.js';
import { dispatchWorkflowEvent } from './workflowEvents.js';
import crypto from 'node:crypto';
import { adapterStatus, vectorSearch } from './extendedAdapters.js';
import { createSession, validSession } from './liveAdapters.js';
import { beginRun, errorRun, finishRun } from './orchestrator.js';
import { routeRequest } from './router.js';
import { publicConfig, saveConfig } from './config.js';
import { synthesizeSpeech, transcribeAudio, ttsStatus } from './tts.js';
import { downloadVideoJob, readGeneratedMedia, refreshVideoJob } from './mediaGeneration.js';
import { composioStatus, createComposioConnectLink, listComposioAccounts, listComposioTools, validateComposioProjectKey } from './composioAdapter.js';
import { complete as completeConfiguredProvider, providerForLogicalModel } from './providerClient.js';
import { nextDictation, publishDictation, publishVoiceOsEvent, restartWindowsVoiceBridge, startWindowsVoiceBridge, updateVoiceOsSettings, validBridgeRequest, voiceOsEvents, voiceOsSettings, voiceOsStatus } from './voiceOs.js';
import { handleMcpRequest } from './mcpAdapter.js';
import { formatToolReply } from './toolResponses.js';
import { executeModelToolLoop, resumeModelToolLoop, retryModelSynthesis, shouldUseModelToolLoop, stopApprovalContinuation } from './modelToolLoop.js';
import { acceptPhoneEvent, authenticatePhoneEnvelope, beginPhonePairing, completePhonePairing, phoneBridgeStatus, pollPhoneCommands } from './phoneBridge.js';
import { TOOL_ERROR_CODES } from './toolErrors.js';
import { executeBrainModel } from './chatgptWebBrain.js';
import { chatGPTWebTransport } from './chatgptWebTransport.js';
import { geminiWebTransport } from './geminiWebTransport.js';
import { beginGeneration, cancelGeneration, failGeneration, finishGeneration, generationEvents, publishGenerationEvent, releaseGeneration } from './generationEvents.js';
import { credentialCatalog, removeCredential, saveCredential, verifyCredential } from './credentialManager.js';
import { createChatSession, ensureChatSessions, sessionMessages, touchSession } from './chatSessions.js';
import { initializeJarvisVault, memoryGraph, readVaultNote, scanMemoryGraph, startMemoryGraphWatcher } from './memoryGraph.js';
import { normalizePermissionMode } from './permissionPolicy.js';
import { pendingApprovalResolution } from './approvalManager.js';
import { pendingMessagingResolution, resolvedIntentArguments } from './recipientResolver.js';
import { needleEligibleTools, routeIncomingRequest } from './requestRouter.js';
import { needleProvider } from './needleProvider.js';
import { platformInfo } from './platform/index.js';

const port = Number(process.env.JARVIS_PORT || 8787);
const requestedHost = String(process.env.JARVIS_HOST || '127.0.0.1');
const lanReady = process.env.JARVIS_PHONE_BRIDGE_ALLOW_LAN === '1' && Boolean(process.env.JARVIS_AUTH_TOKEN) && String(process.env.PHONE_BRIDGE_MASTER_KEY || '').length >= 32;
const host = ['127.0.0.1', 'localhost', '::1'].includes(requestedHost) || lanReady ? requestedHost : '127.0.0.1';
const processStartedAt = Date.now();
const uptimeSeconds = () => Math.floor((Date.now() - processStartedAt) / 1000);
const schedulerEnabled = process.env.JARVIS_SCHEDULER !== '0';
const staticRoot = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const schedulerInterval = Math.max(10_000, Number(process.env.JARVIS_SCHEDULER_INTERVAL_MS || 30_000));
let lastSchedulerTick = null;
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const staticTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.task': 'application/octet-stream' };
async function serveFrontend(url, res) {
  if (url.pathname.startsWith('/api/')) return false;
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  let target = path.resolve(staticRoot, relative);
  if (target !== staticRoot && !target.startsWith(`${staticRoot}${path.sep}`)) return false;
  try {
    if (!(await stat(target)).isFile()) return false;
  } catch {
    if (path.extname(relative)) return false;
    target = path.join(staticRoot, 'index.html');
  }
  try {
    const content = await readFile(target);
    res.writeHead(200, { 'content-type': staticTypes[path.extname(target).toLowerCase()] || 'application/octet-stream', 'content-length': content.length, 'cache-control': path.basename(target) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(content);
    return true;
  } catch { return false; }
}

async function body(req) {
  const chunks=[];let bytes=0;const maximum=2_000_000;
  for await (const chunk of req){bytes+=chunk.length;if(bytes>maximum)throw Object.assign(new Error('Request body exceeds 2 MB'),{code:'INVALID_ARGUMENTS'});chunks.push(chunk);}
  if(!chunks.length)return{};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Request body must be valid JSON'),{code:'INVALID_ARGUMENTS'});}
}

function recordActivity(state, entry) {
  state.activity = [entry, ...(state.activity || [])].slice(0, 200);
}

async function resolveApprovalTransaction(state, id, outcome) {
  const existing = state.approvals.find((item) => item.id === id);
  if (!existing) return { status: 404, body: { error: 'Approval not found', code: 'APPROVAL_NOT_FOUND' } };
  if (existing.status !== 'pending') return { status: 409, body: { error: 'Approval already resolved', code: 'APPROVAL_REPLAY', approval: existing, result: existing.executionResult || existing.result || null } };
  if (!Number.isFinite(Date.parse(existing.expiresAt)) || Date.parse(existing.expiresAt) <= Date.now()) {
    await updateState((draft) => { const expired = draft.approvals.find((item) => item.id === id); expired.status = 'expired'; stopApprovalContinuation(draft.runs.find((item) => item.id === expired.runId), expired, 'APPROVAL_EXPIRED'); return draft; });
    return { status: 409, body: { error: 'Approval expired; action not executed', code: 'APPROVAL_EXPIRED' } };
  }
  let approval; let result = null; let workflow = null; let synthesis = null;
  await updateState(async (draft) => {
    approval = draft.approvals.find((item) => item.id === id);
    if (approval.status !== 'pending') throw Object.assign(new Error('Approval already resolved'), { code: 'APPROVAL_REPLAY' });
    if (outcome !== 'approved') {
      approval.status = 'rejected'; approval.resolvedAt = new Date().toISOString();
      stopApprovalContinuation(draft.runs.find((item) => item.id === approval.runId), approval, 'PERMISSION_DENIED');
      recordActivity(draft, activityEntry('approval.rejected', approval.title, { approvalId: id })); return draft;
    }
    approval.status = 'approved'; approval.approvedAt = new Date().toISOString();
    if (approval.action && approval.toolName) {
      const linkedRun = (draft.runs || []).find((item) => item.id === approval.runId);
      result = await executeToolCall({ id: approval.toolCallId, toolName: approval.toolName, arguments: approval.resolvedArguments || approval.action, source: 'approval-resume', runId: approval.runId, stepId: approval.stepId, approvalId: approval.id, requestedBy: approval.requestedBy || 'local-operator', idempotencyKey: approval.idempotencyKey || (approval.toolCallId ? `${approval.runId}:${approval.toolCallId}` : null) }, { state: draft, request: linkedRun?.request || approval.title, requestedBy: approval.requestedBy || 'local-operator', sessionId: approval.jarvisSessionId || approval.sessionId || null, originatingBackend: approval.originatingBackend || linkedRun?.model || null, backendConversationId: approval.backendConversationId || null, autoCompleteRun: linkedRun?.type !== 'workflow' && !linkedRun?.modelContinuation });
      approval.executionResult = result.sensitiveOutput ? { ...result, output: { redacted: true } } : result;
      approval.resolvedAt = new Date().toISOString();
      if (result.status === 'completed' && linkedRun?.workflowId) workflow = await resumeWorkflowAfterApproval(draft, approval);
    }
    recordActivity(draft, activityEntry(`approval.${approval.status}`, approval.title, { approvalId: id, toolCallId: approval.toolCallId || null, resultStatus: result?.status || null }));
    return draft;
  });
  const resumedRun = state.runs.find((item) => item.id === approval.runId);
  if (result && resumedRun?.modelContinuation?.status === 'waiting_for_approval') {
    publishGenerationEvent({ type: 'tool.result', sessionId: resumedRun.conversationId || null, runId: resumedRun.id, toolCallId: result.toolCallId, tool: result.toolName, status: result.status, verified: result.verified, error: result.error || null });
    publishGenerationEvent({ type: 'generation.resume', sessionId: resumedRun.conversationId || null, runId: resumedRun.id, backend: resumedRun.model || resumedRun.modelContinuation?.route?.primaryModel });
    try {
      synthesis = await resumeModelToolLoop({ state, run: resumedRun, result, executeModel: executeBrainModel, checkpoint: () => updateState((draft) => draft), onEvent: publishGenerationEvent });
      if (synthesis.status === 'completed') finishRun(resumedRun, { reply: synthesis.reply, toolCalls: synthesis.toolResults }, { input: synthesis.inputTokens, output: synthesis.outputTokens, total: synthesis.tokens });
      else if (synthesis.status === 'failed') errorRun(resumedRun, new Error('Tool execution failed during model continuation'));
    } catch {
      synthesis = { status: 'failed', reply: 'The approved action result was preserved, but the model could not finish its response. The action was not repeated.', error: { code: 'MODEL_SYNTHESIS_FAILED' } };
      errorRun(resumedRun, new Error(synthesis.reply));
    }
    await updateState((draft) => { draft.conversations.push({ who: 'JARVIS', time: new Date().toISOString(), lines: [synthesis.reply], conversationId: resumedRun.conversationId || null, runId: resumedRun.id }); return draft; });
  }
  if (approval.status === 'failed' || result?.status === 'failed' || result?.status === 'failed_verification') return { status: 502, body: { approval, result, synthesis, error: approval.error || result?.error?.message, code: result?.error?.code || 'EXECUTION_FAILED' } };
  return { status: 200, body: { approval, result, workflow, synthesis, reply: synthesis?.reply || (outcome === 'approved' ? (result?.status === 'completed' ? 'Approved action executed and verified.' : 'Approval recorded.') : 'Action rejected.') } };
}

function modelFailureReply(error, runId) {
  if (error?.code === 'EXECUTION_CANCELLED') return 'Stopped. Completed tool actions were preserved and no additional actions were started.';
  if (error?.code === 'CHATGPT_LOGIN_REQUIRED') return 'ChatGPT Web needs a manual sign-in. Open Settings → Intelligence → ChatGPT Web and choose Open login.';
  if (error?.code?.startsWith('CHATGPT_')) return `ChatGPT Web could not complete this request (${error.code}). Run ${runId} was preserved without claiming success.`;
  if (error?.code === 'GEMINI_LOGIN_REQUIRED') return 'Gemini Web needs a manual sign-in. Open Settings → Intelligence → Gemini Headless and choose Open login.';
  if (error?.code?.startsWith('GEMINI_')) return `Gemini Web could not complete this request (${error.code}). Run ${runId} was preserved without claiming success.`;
  if (error?.code === 'CONFIGURATION_MISSING') return error.message;
  if (error?.code === 'REQUEST_ERROR') return `The model request was rejected before execution: ${error.message}`;
  if (error?.code === 'CAPABILITY_UNAVAILABLE') return `The required capability is temporarily unavailable. Run ${runId} was preserved without claiming the action succeeded.`;
  return `Model capacity is currently unavailable. Run ${runId} was preserved and can be resumed when a provider becomes available.`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && await serveFrontend(url, res)) return;
    if (req.method === 'POST' && url.pathname === '/api/auth/login') { const input = await body(req); if (process.env.JARVIS_AUTH_TOKEN && input.token !== process.env.JARVIS_AUTH_TOKEN) return json(res, 401, { error: 'Invalid credentials' }); return json(res, 200, createSession(input.user || 'local-operator')); }
    const bridgeRoute = (req.method === 'POST' && ['/api/voice-os/hotkey', '/api/voice-os/events'].includes(url.pathname)) || (req.method === 'GET' && ['/api/voice-os/bridge/dictation', '/api/voice-os/bridge/config'].includes(url.pathname));
    const phoneDeviceRoute = req.method === 'POST' && ['/api/phone/pair/complete', '/api/phone/commands/poll', '/api/phone/events'].includes(url.pathname);
    if (process.env.JARVIS_AUTH_TOKEN && !authorized(req) && !(bridgeRoute && validBridgeRequest(req)) && !phoneDeviceRoute) return json(res, 401, { error: 'Authentication required' });
    const state = await getState();
    if (req.method === 'GET' && url.pathname === '/api/phone/status') return json(res, 200, phoneBridgeStatus(state));
    if (req.method === 'POST' && url.pathname === '/api/phone/pair/start') { let result; await updateState((draft)=>{result=beginPhonePairing(draft,{});return draft;});return json(res,201,result); }
    if (req.method === 'POST' && url.pathname === '/api/phone/pair/complete') { const input=await body(req);let result;await updateState((draft)=>{result=completePhonePairing(draft,input);return draft;});return json(res,201,result); }
    if (req.method === 'POST' && url.pathname === '/api/phone/commands/poll') { const input=await body(req);let envelope;await updateState((draft)=>{const authenticated=authenticatePhoneEnvelope(draft,input,'poll');envelope=pollPhoneCommands(draft,authenticated);return draft;});return json(res,200,envelope); }
    if (req.method === 'POST' && url.pathname === '/api/phone/events') { const input=await body(req);let accepted;await updateState(async(draft)=>{const authenticated=authenticatePhoneEnvelope(draft,input,'event');accepted=acceptPhoneEvent(draft,authenticated);if(accepted.event?.type==='notification')await executeToolCall({toolName:'notifications.ingest',arguments:{source:'phone',externalId:accepted.event.id,title:accepted.event.title,message:accepted.event.message,at:accepted.event.at},source:'phone-bridge',requestedBy:`phone:${accepted.deviceId}`},{state:draft,request:'Ingest paired phone notification'});await dispatchWorkflowEvent(draft,{id:accepted.event.id,type:`phone.${accepted.event.type||'event'}`,source:'phone',payload:accepted.event});return draft;});return json(res,202,{accepted:true,deviceId:accepted.deviceId}); }
    if (req.method === 'GET' && url.pathname.startsWith('/api/generated/')) { const fileName = url.pathname.split('/').pop(); const media = await readGeneratedMedia(fileName); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.match(/^\/api\/media\/jobs\/[^/]+\/download$/)) { const id = url.pathname.split('/')[4]; const job = (state.mediaJobs || []).find((item) => item.id === id); if (!job) return json(res, 404, { error: 'Media job not found' }); const media = await downloadVideoJob(job); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.startsWith('/api/media/jobs/')) { const id = url.pathname.split('/').pop(); const existing = (state.mediaJobs || []).find((job) => job.id === id); if (!existing) return json(res, 404, { error: 'Media job not found' }); const job = await refreshVideoJob(existing); await updateState((draft) => { const index = (draft.mediaJobs || []).findIndex((item) => item.id === id); if (index >= 0) draft.mediaJobs[index] = job; return draft; }); return json(res, 200, { job: { ...job, operationName: undefined, credentialSlot: undefined, downloadUri: job.downloadUri ? `/api/media/jobs/${job.id}/download` : null } }); }
    if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, publicConfig());
    if (req.method === 'PATCH' && url.pathname === '/api/config') { const config = saveConfig(await body(req)); return json(res, 200, config); }
    if (req.method === 'GET' && url.pathname === '/api/credentials') return json(res, 200, { providers: credentialCatalog(state) });
    if (req.method === 'POST' && url.pathname === '/api/credentials') { const input = await body(req); let provider; await updateState((draft) => { provider = saveCredential(draft, input); return draft; }); return json(res, 201, { provider }); }
    if (url.pathname.match(/^\/api\/credentials\/[^/]+$/) && ['PATCH', 'DELETE'].includes(req.method)) {
      const slot = decodeURIComponent(url.pathname.split('/').pop()); const input = req.method === 'PATCH' ? await body(req) : {}; const providerId = input.providerId || url.searchParams.get('provider'); let provider;
      await updateState((draft) => { provider = req.method === 'DELETE' ? removeCredential(draft, providerId, slot) : saveCredential(draft, { ...input, providerId, slot }); return draft; });
      return json(res, 200, { provider });
    }
    if (req.method === 'POST' && url.pathname.match(/^\/api\/credentials\/[^/]+\/verify$/)) {
      const slot = decodeURIComponent(url.pathname.split('/')[3]); const input = await body(req); let verification;
      await updateState(async (draft) => { verification = await verifyCredential(draft, input.providerId, slot, { customUrl: input.customUrl || (input.providerId === 'custom' && draft.provider?.id === 'custom' ? draft.provider.baseUrl : null) }); return draft; });
      return json(res, 200, { verification });
    }
    if (req.method === 'GET' && url.pathname === '/api/voice/tts') return json(res, 200, ttsStatus());
    if (req.method === 'POST' && url.pathname === '/api/voice/tts') {
      const result = await synthesizeSpeech(await body(req));
      res.writeHead(200, { 'content-type': result.contentType, 'content-length': result.audio.length, 'cache-control': 'no-store' });
      return res.end(result.audio);
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/transcribe') {
      try { return json(res, 200, await transcribeAudio(await body(req))); }
      catch (error) { return json(res, error.code === 'REQUEST_ERROR' ? 400 : error.code === 'CONFIG_REQUIRED' ? 503 : 502, { error: error.message, code: error.code || 'TRANSCRIPTION_FAILED' }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/voice-os/settings') return json(res, 200, voiceOsStatus(state));
    if (req.method === 'PATCH' && url.pathname === '/api/voice-os/settings') {
      const input = await body(req); let settings;
      await updateState((draft) => { settings = updateVoiceOsSettings(draft, input); recordActivity(draft, activityEntry('voice-os.settings.updated', 'Voice OS settings updated')); return draft; });
      if ((input.pushToTalkKey !== undefined || input.dictationKey !== undefined) && settings.globalHotkeys && process.platform === 'win32') restartWindowsVoiceBridge();
      return json(res, 200, { settings, status: voiceOsStatus({ ...state, voiceOs: { settings } }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/voice-os/bridge/start') {
      if (process.platform !== 'win32') return json(res, 501, { error: 'The press/release global Voice OS bridge is currently available only on Windows. Linux browser-focused activation remains available; Wayland global hooks are intentionally not bypassed.', code: 'CAPABILITY_UNAVAILABLE', platform: platformInfo() });
      const result = startWindowsVoiceBridge();
      await updateState((draft) => { updateVoiceOsSettings(draft, { globalHotkeys: true }); recordActivity(draft, activityEntry('voice-os.bridge.started', 'Windows hotkey bridge started', { pid: result.pid || null })); return draft; });
      return json(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/voice-os/hotkey') {
      if (!validBridgeRequest(req)) return json(res, 403, { error: 'Invalid Voice OS bridge token' });
      const input = await body(req); return json(res, 202, { event: publishVoiceOsEvent({ type: input.type }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/voice-os/events') {
      if (!validBridgeRequest(req)) return json(res, 403, { error: 'Invalid Voice OS bridge token' });
      const event = publishVoiceOsEvent(await body(req));
      await updateState(async(draft) => { recordActivity(draft, activityEntry(`voice-os.${event.type}`, event.title || event.message || event.type, { app: event.app, callId: event.callId }));if(event.type==='notification'||event.type==='incoming_call')await executeToolCall({toolName:'notifications.ingest',arguments:{source:event.app||'system',externalId:event.callId||String(event.id),title:event.title||event.type,message:event.message||event.contact||'',at:event.at},source:'voice-os-bridge',requestedBy:'trusted-local-bridge'},{state:draft,request:`Ingest ${event.type}`});return draft; });
      return json(res, 202, { event });
    }
    if (req.method === 'GET' && url.pathname === '/api/voice-os/events') return json(res, 200, { events: voiceOsEvents(url.searchParams.get('after') || 0) });
    if (req.method === 'POST' && url.pathname === '/api/voice-os/dictation') {
      const item = publishDictation((await body(req)).text);
      return json(res, 202, { id: item.id, queuedForFocusedApp: true, platform: process.platform });
    }
    if (req.method === 'GET' && url.pathname === '/api/voice-os/bridge/dictation') {
      if (!validBridgeRequest(req)) return json(res, 403, { error: 'Invalid Voice OS bridge token' });
      const item = nextDictation(url.searchParams.get('after') || 0);
      if (!item) { res.writeHead(204, { 'cache-control': 'no-store' }); return res.end(); }
      const payload = `${item.id}:${Buffer.from(item.text, 'utf8').toString('base64')}`;
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); return res.end(payload);
    }
    if (req.method === 'GET' && url.pathname === '/api/voice-os/bridge/config') {
      if (!validBridgeRequest(req)) return json(res, 403, { error: 'Invalid Voice OS bridge token' });
      const settings = voiceOsSettings(state);
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); return res.end(`${settings.pushToTalkKey}|${settings.dictationKey}`);
    }
    if (req.method === 'POST' && url.pathname === '/api/voice-os/action') {
      const input = await body(req);
      const toolName = { 'call.start': 'communications.call.start', 'call.answer': 'communications.call.answer', 'call.reject': 'communications.call.reject', 'message.send': 'communications.message.send' }[input.type];
      if (!toolName) return json(res, 400, { error: 'Unsupported Voice OS action type', code: 'INVALID_ARGUMENTS' });
      const { type, approvalId, toolCallId, runId, ...action } = input; let result;
      await updateState(async (draft) => { result = await executeToolCall({ id: toolCallId, toolName, arguments: action, source: 'voice-os-api', runId, approvalId, requestedBy: 'local-operator' }, { state: draft, request: `${type} ${action.target || action.callId || ''}`.trim() }); return draft; });
      return json(res, result.status === 'completed' ? 200 : result.status === 'waiting_for_approval' ? 202 : result.error?.code?.startsWith('APPROVAL_') ? 403 : 502, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'jarvis', assistant: 'JARVIS', mode: 'local', platform: platformInfo(), uptimeSeconds: uptimeSeconds(), at: new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/api/runs') return json(res, 200, { runs: state.runs || [] });
    if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) { const run = (state.runs || []).find((item) => item.id === url.pathname.split('/').pop()); return run ? json(res, 200, { run }) : json(res, 404, { error: 'Run not found' }); }
    if (req.method === 'POST' && url.pathname.match(/^\/api\/runs\/[^/]+\/(cancel|resume)$/)) {
      const id = url.pathname.split('/')[3]; const action = url.pathname.split('/')[4];
      const run = state.runs.find((item) => item.id === id);
      if (!run) return json(res, 404, { error: 'Run not found' });
      if (action === 'resume' && run.modelContinuation) {
        if (run.modelContinuation.status !== 'synthesis_failed' || run.status === 'cancelled') return json(res, 409, { code: 'INVALID_CONTINUATION', error: 'Run is not awaiting a synthesis retry' });
        let synthesis;
        try {
          synthesis = await retryModelSynthesis({ state, run, executeModel: executeBrainModel, checkpoint: () => updateState((draft) => draft), onEvent: publishGenerationEvent });
          if (synthesis.status === 'completed') finishRun(run, { reply: synthesis.reply }, { input: synthesis.inputTokens, output: synthesis.outputTokens, total: synthesis.tokens });
          else if (synthesis.status === 'failed') errorRun(run, new Error('Tool results include a failed action'));
        } catch { errorRun(run, new Error('Model synthesis failed; previous actions remain preserved.')); }
        await updateState((draft) => { if (synthesis?.reply) draft.conversations.push({ who: 'JARVIS', time: new Date().toISOString(), lines: [synthesis.reply], runId: run.id }); return draft; });
        return json(res, synthesis ? 200 : 503, { run, synthesis });
      }
      await updateState((draft) => { run.status = action === 'cancel' ? 'cancelled' : 'running'; run.events.push({ type: `run.${action}`, at: new Date().toISOString() }); return draft; });
      return json(res, 200, { run });
    }
    if (req.method === 'GET' && url.pathname === '/api/telemetry') return json(res, 200, { uptimeSeconds: uptimeSeconds(), usage: state.runtime?.usage || { requests: 0, tokens: 0, cost: 0 }, latency: state.runtime?.latency || {}, provider: publicProvider(state.provider), modelRouting: { mode: state.modelRouting?.modelMode || 'auto', jarvisMode: state.modelRouting?.jarvisMode || 'normal', manualModel: state.modelRouting?.manualModel || null, last: state.runtime?.lastModelRoute || null } });
    if (req.method === 'GET' && url.pathname === '/api/provider') return json(res, 200, { provider: publicProvider(state.provider) });
    if (req.method === 'GET' && url.pathname === '/api/model-routing') return json(res, 200, { settings: { jarvisMode: state.modelRouting?.jarvisMode || 'normal', modelMode: state.modelRouting?.modelMode || 'auto', manualModel: state.modelRouting?.manualModel || 'muse-spark-1.2', manualFallbackAllowed: state.modelRouting?.manualFallbackAllowed !== false, ...state.brainBackends }, models: modelRegistry(), providerPools: publicPools(), providerHealth: state.modelRouting?.providerHealth || {}, recentTelemetry: (state.modelRouting?.telemetry || []).slice(0, 25), debug: process.env.JARVIS_ROUTER_DEBUG === 'true' });
    if (req.method === 'GET' && url.pathname === '/api/needle/status') return json(res, 200, { enabled: String(process.env.JARVIS_NEEDLE_ENABLED || 'true').toLowerCase() !== 'false', ...needleProvider().healthCheck(), thresholds: { autoExecute: Number(process.env.JARVIS_NEEDLE_AUTO_EXEC_THRESHOLD || 0.90), readOnly: Number(process.env.JARVIS_NEEDLE_READ_ONLY_THRESHOLD || 0.85), fallback: Number(process.env.JARVIS_NEEDLE_FALLBACK_THRESHOLD || 0.75) } });
    if (req.method === 'POST' && url.pathname === '/api/needle/route-preview') { const input = await body(req); const decision = await routeIncomingRequest(input.message, { source: input.source || 'chat', deterministicRoute: input.skipDeterministic ? { route: 'MODEL', confidence: 0.7 } : undefined }); return json(res, 200, { ...decision, needleError: decision.needleError ? '[REDACTED]' : undefined }); }
    if (req.method === 'PATCH' && url.pathname === '/api/model-routing') { const input = await body(req); const updated = await updateState((draft) => { draft.modelRouting ??= {}; draft.brainBackends ??= {}; if (['normal', 'coding', 'deepthinking'].includes(input.jarvisMode)) draft.modelRouting.jarvisMode = input.jarvisMode; if (['auto', 'manual'].includes(input.modelMode)) draft.modelRouting.modelMode = input.modelMode; if (modelRegistry()[input.manualModel]) draft.modelRouting.manualModel = input.manualModel; if (typeof input.manualFallbackAllowed === 'boolean') draft.modelRouting.manualFallbackAllowed = input.manualFallbackAllowed; if (['auto', 'chatgpt-web', 'gemini-web'].includes(input.defaultBackend)) draft.brainBackends.defaultBackend = input.defaultBackend; if (['none', 'chatgpt-web', 'gemini-web', 'api'].includes(input.fallbackBackend)) draft.brainBackends.fallbackBackend = input.fallbackBackend; if (typeof input.streaming === 'boolean') draft.brainBackends.streaming = input.streaming; return draft; }); return json(res, 200, { settings: { ...updated.modelRouting, ...updated.brainBackends } }); }
    if (req.method === 'GET' && url.pathname === '/api/chatgpt-web/status') {
      const health = await chatGPTWebTransport().health();
      return json(res, 200, { enabled: state.chatgptWeb?.enabled === true, useAsDefault: state.chatgptWeb?.useAsDefault === true, status: health.status, browser: health.browser, authenticated: health.authenticated, mode: health.mode, session: state.chatSessions?.some((item) => item.chatgptConversationUrl) || state.chatgptWeb?.sessionUrl ? 'ACTIVE' : 'NONE', project: health.project || 'UNKNOWN', projectName: process.env.JARVIS_CHATGPT_PROJECT_NAME || 'jarvis-chat', lastSuccessAt: state.chatgptWeb?.lastSuccessAt || null, lastError: state.chatgptWeb?.lastError || health.lastError || null, experimental: true, toolAccess: true, streaming: state.brainBackends?.streaming !== false });
    }
    if (req.method === 'GET' && url.pathname === '/api/chatgpt-web/diagnostics') return json(res, 200, await chatGPTWebTransport().diagnose());
    if (req.method === 'PATCH' && url.pathname === '/api/chatgpt-web/settings') {
      const input = await body(req); const updated = await updateState((draft) => { draft.chatgptWeb ??= {}; if (typeof input.enabled === 'boolean') draft.chatgptWeb.enabled = input.enabled; if (typeof input.useAsDefault === 'boolean') draft.chatgptWeb.useAsDefault = input.useAsDefault; return draft; });
      return json(res, 200, { enabled: updated.chatgptWeb.enabled, useAsDefault: updated.chatgptWeb.useAsDefault });
    }
    if (req.method === 'POST' && url.pathname === '/api/chatgpt-web/auth/start') {
      const health = await chatGPTWebTransport().openLogin();
      await updateState((draft) => { draft.chatgptWeb ??= {}; draft.chatgptWeb.enabled = true; recordActivity(draft, activityEntry('chatgpt.started', 'ChatGPT Web headed login opened')); return draft; });
      return json(res, 200, { opened: true, status: health.status, browser: health.browser, authenticated: health.authenticated, mode: health.mode });
    }
    if (req.method === 'POST' && url.pathname === '/api/chatgpt-web/auth/check') {
      const health = await chatGPTWebTransport().verifyLogin();
      await updateState((draft) => { draft.chatgptWeb ??= {}; draft.chatgptWeb.enabled = true; draft.chatgptWeb.projectName = process.env.JARVIS_CHATGPT_PROJECT_NAME || 'jarvis-chat'; if (health.projectUrl) draft.chatgptWeb.projectUrl = health.projectUrl; draft.chatgptWeb.lastError = null; recordActivity(draft, activityEntry('chatgpt.ready', 'ChatGPT Web authentication and Project verified', { project: draft.chatgptWeb.projectName })); return draft; });
      return json(res, 200, { verified: health.authenticated, status: health.status, browser: health.browser, authenticated: health.authenticated, mode: health.mode });
    }
    if (req.method === 'POST' && url.pathname === '/api/chatgpt-web/session/reset') {
      await chatGPTWebTransport().reset({ projectName: process.env.JARVIS_CHATGPT_PROJECT_NAME || 'jarvis-chat', projectUrl: process.env.JARVIS_CHATGPT_PROJECT_URL || state.chatgptWeb?.projectUrl });
      await updateState((draft) => { draft.chatgptWeb = { ...(draft.chatgptWeb || {}), sessionUrl: null, turns: 0, bootstrapped: false, lastError: null }; const active = (draft.chatSessions || []).find((item) => item.id === draft.activeSessionId); if (active) { active.chatgptConversationUrl = null; active.chatgptTurns = 0; active.chatgptBootstrapped = false; } recordActivity(draft, activityEntry('chatgpt.session.reset', 'Active JARVIS browser conversation reset inside jarvis-chat')); return draft; });
      return json(res, 200, { reset: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/chatgpt-web/stop') { const result = await chatGPTWebTransport().cancel(); return json(res, 200, result); }
    if (req.method === 'GET' && url.pathname === '/api/gemini-web/status') { const health = await geminiWebTransport().health(); return json(res, 200, { enabled: state.geminiWeb?.enabled === true, status: health.status, browser: health.browser, authenticated: health.authenticated, mode: health.mode, session: state.chatSessions?.some((item) => item.geminiConversationUrl) || state.geminiWeb?.sessionUrl ? 'ACTIVE' : 'NONE', lastSuccessAt: state.geminiWeb?.lastSuccessAt || null, lastError: state.geminiWeb?.lastError || health.lastError || null, experimental: true, toolAccess: true, streaming: state.brainBackends?.streaming !== false }); }
    if (req.method === 'GET' && url.pathname === '/api/gemini-web/diagnostics') return json(res, 200, await geminiWebTransport().diagnose());
    if (req.method === 'PATCH' && url.pathname === '/api/gemini-web/settings') { const input = await body(req); const updated = await updateState((draft) => { draft.geminiWeb ??= {}; if (typeof input.enabled === 'boolean') draft.geminiWeb.enabled = input.enabled; return draft; }); return json(res, 200, { enabled: updated.geminiWeb.enabled }); }
    if (req.method === 'POST' && url.pathname === '/api/gemini-web/auth/start') { const health = await geminiWebTransport().openLogin(); await updateState((draft) => { draft.geminiWeb ??= {}; draft.geminiWeb.enabled = true; recordActivity(draft, activityEntry('gemini.started', 'Gemini Web headed login opened')); return draft; }); return json(res, 200, { opened: true, ...health }); }
    if (req.method === 'POST' && url.pathname === '/api/gemini-web/auth/check') { const health = await geminiWebTransport().verifyLogin(); await updateState((draft) => { draft.geminiWeb ??= {}; draft.geminiWeb.enabled = true; draft.geminiWeb.lastError = null; recordActivity(draft, activityEntry('gemini.ready', 'Gemini Web authentication verified')); return draft; }); return json(res, 200, { verified: health.authenticated, ...health }); }
    if (req.method === 'POST' && url.pathname === '/api/gemini-web/session/reset') { await geminiWebTransport().reset(); await updateState((draft) => { draft.geminiWeb = { ...(draft.geminiWeb || {}), sessionUrl: null, turns: 0, bootstrapped: false, lastError: null }; const active = (draft.chatSessions || []).find((item) => item.id === draft.activeSessionId); if (active) { active.geminiConversationUrl = null; active.geminiTurns = 0; active.geminiBootstrapped = false; } return draft; }); return json(res, 200, { reset: true }); }
    if (req.method === 'GET' && url.pathname === '/api/provider/models') {
      const provider = state.provider || {};
      if (!provider.baseUrl) return json(res, 400, { error: 'Provider base URL is not configured' });
      const keys = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', 'opencode-zen': 'OPENCODE_ZEN_API_KEY', '9router': 'NINEROUTER_API_KEY', custom: 'CUSTOM_API_KEY', groq: 'GROQ_API_KEY' };
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
      const input = await body(req); const { approvalId, toolCallId, runId, idempotencyKey, ...argumentsForTool } = input; let result;
      await updateState(async (draft) => { result = await executeToolCall({ id: toolCallId, toolName: 'composio.execute', arguments: argumentsForTool, source: 'api', runId, approvalId, requestedBy: 'local-operator', idempotencyKey }, { state: draft, request: `Execute Composio tool ${input.toolSlug || ''}` }); return draft; });
      const status = result.status === 'completed' ? 200 : result.status === 'waiting_for_approval' ? 202 : result.error?.code?.startsWith('APPROVAL_') ? 403 : result.error?.code === 'INVALID_ARGUMENTS' ? 400 : 502;
      return json(res, status, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/connections/auth/open') {
      const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ toolName: 'connections.auth.open', arguments: { platform: input.platform }, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: `Open ${input.platform || 'account'} sign-in` }); return draft; });
      return json(res, result.status === 'completed' ? 200 : result.error?.code === 'INVALID_ARGUMENTS' ? 400 : 503, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/memory') return json(res, 200, { memories: state.memories || [] });
    if (req.method === 'GET' && url.pathname === '/api/memory-graph') { await initializeJarvisVault(); await startMemoryGraphWatcher(); const graph = memoryGraph(); const active = { activeMemoryIds: state.runtime?.activeMemoryIds || [], activeMemoryAt: state.runtime?.activeMemoryAt || null }; if (Number(url.searchParams.get('revision')) === graph.revision) return json(res, 200, { unchanged: true, revision: graph.revision, ...active }); return json(res, 200, { ...graph, ...active }); }
    if (req.method === 'POST' && url.pathname === '/api/memory-graph/refresh') return json(res, 200, await scanMemoryGraph());
    if (req.method === 'GET' && url.pathname === '/api/memory-graph/note') return json(res, 200, await readVaultNote(url.searchParams.get('path') || ''));
    if (req.method === 'GET' && url.pathname === '/api/memory/search') {
      let result; await updateState(async (draft) => { result = await executeToolCall({ toolName: 'memory.search', arguments: { query: url.searchParams.get('q') || '' }, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: 'Search memory' }); return draft; });
      return json(res, result.status === 'completed' ? 200 : 400, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code });
    }
    if (req.method === 'POST' && url.pathname === '/api/memory') {
      const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ toolName: 'memory.store', arguments: input, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: 'Store memory' }); return draft; });
      return json(res, result.status === 'completed' ? 201 : 400, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code });
    }
    if (req.method === 'GET' && url.pathname === '/api/contacts') {
      let result; await updateState(async (draft) => { result = await executeToolCall({ toolName: 'contacts.list', arguments: {}, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: 'List saved contacts' }); return draft; });
      return json(res, result.status === 'completed' ? 200 : 400, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code });
    }
    if (req.method === 'POST' && url.pathname === '/api/contacts') {
      const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ toolName: 'contacts.upsert', arguments: input, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: `Save contact ${input.name || ''}` }); return draft; });
      return json(res, result.status === 'completed' ? 200 : 400, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code, runId: result.runId });
    }
    if (req.method === 'DELETE' && url.pathname.match(/^\/api\/contacts\/[^/]+$/)) { const id = decodeURIComponent(url.pathname.split('/').pop()); let result; await updateState(async (draft) => { result = await executeToolCall({ toolName: 'contacts.delete', arguments: { id }, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: 'Delete saved contact' }); return draft; }); return json(res, result.status === 'completed' ? 200 : result.status === 'waiting_for_approval' ? 202 : 400, result); }
    if (req.method === 'GET' && url.pathname === '/api/documents') return json(res, 200, { documents: (state.documents || []).map(({ content, ...metadata }) => ({ ...metadata, characters: content.length })) });
    if (req.method === 'POST' && url.pathname === '/api/documents') {
      const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ toolName: 'documents.ingest', arguments: input, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: `Ingest document ${input.name || input.path || 'untitled'}` }); return draft; });
      return json(res, result.status === 'completed' ? 201 : 400, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code, runId: result.runId });
    }
    if (req.method === 'GET' && url.pathname === '/api/permissions') return json(res, 200, { mode: state.permissionMode || 'normal', modes: ['normal','skip_permissions','full_permissions'], emergencyStop:Boolean(state.runtime?.emergencyStop),pending: state.approvals.filter((item)=>item.status==='pending').length, recent: (state.permissionAudit||[]).slice(0,25) });
    if (req.method === 'PATCH' && url.pathname === '/api/permissions') { const input=await body(req);const mode=normalizePermissionMode(input.mode);if(mode!==input.mode)return json(res,400,{error:'Invalid permission mode',code:'INVALID_ARGUMENTS'});const updated=await updateState((draft)=>{const previous=draft.permissionMode||'normal';draft.permissionMode=mode;draft.permissionAudit=[{id:`permission-${Date.now()}`,type:'permission.mode.changed',previous,mode,at:new Date().toISOString(),requestedBy:'local-operator'},...(draft.permissionAudit||[])].slice(0,200);return draft;});return json(res,200,{mode:updated.permissionMode,pending:updated.approvals.filter((item)=>item.status==='pending').length}); }
    if (req.method === 'POST' && url.pathname === '/api/emergency-stop') { const input=await body(req);const active=input.active!==false;cancelGeneration(state.activeSessionId);await Promise.all([chatGPTWebTransport().cancel(),geminiWebTransport().cancel()]);const updated=await updateState((draft)=>{draft.runtime??={};draft.runtime.emergencyStop=active;draft.permissionAudit=[{id:`permission-${Date.now()}`,type:active?'permission.emergency_stop':'permission.emergency_resume',at:new Date().toISOString(),requestedBy:'local-operator'},...(draft.permissionAudit||[])].slice(0,200);if(active)for(const approval of draft.approvals||[])if(approval.status==='pending'){approval.status='cancelled';approval.resolvedAt=new Date().toISOString();stopApprovalContinuation(draft.runs.find(item=>item.id===approval.runId),approval,'PERMISSION_DENIED');}return draft;});return json(res,200,{active:updated.runtime.emergencyStop,cancelledPending:active}); }
    if (req.method === 'GET' && url.pathname === '/api/adapters') return json(res, 200, adapterStatus());
    if (req.method === 'GET' && url.pathname === '/api/calendar/events') {
      let result; await updateState(async (draft) => { result = await executeToolCall({ toolName: 'calendar.list', arguments: {}, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: 'List calendar events' }); return draft; });
      return json(res, result.status === 'completed' ? 200 : 503, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code, runId: result.runId });
    }
    if (req.method === 'POST' && url.pathname === '/api/calendar/events') {
      const input = await body(req); const { approvalId, toolCallId, runId, ...action } = input; let result;
      await updateState(async (draft) => { result = await executeToolCall({ id: toolCallId, toolName: 'calendar.create', arguments: action, source: 'api', runId, approvalId, requestedBy: 'local-operator' }, { state: draft, request: `Create calendar event: ${action.title || action.text || 'untitled'}` }); return draft; });
      return json(res, result.status === 'completed' ? 200 : result.status === 'waiting_for_approval' ? 202 : result.error.code.startsWith('APPROVAL_') ? 403 : 503, result.status === 'completed' ? result.output : { approvalRequired: result.status === 'waiting_for_approval', approval: result.approval, toolCallId: result.toolCallId, runId: result.runId, error: result.error.message, code: result.error.code });
    }
    if (req.method === 'POST' && url.pathname === '/api/messages/send') {
      const input = await body(req); const { approvalId, toolCallId, runId, ...action } = input; let result;
      await updateState(async (draft) => { result = await executeToolCall({ id: toolCallId, toolName: 'messages.send', arguments: action, source: 'api', runId, approvalId, requestedBy: 'local-operator' }, { state: draft, request: `Send message to ${action.recipient || action.channel || 'configured recipient'}` }); return draft; });
      return json(res, result.status === 'completed' ? 200 : result.status === 'waiting_for_approval' ? 202 : result.error.code.startsWith('APPROVAL_') ? 403 : 503, result.status === 'completed' ? result.output : { approvalRequired: result.status === 'waiting_for_approval', approval: result.approval, toolCallId: result.toolCallId, runId: result.runId, error: result.error.message, code: result.error.code });
    }
    if (req.method === 'POST' && url.pathname === '/api/hardware/command') {
      const input = await body(req); const { approvalId, toolCallId, runId, ...action } = input; let result;
      await updateState(async (draft) => { result = await executeToolCall({ id: toolCallId, toolName: 'hardware.command', arguments: action, source: 'api', runId, approvalId, requestedBy: 'local-operator' }, { state: draft, request: `Execute hardware command ${action.command || ''}` }); return draft; });
      return json(res, result.status === 'completed' ? 200 : result.status === 'waiting_for_approval' ? 202 : result.error?.code?.startsWith('APPROVAL_') ? 403 : result.error?.code === 'CONFIGURATION_MISSING' ? 503 : 502, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/mcp') {
      const request = await body(req); let response;
      if (request.method === 'tools/call') await updateState(async (draft) => { response = await handleMcpRequest(request, { state: draft }); return draft; });
      else response = await handleMcpRequest(request, { state });
      return response ? json(res, 200, response) : json(res, 204, {});
    }
    if (req.method === 'POST' && url.pathname === '/api/memory/index') {
      const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ toolName: 'memory.index', arguments: input, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: `Index memory ${input.id || ''}` }); return draft; });
      return json(res, result.status === 'completed' ? 200 : result.error?.code === 'INVALID_ARGUMENTS' ? 404 : 400, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code, runId: result.runId });
    }
    if (req.method === 'GET' && url.pathname === '/api/memory/vector-search') return json(res, 200, { memories: vectorSearch(state.memories || [], url.searchParams.get('q') || '') });
    if (req.method === 'POST' && url.pathname === '/api/research/search') {
      const input = await body(req); const query = String(input.query || '').trim();
      if (!query) return json(res, 400, { error: 'query is required' });
      let result; await updateState(async (draft) => { result = await executeToolCall({ toolName: 'research.search', arguments: { query }, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: query }); return draft; });
      return json(res, result.status === 'completed' ? 200 : 503, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code, runId: result.runId });
    }
    if (req.method === 'POST' && url.pathname === '/api/events') {
      const input = await body(req); const type = String(input.type || '').trim();
      if (!type) return json(res, 400, { error: 'type is required' });
      let dispatch;
      await updateState(async (draft) => { dispatch = await dispatchWorkflowEvent(draft, input); return draft; });
      return json(res, dispatch.duplicate ? 200 : 202, { accepted: true, duplicate: dispatch.duplicate, type, eventId: dispatch.event.id, runs: dispatch.runs.map((run) => run.runId || run.id) });
    }
    if (req.method === 'GET' && url.pathname === '/api/capabilities') return json(res, 200, { assistant: 'JARVIS', capabilities: listCapabilities() });
    if (req.method === 'GET' && url.pathname === '/api/tools') return json(res, 200, { tools: listTools() });
    if (req.method === 'GET' && url.pathname === '/api/workflows') return json(res, 200, { workflows: state.workflows || [], summary: workflowSummary(state.workflows || []) });
    if (req.method === 'POST' && url.pathname === '/api/workflows') {
      const input = await body(req); const workflow = { id: `workflow-${Date.now()}`, name: String(input.name || 'Untitled workflow'), trigger: String(input.trigger || 'Manual'), triggerConditions: Array.isArray(input.triggerConditions) ? input.triggerConditions.slice(0, 10).map((condition) => ({ path: String(condition.path || ''), operator: String(condition.operator || 'eq'), value: condition.value })) : [], conditionMode: input.conditionMode === 'any' ? 'any' : 'all', runs: 0, state: 'active', steps: Array.isArray(input.steps) ? input.steps.slice(0, 20).map((step, index) => ({ id: String(step?.id || `step-${index + 1}`), description: String(step?.description || step?.name || step?.toolName || step?.tool || ''), toolName: String(step?.toolName || step?.tool || ''), arguments: step?.arguments && typeof step.arguments === 'object' ? step.arguments : {}, dependsOn: Array.isArray(step?.dependsOn) ? step.dependsOn.map(String).slice(0, 10) : [], maxRetries: Math.max(0, Math.min(3, Number(step?.maxRetries || 0))) })) : [], dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn.map(String).slice(0, 10) : [], schedule: input.schedule?.enabled ? { enabled: true, intervalSeconds: Math.max(10, Number(input.schedule.intervalSeconds || 3600)), maxRetries: Math.min(3, Number(input.schedule.maxRetries || 0)) } : { enabled: false }, lastRun: null };
      if (!workflow.steps.length || workflow.steps.some((step) => !step.toolName)) return json(res, 400, { error: 'Workflow steps must include toolName and structured arguments', code: 'INVALID_ARGUMENTS' });
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
    if (req.method === 'POST' && url.pathname === '/api/scheduler/tick') {
      let runs; const tickedAt = new Date().toISOString();
      await updateState(async (draft) => { runs = await tick(draft); lastSchedulerTick = tickedAt; return draft; });
      return json(res, 200, { runs, tickedAt });
    }
    if (req.method === 'POST' && url.pathname === '/api/tools/execute') {
      const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ id: input.toolCallId, toolName: String(input.toolName || input.toolId || ''), arguments: input.arguments || input.input || {}, source: input.source || 'api', runId: input.runId, stepId: input.stepId, approvalId: input.approvalId, requestedBy: input.requestedBy || 'local-operator', idempotencyKey: input.idempotencyKey }, { state: draft, request: input.request || `Execute ${input.toolName || input.toolId || 'tool'}`, requestedBy: input.requestedBy || 'local-operator' }); return draft; });
      const status = result.status === 'completed' ? 200 : result.status === 'waiting_for_approval' ? 202 : result.error?.code?.startsWith('APPROVAL_') ? 403 : result.error?.code === 'INVALID_ARGUMENTS' ? 400 : result.error?.code === 'TOOL_NOT_FOUND' ? 404 : 503;
      return json(res, status, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      let result; await updateState(async (draft) => { result = await executeToolCall({ toolName: 'tasks.list', arguments: {}, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: 'List tasks' }); return draft; });
      return json(res, 200, result.output);
    }
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ toolName: 'tasks.create', arguments: input, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: `Create task: ${input.title || ''}` }); return draft; });
      return json(res, result.status === 'completed' ? 201 : 400, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code, runId: result.runId });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/tasks/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req); let result;
      await updateState(async (draft) => { result = await executeToolCall({ toolName: 'tasks.update', arguments: { id, ...input }, source: 'api', requestedBy: 'local-operator' }, { state: draft, request: `Update task ${id}` }); return draft; });
      return json(res, result.status === 'completed' ? 200 : 404, result.status === 'completed' ? result.output : { error: result.error.message, code: result.error.code, runId: result.runId });
    }
    if (req.method === 'GET' && url.pathname === '/api/approvals') return json(res, 200, { approvals: state.approvals.filter((item) => item.status === 'pending') });
    if (req.method === 'POST' && url.pathname.startsWith('/api/approvals/')) {
      const id = url.pathname.split('/').pop(); const input = await body(req);
      const resolved = await resolveApprovalTransaction(state, id, input.outcome);
      return json(res, resolved.status, resolved.body);
    }
    if (req.method === 'GET' && url.pathname === '/api/activity') return json(res, 200, { activity: state.activity || [] });
    if (req.method === 'GET' && url.pathname === '/api/generation/events') return json(res, 200, { events: generationEvents({ after: url.searchParams.get('after') || 0, sessionId: url.searchParams.get('sessionId') || null }) });
    if (req.method === 'POST' && url.pathname === '/api/generation/cancel') {
      const input = await body(req); const sessionId = input.sessionId || state.activeSessionId; const signalled = cancelGeneration(sessionId);
      const [chatgpt, gemini] = await Promise.all([chatGPTWebTransport().cancel(), geminiWebTransport().cancel()]);
      await updateState((draft) => { const run = (draft.runs || []).find((item) => item.conversationId === sessionId && ['planning', 'running', 'queued'].includes(item.status)); if (run) { run.status = 'cancelled'; run.completedAt = new Date().toISOString(); run.events ??= []; run.events.push({ type: 'run.cancelled', at: run.completedAt, reason: 'user_cancelled' }); } return draft; });
      return json(res, 200, { cancelled: signalled || chatgpt.cancelled || gemini.cancelled, backends: { chatgpt: chatgpt.cancelled, gemini: gemini.cancelled } });
    }
    if (req.method === 'GET' && url.pathname === '/api/sessions') { ensureChatSessions(state); return json(res, 200, { sessions: state.chatSessions, activeSessionId: state.activeSessionId }); }
    if (req.method === 'POST' && url.pathname === '/api/sessions') { const input = await body(req); let session; await updateState((draft) => { session = createChatSession(draft, input); return draft; }); return json(res, 201, { session }); }
    if (req.method === 'PATCH' && url.pathname.match(/^\/api\/sessions\/[^/]+$/)) { const id = decodeURIComponent(url.pathname.split('/').pop()); let session; await updateState((draft) => { ensureChatSessions(draft); session = touchSession(draft, id); draft.activeSessionId = id; return draft; }); return json(res, 200, { session }); }
    if (req.method === 'GET' && url.pathname === '/api/chats') { ensureChatSessions(state); const conversationId = url.searchParams.get('sessionId') || state.activeSessionId; return json(res, 200, { messages: sessionMessages(state, conversationId), conversationId }); }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const input = await body(req); const text = String(input.message || '').trim();
      if (!text) return json(res, 400, { error: 'message is required' });
      ensureChatSessions(state); const conversationId = input.conversationId || state.activeSessionId; touchSession(state, conversationId, text);
      const messagingChoice = pendingMessagingResolution(state, text, { sessionId: conversationId });
      if (messagingChoice?.multiple) return json(res, 409, { error: 'Multiple messaging actions need recipient clarification. Choose one from the pending actions.', code: 'MULTIPLE_PENDING_MESSAGING_INTENTS' });
      if (messagingChoice?.invalidSelection) return json(res, 400, { error: `Choose a number from 1 to ${messagingChoice.intent.candidates.length}.`, code: 'INVALID_RECIPIENT_SELECTION' });
      if (messagingChoice?.intent) {
        let resumedResult; let resumedReply;
        await updateState(async (draft) => {
          const intent = (draft.pendingMessagingIntents || []).find((item) => item.id === messagingChoice.intent.id);
          if (!intent || intent.status !== 'AMBIGUOUS_RECIPIENT') return draft;
          intent.status = 'READY_FOR_POLICY'; intent.selectedAt = new Date().toISOString(); intent.selectedIndex = messagingChoice.index;
          const argumentsForTool = resolvedIntentArguments(intent, messagingChoice.candidate);
          resumedResult = await executeToolCall({ id: intent.toolCallId, toolName: 'communication.send', arguments: argumentsForTool, source: 'recipient-clarification', runId: intent.runId, stepId: intent.stepId, requestedBy: 'local-operator', idempotencyKey: intent.idempotencyKey }, { state: draft, request: draft.runs.find((item) => item.id === intent.runId)?.request || 'Resume messaging action', conversationId, sessionId: conversationId, originatingBackend: intent.originatingBackend });
          intent.status = resumedResult.status === 'waiting_for_approval' ? 'WAITING_APPROVAL' : resumedResult.status === 'completed' ? 'SUCCEEDED' : 'FAILED';
          intent.message = '[REDACTED]'; intent.originalArguments = { redacted: true };
          resumedReply = formatToolReply(resumedResult, argumentsForTool);
          draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [text], conversationId }, { who: 'JARVIS', time: new Date().toISOString(), lines: [resumedReply], conversationId, runId: resumedResult.runId });
          return draft;
        });
        const resumedStatus = resumedResult?.status === 'completed' ? 200 : ['waiting_for_approval','waiting_for_clarification'].includes(resumedResult?.status) ? 202 : 503;
        return json(res, resumedStatus, { reply: resumedReply, assistant: 'JARVIS', grounded: true, resumedMessagingIntent: true, runId: resumedResult?.runId, toolResult: resumedResult, approval: resumedResult?.approval || null });
      }
      const approvalIntent = pendingApprovalResolution(state, text, { sessionId: conversationId });
      if (approvalIntent?.pending?.length > 1) return json(res, 409, { error: 'Multiple actions are waiting for approval. Choose one in Approvals.', code: 'MULTIPLE_PENDING_APPROVALS', approvals: approvalIntent.pending.map((item)=>({id:item.id,title:item.title,toolName:item.toolName,createdAt:item.createdAt,expiresAt:item.expiresAt})) });
      if (approvalIntent?.approval) { const resolved=await resolveApprovalTransaction(state,approvalIntent.approval.id,approvalIntent.outcome);return json(res,resolved.status,{...resolved.body,assistant:'JARVIS',grounded:true,interceptedApproval:true}); }
      const routeStarted = performance.now();
      const routeHistory = sessionMessages(state, conversationId);
      const deterministicRoute = contextualToolRoute(text,state)||routeRequest(text, { source: input.source === 'voice' ? 'voice' : 'chat' });
      const routeDecision = await routeIncomingRequest(text, { source: input.source === 'voice' ? 'voice' : 'chat', deterministicRoute, history: routeHistory });
      const route = ['DETERMINISTIC', 'NEEDLE'].includes(routeDecision.route)
        ? { route: 'TOOL_CALL', capability: routeDecision.tool, args: routeDecision.arguments, confidence: routeDecision.confidence, layer: routeDecision.route, reason: routeDecision.reason }
        : { route: 'MODEL', capability: null, args: {}, confidence: routeDecision.confidence, layer: routeDecision.route, reason: routeDecision.reason };
      if (process.env.JARVIS_ROUTER_DEBUG === 'true') console.log(`[JARVIS ROUTER] ${routeDecision.route.toLowerCase()}${routeDecision.tool ? ` -> ${routeDecision.tool}` : ''} reason=${routeDecision.reason}${routeDecision.confidence ? ` confidence=${routeDecision.confidence.toFixed(2)}` : ''}`);
      if (route.route === 'TOOL_CALL') {
        let canonicalResult; let canonicalReply;
        await updateState(async (draft) => {
          canonicalResult = await executeToolCall({ toolName: route.capability, arguments: route.args, source: input.source === 'voice' ? 'voice' : route.layer === 'NEEDLE' ? 'needle-router' : 'deterministic-router', requestedBy: 'local-operator' }, { state: draft, request: text, conversationId });
          canonicalReply = formatToolReply(canonicalResult, route.args);
          draft.runtime ??= {}; draft.runtime.usage ??= { requests: 0, tokens: 0, cost: 0 }; draft.runtime.usage.requests += 1; draft.runtime.latency ??= {}; draft.runtime.latency.routerMs = routeDecision.routerMs ?? Math.round((performance.now() - routeStarted) * 100) / 100; draft.runtime.latency.needleMs = routeDecision.needleMs || 0; draft.runtime.latency.totalMs = Math.round((performance.now() - routeStarted) * 100) / 100; draft.runtime.lastRequestRoute = { route: routeDecision.route, reason: routeDecision.reason, confidence: routeDecision.confidence, tool: routeDecision.tool || null, routerMs: routeDecision.routerMs, needleMs: routeDecision.needleMs || 0, at: new Date().toISOString() };
          draft.conversations ??= []; draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [text], conversationId }, { who: 'JARVIS', time: new Date().toISOString(), lines: [canonicalReply], media: canonicalResult.output?.media || null, conversationId, runId: canonicalResult.runId }); draft.conversations = draft.conversations.slice(-500);
          return draft;
        });
        const canonicalStatus = canonicalResult.status === 'completed' ? 200 : ['waiting_for_approval','waiting_for_clarification'].includes(canonicalResult.status) ? 202 : canonicalResult.error?.code === 'INVALID_ARGUMENTS' ? 400 : 503;
        return json(res, canonicalStatus, { reply: canonicalReply, assistant: 'JARVIS', grounded: true, runId: canonicalResult.runId, route, toolResult: canonicalResult, approval: canonicalResult.approval || null, media: canonicalResult.output?.media || null, ...(canonicalResult.error && canonicalResult.status !== 'waiting_for_approval' ? { error: canonicalResult.error.message, code: canonicalResult.error.code } : {}) });

      }
      const run = await beginRun(state, { request: text, type: 'chat', conversationId });
      run.status = 'running';
      let createdTask = null;
      let reply = '';
      let providerResult = null; let modelRoute = null; let modelFailure = null; let modelWaitingApproval = false; let modelToolFailure = false;
      if (!createdTask) {
        const modelStarted = performance.now();
        modelRoute = await selectLogicalModelWithClassifier(text, { ...(state.modelRouting || {}), chatgptWeb: state.chatgptWeb || {}, geminiWeb: state.geminiWeb || {}, brainBackends: state.brainBackends || {} }, { hasMedia: Boolean(input.attachments?.length) }, state);
        if (routeDecision.route === 'CHATGPT' && state.modelRouting?.modelMode !== 'manual' && state.chatgptWeb?.enabled === true && !modelRoute.requiresMultimodal) modelRoute = { ...modelRoute, primaryModel: 'chatgpt-web', supportModels: [], reason: `${modelRoute.reason} Local routing escalated to the configured ChatGPT Headless brain.` };
        const history = routeHistory;
        const assembledContext = assembleModelContext({ query: text, conversations: history, memories: state.memories || [], includeTools: modelRoute.requiresTools });
        const generation = beginGeneration(conversationId, { runId: run.id, backend: modelRoute.primaryModel });
        const streamEvent = state.brainBackends?.streaming === false ? null : publishGenerationEvent;
        try {
          providerResult = shouldUseModelToolLoop(modelRoute)
            ? await executeModelToolLoop({ route: modelRoute, request: text, context: assembledContext.context, history, state, run, attachments: input.attachments || [], allowFallback: state.modelRouting?.manualFallbackAllowed !== false, executeModel: executeBrainModel, maxRounds: Math.max(1, Number(process.env.JARVIS_CHATGPT_MAX_TOOL_STEPS || 4)), maxCalls: Math.max(1, Number(process.env.JARVIS_CHATGPT_MAX_CALLS_PER_STEP || 4)) * Math.max(1, Number(process.env.JARVIS_CHATGPT_MAX_TOOL_STEPS || 4)), checkpoint: () => updateState((draft) => draft), onEvent: streamEvent, signal: generation.signal })
            : await executeModelDelegation({ route: modelRoute, request: text, context: assembledContext.context, continuationState: { runId: run.id, conversationId, plan: run.plan, currentStep: run.currentStep, completedToolCalls: run.toolCalls.filter((call) => call.status === 'completed').map((call) => ({ id: call.id, tool: call.toolName, verified: call.verified })) }, state, attachments: input.attachments || [], allowFallback: state.modelRouting?.manualFallbackAllowed !== false, execute: executeBrainModel, signal: generation.signal, onEvent: streamEvent });
          modelWaitingApproval = providerResult.status === 'waiting_for_approval';
          modelToolFailure = providerResult.status === 'failed';
          reply = providerResult.reply; run.provider = providerResult.provider; run.model = providerResult.logicalModel;
          if (modelWaitingApproval) run.status = 'waiting_for_approval';
          const toolMs = run.toolCalls.reduce((sum, call) => sum + Number(call.latencyMs || 0), 0); const verificationMs = (state.runtime?.toolTelemetry || []).filter((item) => item.runId === run.id).reduce((sum, item) => sum + Number(item.verificationMs || 0), 0); const policyMs = (state.runtime?.toolTelemetry || []).filter((item) => item.runId === run.id).reduce((sum, item) => sum + Number(item.policyMs || 0), 0);
          run.routing = { ...modelRoute, ...providerResult.routingTelemetry, ...assembledContext.telemetry, requestRoute: routeDecision.route, requestRouteReason: routeDecision.reason, needleMs: routeDecision.needleMs || 0, routingConfidence: routeDecision.confidence || modelRoute.confidence, routingReason: routeDecision.reason || modelRoute.reason, routerProviderAttempts: modelRoute.classifierTelemetry?.providerAttempts || [], routerMs: routeDecision.routerMs ?? (modelRoute.classifierTelemetry?.providerAttempts || []).reduce((sum, attempt) => sum + Number(attempt.latencyMs || 0), 0), modelMs: Math.round(performance.now() - modelStarted), toolMs, verificationMs, policyMs, databaseMs: assembledContext.telemetry.memoryMs, totalMs: Math.round(performance.now() - routeStarted), inputTokens: providerResult.inputTokens || 0, outputTokens: providerResult.outputTokens || 0, toolCalls: run.toolCalls.length };
        } catch (error) {
          let terminalError = error;
          if (error.code === 'MODEL_CAPACITY_EXHAUSTED' && !modelRoute.requiresTools && !run.toolCalls.length && publicProvider(state.provider).configured) {
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
            if (terminalError.code === 'EXECUTION_CANCELLED' || generation.signal.aborted) {
              run.status = 'cancelled'; run.completedAt ||= new Date().toISOString();
              run.events ??= []; if (!run.events.some((event) => event.type === 'run.cancelled')) run.events.push({ type: 'run.cancelled', at: run.completedAt, reason: 'user_cancelled' });
            } else errorRun(run, terminalError);
            reply = modelFailureReply(terminalError, run.id);
          }
        } finally { releaseGeneration(conversationId); }
      }
      await updateState((draft) => { draft.runtime ??= { startedAt: new Date().toISOString(), usage: { requests: 0, tokens: 0, cost: 0 } }; draft.runtime.usage ??= { requests: 0, tokens: 0, cost: 0 }; draft.runtime.usage.requests += 1; draft.runtime.usage.tokens += providerResult?.tokens || 0; draft.runtime.usage.cost += providerResult?.cost || 0; if (run.routing) { draft.modelRouting ??= { telemetry: [], providerHealth: {} }; draft.modelRouting.providerHealth = state.modelRouting?.providerHealth || {}; draft.modelRouting.telemetry = [{ requestId: run.id, runId: run.id, timestamp: new Date().toISOString(), ...run.routing, success: !modelFailure && !modelToolFailure }, ...(draft.modelRouting.telemetry || [])].slice(0, 200); draft.runtime.lastModelRoute = run.routing; draft.runtime.latency ??= {}; Object.assign(draft.runtime.latency, { routerMs: run.routing.routerMs || 0, modelMs: run.routing.modelMs || 0, toolMs: run.routing.toolMs || 0, policyMs: run.routing.policyMs || 0, verificationMs: run.routing.verificationMs || 0, databaseMs: run.routing.databaseMs || 0, totalMs: run.routing.totalMs || 0, samples: Number(draft.runtime.latency.samples || 0) + 1 }); } draft.conversations ??= []; const modelIndicator = run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null; const routingDebug = process.env.JARVIS_ROUTER_DEBUG === 'true' && run.routing ? { taskType: run.routing.taskType, confidence: run.routing.routingConfidence, apiRotationCount: run.routing.apiRotationCount, modelFallbackUsed: run.routing.modelFallbackUsed, totalMs: run.routing.totalMs } : null; draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [text], conversationId, runId: run.id }, { who: 'JARVIS', time: new Date().toISOString(), lines: [reply], modelIndicator, routingDebug, conversationId, runId: run.id }); draft.conversations = draft.conversations.slice(-500); touchSession(draft, conversationId, text); return draft; });
      if (!modelFailure && !modelWaitingApproval && !modelToolFailure) finishRun(run, { reply, task: createdTask, toolCalls: run.toolCalls.map((call) => ({ id: call.id, toolName: call.toolName, status: call.status, verified: call.verified })) }, providerResult ? { input: providerResult.inputTokens, output: providerResult.outputTokens, total: providerResult.tokens } : { total: 0 });
      else if (modelToolFailure && run.status !== 'failed') errorRun(run, new Error(`Tool execution failed: ${(providerResult.unrecoveredFailures || []).map((item) => `${item.toolName}:${item.error?.code || item.status}`).join(', ') || 'unverified tool result'}`));
      if (modelFailure) failGeneration(conversationId, modelFailure, { runId: run.id, backend: modelRoute?.primaryModel });
      else if (modelWaitingApproval) publishGenerationEvent({ type: 'generation.waiting_for_approval', sessionId: conversationId, runId: run.id, backend: run.model });
      else finishGeneration(conversationId, { runId: run.id, backend: run.model, status: modelToolFailure ? 'failed' : 'completed' });
      await updateState((draft) => { const stored = draft.runs?.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
      return json(res, modelFailure ? (modelFailure.code === 'REQUEST_ERROR' ? 400 : 503) : modelWaitingApproval ? 202 : 200, { reply, task: createdTask, assistant: 'JARVIS', grounded: true, executionStatus: modelWaitingApproval ? 'waiting_for_approval' : modelToolFailure ? 'failed' : 'completed', runId: run.id, intent: run.plan.intent, plan: run.plan, model: run.model, approval: providerResult?.approval || null, modelIndicator: run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null, routing: process.env.JARVIS_ROUTER_DEBUG === 'true' ? run.routing : undefined });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { const code=error?.code==='REQUEST_ERROR'?'INVALID_ARGUMENTS':TOOL_ERROR_CODES.has(error?.code)?error.code:null;const status=code==='INVALID_ARGUMENTS'?400:code==='AUTHENTICATION_REQUIRED'?401:code==='PERMISSION_DENIED'?403:code==='CONNECTION_UNAVAILABLE'||code==='CONFIGURATION_MISSING'?503:500;if(!code)console.error(error);return json(res,status,code?{error:error.message,code}:{error:'Internal JARVIS service error'}); }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') { console.error(`JARVIS could not start because port ${port} is already in use. If /api/health responds, JARVIS is already running.`); process.exitCode = 1; return; }
  console.error(`JARVIS server error: ${error.message}`); process.exitCode = 1;
});
server.listen(port, host, () => {
  if (requestedHost !== host) console.warn('JARVIS refused LAN binding: set JARVIS_PHONE_BRIDGE_ALLOW_LAN=1, JARVIS_AUTH_TOKEN, and a 32+ character PHONE_BRIDGE_MASTER_KEY first.');
  console.log(`JARVIS service listening on http://${host}:${server.address().port}`);
  if (String(process.env.JARVIS_NEEDLE_ENABLED || 'true').toLowerCase() !== 'false') needleProvider().initialize(needleEligibleTools()).then(() => console.log('[JARVIS NEEDLE] local router ready')).catch((error) => console.warn(`[JARVIS NEEDLE] startup degraded; requests will fall back safely: ${error.message}`));
});

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
