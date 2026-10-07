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
import { isCameraActive, engageKillSwitch, resetKillSwitch } from '../cameraUnderstanding.js';

export default async function deviceRoutes(req, res, url, state, ctx) {
  const { json, body, recordActivity, modelFailureReply, publicProvider, connectionStatus, authorized, uptimeSeconds, desktopErrorStatus, processSchedulerTick, lastSchedulerTick, schedulerEnabled, schedulerInterval, port } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/device/status') return json(res, 200, deviceStatus(state));
  if (req.method === 'GET' && url.pathname === '/api/camera/status') return json(res, 200, { active: isCameraActive() });
  if (req.method === 'POST' && url.pathname === '/api/camera/kill') {
      const input = await body(req);
      if (input.action === 'engage') engageKillSwitch();
      else if (input.action === 'reset') resetKillSwitch();
      return json(res, 200, { ok: true });
  }
    if (req.method === 'GET' && url.pathname === '/api/media/jobs') return json(res, 200, { jobs: (state.mediaJobs || []).map(({ operationName, credentialSlot, downloadUri, ...job }) => ({ ...job, downloadUri: downloadUri ? `/api/media/jobs/${job.id}/download` : null })), configured: Boolean(process.env.GEMINI_API_KEY) });
    if (req.method === 'POST' && url.pathname === '/api/device/pair') {
        const input = await body(req); let result;
        try { await updateState((draft) => { result = pairDevice(draft, input); return draft; }); }
        catch (error) { return json(res, 403, { error: error.message, code: error.code || 'DEVICE_PAIRING_DENIED' }); }
        return json(res, 201, result);
      }
    if (req.method === 'POST' && url.pathname === '/api/device/revoke') {
        const input = await body(req); let revoked = false;
        await updateState((draft) => { revoked = revokeDevice(draft, String(input.deviceId || '')); return draft; });
        return revoked ? json(res, 200, { revoked: true }) : json(res, 404, { error: 'Device not found' });
      }
    if (req.method === 'GET' && url.pathname.startsWith('/api/generated/')) { const fileName = url.pathname.split('/').pop(); const media = await readGeneratedMedia(fileName); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.match(/^\/api\/media\/jobs\/[^/]+\/download$/)) { const id = url.pathname.split('/')[4]; const job = (state.mediaJobs || []).find((item) => item.id === id); if (!job) return json(res, 404, { error: 'Media job not found' }); const media = await downloadVideoJob(job); res.writeHead(200, { 'content-type': media.contentType, 'content-length': media.content.length, 'cache-control': 'private, max-age=3600' }); return res.end(media.content); }
    if (req.method === 'GET' && url.pathname.startsWith('/api/media/jobs/')) { const id = url.pathname.split('/').pop(); const existing = (state.mediaJobs || []).find((job) => job.id === id); if (!existing) return json(res, 404, { error: 'Media job not found' }); const job = await refreshVideoJob(existing); await updateState((draft) => { const index = (draft.mediaJobs || []).findIndex((item) => item.id === id); if (index >= 0) draft.mediaJobs[index] = job; return draft; }); return json(res, 200, { job: { ...job, operationName: undefined, credentialSlot: undefined, downloadUri: job.downloadUri ? `/api/media/jobs/${job.id}/download` : null } }); }
    if (req.method === 'GET' && url.pathname === '/api/voice/status') return json(res, 200, { enabled: process.env.JARVIS_VOICE === '1', wakeword: process.env.JARVIS_WAKEWORD_MODEL || 'hey_jarvis', stt: process.env.JARVIS_STT_MODEL || 'whisper-small', tts: process.env.JARVIS_TTS || 'piper' });
    if (req.method === 'GET' && url.pathname === '/api/voice/tts') return json(res, 200, ttsStatus());
    if (req.method === 'POST' && url.pathname === '/api/voice/tts') {
        const result = await synthesizeSpeech(await body(req));
        res.writeHead(200, { 'content-type': result.contentType, 'content-length': result.audio.length, 'cache-control': 'no-store' });
        return res.end(result.audio);
      }
    if (req.method === 'POST' && url.pathname === '/api/voice/transcribe') return json(res, 200, await transcribeAudio(await body(req)));
    if (req.method === 'GET' && url.pathname === '/api/browser/status') return json(res, 200, browserManager.getStatus());
    if (req.method === 'POST' && url.pathname === '/api/messages/send') {
        const input = await body(req);
        const { approvalId, idempotencyKey, runId, ...toolInput } = input;
        const result = await invokeToolRequest(state, { toolId: 'messages.send', input: toolInput, approvalId, idempotencyKey, runId });
        return json(res, result.status, result.status === 200 ? result.body.data : result.body);
      }
    if (req.method === 'POST' && url.pathname === '/api/hardware/command') return json(res, 501, { code: 'HARDWARE_CAPABILITY_UNAVAILABLE', error: 'Hardware commands need a paired capability-scoped device provider.' });

  return false;
}
