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

export default async function systemRoutes(req, res, url, state, ctx) {
  const { json, body, recordActivity, modelFailureReply, publicProvider, connectionStatus, authorized, uptimeSeconds, desktopErrorStatus, processSchedulerTick, lastSchedulerTick, schedulerEnabled, schedulerInterval, port } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, { projects: await listProjectStatus() });
    if (req.method === 'GET' && url.pathname === '/api/messaging/status') return json(res, 200, { configured: Boolean(process.env.MESSAGING_API_URL || process.env.SLACK_WEBHOOK_URL || process.env.SLACK_BOT_TOKEN), whatsappConnected: false, message: 'WhatsApp provider is not connected' });
    if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, publicConfig());
    if (req.method === 'PATCH' && url.pathname === '/api/config') { const config = saveConfig(await body(req)); return json(res, 200, config); }
    const sourceRoute = url.pathname.match(/^\/api\/brain\/sources\/([^/]+)(?:\/(credentials|test|models))?(?:\/([^/]+))?(?:\/(test))?$/);
    if (sourceRoute) {
        const [, sourceId, action, credentialId, trailing] = sourceRoute;
        try {
          if (!action && req.method === 'PATCH') return json(res, 200, { source: brainCatalog.updateSource(sourceId, await body(req)) });
          if (!action && req.method === 'DELETE') { brainCatalog.removeSource(sourceId); await updateState((draft) => { if (draft.modelRouting?.lockedSourceId === sourceId) draft.modelRouting.lockedSourceId = null; return draft; }); return json(res, 200, { removed: true }); }
          if (action === 'credentials' && !credentialId && req.method === 'POST') return json(res, 201, { credential: brainCatalog.addCredential(sourceId, await body(req)) });
          if (action === 'credentials' && credentialId && req.method === 'PATCH') return json(res, 200, { credential: brainCatalog.updateCredential(sourceId, credentialId, await body(req)) });
          if (action === 'credentials' && credentialId && req.method === 'DELETE') { brainCatalog.removeCredential(sourceId, credentialId); return json(res, 200, { removed: true }); }
          if ((action === 'test' || action === 'credentials' && trailing === 'test') && req.method === 'POST') { const result = await testBrainSource(sourceId, action === 'credentials' ? credentialId : null); await updateState((draft) => { draft.modelRouting ??= {}; draft.modelRouting.providerHealth ??= {}; draft.modelRouting.providerHealth[`brain-${credentialId || sourceId}`] = { status: result.status, pricingType: result.pricingType || null, lastCheckedAt: new Date().toISOString() }; return draft; }); return json(res, 200, { result }); }
          if (action === 'models' && req.method === 'GET') return json(res, 200, await discoverBrainModels(sourceId));
        } catch (error) { if (error.code?.startsWith('BRAIN_')) return json(res, error.code.endsWith('NOT_FOUND') ? 404 : 400, { code: error.code, error: error.message }); throw error; }
      }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'jarvis', assistant: 'JARVIS', mode: 'local', uptimeSeconds: uptimeSeconds(), at: new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/api/system/metrics') return json(res, 200, systemMetrics());
    if (req.method === 'GET' && url.pathname === '/api/telemetry') return json(res, 200, { uptimeSeconds: uptimeSeconds(), usage: state.runtime?.usage || { requests: 0, tokens: 0, cost: 0 }, latency: state.runtime?.latency || {}, provider: publicProvider(state.provider), modelRouting: { mode: state.modelRouting?.modelMode || 'auto', jarvisMode: state.modelRouting?.jarvisMode || 'normal', manualModel: state.modelRouting?.manualModel || null, last: state.runtime?.lastModelRoute || null } });
    if (req.method === 'GET' && url.pathname === '/api/connections') return json(res, 200, { connections: connectionStatus(state.provider) });
    if (req.method === 'GET' && url.pathname === '/api/diagnostics') return json(res, 200, diagnostics(state));
    if (req.method === 'GET' && url.pathname === '/api/integrations') return json(res, 200, { integrations: integrationStatus(state) });
    if (req.method === 'GET' && url.pathname === '/api/permissions') return json(res, 200, { mode: 'assisted', consequential: ['command.execute', 'browser.evaluate', 'messages.send', 'calendar.create', 'mcp.call', 'composio.execute'], default: 'deny' });
    if (req.method === 'GET' && url.pathname === '/api/adapters') return json(res, 200, adapterStatus());
    if (req.method === 'GET' && url.pathname === '/api/capabilities') return json(res, 200, { assistant: 'JARVIS', capabilities: listCapabilities(), status: capabilityStatus(state, { brainSources: brainCatalog.list(), web: webAiStatus() }) });
    if (req.method === 'GET' && url.pathname === '/api/capabilities/status') return json(res, 200, { status: capabilityStatus(state, { brainSources: brainCatalog.list(), web: webAiStatus() }) });
    if (req.method === 'GET' && url.pathname === '/api/tools') return json(res, 200, { tools: listTools() });
    if (req.method === 'GET' && url.pathname === '/api/scheduler') return json(res, 200, { enabled: schedulerEnabled, intervalSeconds: schedulerInterval / 1000, lastTickAt: lastSchedulerTick });
    if (req.method === 'POST' && url.pathname === '/api/scheduler/tick') { const result = await processSchedulerTick(); return json(res, 200, { ...result, tickedAt: lastSchedulerTick }); }
    if (req.method === 'GET' && url.pathname === '/api/reminders') return json(res, 200, { reminders: state.reminders || [] });
    if (req.method === 'POST' && url.pathname === '/api/tools/execute') {
        const result = await executeApiTool(state, await body(req));
        return json(res, result.status, result.body);
      }
    if (req.method === 'GET' && url.pathname === '/api/activity') return json(res, 200, { activity: state.activity || [] });

  return false;
}
