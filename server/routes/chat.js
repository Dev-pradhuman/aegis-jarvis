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

export default async function chatRoutes(req, res, url, state, ctx) {
  const { json, body, recordActivity, modelFailureReply, publicProvider, connectionStatus, authorized, uptimeSeconds, desktopErrorStatus, processSchedulerTick, lastSchedulerTick, schedulerEnabled, schedulerInterval, port } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/mcp/servers') return json(res, 200, { servers: await discoverMcpServers() });
    if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: (state.modelRouting?.telemetry || []).flatMap((route) => (route.delegations || []).map((stage, index) => ({ id: `${route.runId || route.requestId}-${index}`, name: stage.logicalModel, status: route.success === false ? 'failed' : 'completed', provider: stage.provider, runId: route.runId || route.requestId, at: route.timestamp }))).slice(0, 50), dynamicAgentsAvailable: false });
    if (req.method === 'POST' && url.pathname === '/api/device/events') {
        const input = await body(req); let result;
        try { await updateState((draft) => { result = ingestDeviceEvent(draft, req.headers.authorization?.replace(/^Bearer\s+/i, ''), input); return draft; }); }
        catch (error) { return json(res, error.code === 'DEVICE_UNAUTHORIZED' ? 401 : 400, { error: error.message, code: error.code || 'DEVICE_EVENT_INVALID' }); }
        return json(res, 202, result);
      }
    if (req.method === 'GET' && url.pathname === '/api/runs') return json(res, 200, { runs: state.runs || [] });
    if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) { const run = (state.runs || []).find((item) => item.id === url.pathname.split('/').pop()); return run ? json(res, 200, { run }) : json(res, 404, { error: 'Run not found' }); }
    if (req.method === 'POST' && url.pathname.match(/^\/api\/runs\/[^/]+\/(cancel|resume)$/)) { const id = url.pathname.split('/')[3]; const action = url.pathname.split('/')[4]; let run; await updateState((draft) => { run = (draft.runs || []).find((item) => item.id === id); if (run) { run.status = action === 'cancel' ? 'cancelled' : 'running'; run.events.push({ type: `run.${action}`, at: new Date().toISOString() }); } return draft; }); return run ? json(res, 200, { run }) : json(res, 404, { error: 'Run not found' }); }
    if (req.method === 'GET' && url.pathname === '/api/calendar/events') return json(res, 200, await calendarRequest('GET'));
    if (req.method === 'POST' && url.pathname === '/api/calendar/events') {
        const input = await body(req);
        const { approvalId, idempotencyKey, runId, ...payload } = input;
        const result = await invokeToolRequest(state, { toolId: 'calendar.create', input: { payload }, approvalId, idempotencyKey, runId });
        return json(res, result.status, result.status === 200 ? result.body.data : result.body);
      }
    if (req.method === 'POST' && url.pathname === '/api/mcp') {
        const request = await body(req); const id = request.id ?? null;
        if (request.method === 'initialize') return json(res, 200, mcpResponse(id, { protocolVersion: '2025-03-26', serverInfo: { name: 'aegis-jarvis', version: '1.0.0' }, capabilities: { tools: {} } }));
        if (request.method === 'notifications/initialized') return json(res, 200, {});
        if (request.method === 'tools/list') return json(res, 200, mcpResponse(id, { tools: unattendedTools().map((tool) => ({ name: tool.id, description: tool.description, inputSchema: tool.inputSchema })) }));
        if (request.method === 'tools/call') { try { if (!unattendedTool(request.params?.name)) throw new Error('Tool requires the authenticated JARVIS runtime'); const result = await invokeToolRequest(state, { toolId: request.params.name, input: request.params?.arguments || {} }); if (result.status !== 200 || !result.body?.ok) throw new Error(result.body?.error || result.body?.code || 'Tool call failed'); return json(res, 200, mcpResponse(id, { content: [{ type: 'text', text: JSON.stringify(result.body.data) }], isError: false })); } catch (error) { return json(res, 200, mcpError(id, -32000, error.message)); } }
        return json(res, 200, mcpError(id, -32601, 'MCP method not found'));
      }
    if (req.method === 'POST' && url.pathname === '/api/events') {
        const input = await body(req); const type = String(input.type || '').trim();
        if (!type) return json(res, 400, { error: 'type is required' });
        const runs = [];
        for (const workflow of state.workflows || []) if (workflow.state === 'active' && (workflow.trigger === `event:${type}` || workflow.trigger === type)) runs.push(await runWorkflow(state, workflow));
        await updateState((draft) => { recordActivity(draft, activityEntry('event.received', type, { runs: runs.length })); return draft; });
        return json(res, 202, { accepted: true, type, runs: runs.map((run) => run.id) });
      }
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
    if (req.method === 'GET' && url.pathname === '/api/approvals') return json(res, 200, { approvals: state.approvals.filter((item) => item.status === 'pending' && Date.parse(item.expiresAt || 0) > Date.now()) });
    if (req.method === 'GET' && url.pathname === '/api/approval-policy') return json(res, 200, publicApprovalPolicy(state));
    if (req.method === 'PATCH' && url.pathname === '/api/approval-policy') {
        if (!process.env.JARVIS_AUTH_TOKEN) return json(res, 403, { code: 'AUTH_REQUIRED_FOR_POLICY', error: 'Set JARVIS_AUTH_TOKEN before changing approval policy' });
        const input = await body(req);
        if (!['SAFE', 'CUSTOM'].includes(input.mode)) return json(res, 400, { code: 'APPROVAL_POLICY_INVALID', error: 'Use SAFE or CUSTOM here; FULL requires deliberate activation' });
        let rules;
        try { rules = validateApprovalRules(input.rules || []); }
        catch (error) { return json(res, 400, { code: error.code, error: error.message }); }
        const updated = await updateState((draft) => { draft.approvalPolicy = { mode: input.mode, rules, fullActivatedAt: null }; recordActivity(draft, activityEntry('approval.policy.changed', input.mode)); return draft; });
        return json(res, 200, publicApprovalPolicy(updated));
      }
    if (req.method === 'POST' && url.pathname === '/api/approval-policy/activate-full') {
        if (!process.env.JARVIS_AUTH_TOKEN) return json(res, 403, { code: 'AUTH_REQUIRED_FOR_POLICY', error: 'Set JARVIS_AUTH_TOKEN before enabling Full mode' });
        const input = await body(req);
        if (input.confirm !== 'ENABLE FULL MODE' || input.acceptRisk !== true) return json(res, 400, { code: 'FULL_MODE_CONFIRMATION_REQUIRED', error: 'Full mode needs deliberate risk confirmation' });
        const updated = await updateState((draft) => { draft.approvalPolicy = { ...publicApprovalPolicy(draft), mode: 'FULL', fullActivatedAt: new Date().toISOString() }; recordActivity(draft, activityEntry('approval.policy.full_enabled', 'Full mode enabled by local operator')); return draft; });
        return json(res, 200, publicApprovalPolicy(updated));
      }
    if (req.method === 'POST' && url.pathname.startsWith('/api/approvals/')) {
        const id = url.pathname.split('/').pop(); const input = await body(req);
        const resolved = await resolveApprovalRequest(id, input.outcome);
        return json(res, resolved.status, resolved.body);
      }
    if (req.method === 'GET' && url.pathname === '/api/chats') return json(res, 200, { messages: state.conversations || [] });
    if (req.method === 'POST' && url.pathname === '/api/hud/toggle') {
        toggleHUD();
        return json(res, 200, { ok: true });
      }
    if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: state.agents || [], goals: state.goals || [] });
    if (req.method === 'POST' && url.pathname === '/api/agents') {
        const input = await body(req);
        const agent = spawnAgent(state, input.role, input.goalId);
        await updateState((draft) => { Object.assign(draft, state); return draft; });
        return json(res, 200, { agent });
      }
    if (req.method === 'POST' && url.pathname === '/api/goals') {
        const input = await body(req);
        const goal = createGoal(state, input.title, input.description);
        await updateState((draft) => { Object.assign(draft, state); return draft; });
        return json(res, 200, { goal });
      }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
  
  
        const state = await getState();
        for (const run of state.runs || []) {
          if (run.status === 'running' || run.status === 'waiting_for_approval') {
            transitionRun(run, 'cancelled');
          }
        }
        try {
          const { emergencyStop } = await import('./toolExecutor.js');
          emergencyStop();
        } catch (e) {
          // Ignore
        }
        await updateState((draft) => { Object.assign(draft, state); return draft; });
        return json(res, 200, { ok: true, message: 'All pending automation stopped' });
      }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
  
        const input = await body(req); const text = String(input.message || '').trim();
        if (!text) return json(res, 400, { error: 'message is required' });
        const routeStarted = performance.now(); const route = routeRequest(text);
        if (route.route === 'TOOL_CALL' && route.confidence >= 0.9) {
          const run = await beginRun(state, { request: text, type: 'tool', conversationId: input.conversationId || null }); run.origin = 'chat'; transitionRun(run, 'running');
          const toolStarted = performance.now(); let data; let reply;
          const invokeChatTool = async (toolId, args = {}) => {
            const step = run.steps[0];
            step.type = 'tool'; step.capability = toolId; step.status = 'running'; step.startedAt ||= new Date().toISOString();
            let response;
            try { response = await invokeToolRequest(state, { toolId, input: args, runId: run.id, stepId: step.id, idempotencyKey: `${run.id}:${toolId}`, resumeOnApproval: true }); }
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
            if (data.window) { state.runtime ??= {}; state.runtime.lastDesktopTarget = { windowId: data.window.windowId, appId: data.window.appId, ...(data.window.processId ? { processId: data.window.processId } : {}) }; }
            reply = data.window ? `${data.app.name} is ${data.status === 'focused' ? 'focused' : 'open'} in window ${data.window.windowId}.`
              : data.status === 'launched' ? `Requested ${data.app.name} from the desktop launcher. Window opening could not be verified.`
              : data.status === 'ambiguous' ? `I found multiple matches: ${data.candidates.map((app) => `${app.name} (${app.id})`).join(', ')}. Please specify one.`
                : `I could not find an installed application named ${route.args.name}.`;
          }
          else if (route.capability.startsWith('windows.')) {
            const result = await invokeChatTool(route.capability, route.args);
            if (result.approvalRequired) {
              await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
              return json(res, 202, { reply: 'Window close is waiting for approval bound to the exact window.', runId: run.id, approvalRequired: true, approval: result.approval });
            }
            data = result.data;
            if (data.window?.windowId && route.capability === 'windows.focus') { state.runtime ??= {}; state.runtime.lastDesktopTarget = { windowId: data.window.windowId, appId: data.window.appId, ...(data.window.processId ? { processId: data.window.processId } : {}) }; }
            reply = data.window ? `${route.capability.split('.')[1]}: ${data.window.title || data.window.appId} (${data.window.windowId}).` : 'No active window is available.';
          }
          else if (route.capability === 'computer.keypress' || route.capability === 'computer.type') {
            const args = { ...route.args, ...(route.args.target ? {} : state.runtime?.lastDesktopTarget ? { target: state.runtime.lastDesktopTarget } : {}) };
            const result = await invokeChatTool(route.capability, args);
            if (result.approvalRequired) {
              await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
              return json(res, 202, { reply: 'Desktop input is waiting for your exact-action approval and desktop portal consent.', runId: run.id, approvalRequired: true, approval: result.approval });
            }
            data = result.data;
            reply = 'The desktop portal accepted the input. The focused application result has not been verified.';
          }
          else if (route.capability === 'reminders.create') { data = (await invokeChatTool('reminders.create', route.args)).data; reply = `Reminder scheduled for ${new Date(data.reminder.dueAt).toLocaleString('en-IN')}: ${data.reminder.title}.`; }
          else if (route.capability === 'reminders.list') { data = (await invokeChatTool('reminders.list')).data; const active = data.reminders.filter((item) => ['scheduled', 'due'].includes(item.status)); reply = active.length ? `${active.length} active reminders:\n${active.map((item) => `${item.title} — ${item.status === 'due' ? 'due now' : new Date(item.dueAt).toLocaleString('en-IN')}`).join('\n')}` : 'You have no active reminders.'; }
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
            return json(res, error.httpStatus || desktopErrorStatus(error.code) || 502, { reply: error.message, runId: run.id, code: error.code || 'TOOL_ERROR' });
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
          modelRoute = selectLogicalModel(text, state.modelRouting || {}, { hasMedia: Boolean(input.attachments?.length) });
          const toolResults = run.toolCalls.filter((call) => call.status === 'completed').map((call) => ({ id: call.id, tool: call.tool, resultId: call.resultId }));
          const assembledContext = assembleModelContext({ query: text, toolResults, conversations: state.conversations || [], memories: state.memories || [], includeTools: modelRoute.requiresTools });
          try {
            const brain = await executeBrainWorkflow({ route: modelRoute, request: text, context: assembledContext.context, continuationState: { runId: run.id, plan: run.plan, currentStep: run.currentStep, completedToolCalls: run.toolCalls.filter((call) => call.status === 'completed').map((call) => ({ id: call.id, tool: call.tool, resultId: call.resultId })) }, state, attachments: input.attachments || [], allowFallback: state.modelRouting?.manualFallbackAllowed !== false, execute: (options) => modelRoute.requiresTools && options.continuationState?.delegationStage === 0 ? executeModelToolLoop(options) : executeModelPool(options) });
            providerResult = brain.result;
            modelRoute.executionDecision = brain.decision;
            if (providerResult.executedToolCalls?.length) run.toolCalls.push(...providerResult.executedToolCalls);
            if (providerResult.approvalRequired) {
              run.approvals.push(providerResult.approval.id);
              transitionRun(run, 'waiting_for_approval');
              await updateState((draft) => { const stored = draft.runs.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
              return json(res, 202, { reply: 'Waiting for approval...', runId: run.id, approvalRequired: true, approval: providerResult.approval });
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
        }
        await updateState((draft) => { draft.runtime ??= { startedAt: new Date().toISOString(), usage: { requests: 0, tokens: 0, cost: 0 } }; draft.runtime.usage ??= { requests: 0, tokens: 0, cost: 0 }; draft.runtime.usage.requests += 1; draft.runtime.usage.tokens += providerResult?.tokens || 0; draft.runtime.usage.cost += providerResult?.cost || 0; if (run.routing) { draft.modelRouting ??= { telemetry: [], providerHealth: {} }; draft.modelRouting.providerHealth = state.modelRouting?.providerHealth || {}; draft.modelRouting.telemetry = [{ requestId: run.id, runId: run.id, timestamp: new Date().toISOString(), ...run.routing, success: !modelFailure }, ...(draft.modelRouting.telemetry || [])].slice(0, 200); draft.runtime.lastModelRoute = run.routing; draft.runtime.latency ??= {}; Object.assign(draft.runtime.latency, { routerMs: run.routing.routerMs || 0, modelMs: run.routing.modelMs || 0, toolMs: run.routing.toolMs || 0, policyMs: run.routing.policyMs || 0, databaseMs: run.routing.databaseMs || 0, totalMs: run.routing.totalMs || 0, samples: Number(draft.runtime.latency.samples || 0) + 1 }); } draft.conversations ??= []; const modelIndicator = run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null; const routingDebug = process.env.JARVIS_ROUTER_DEBUG === 'true' && run.routing ? { taskType: run.routing.taskType, confidence: run.routing.routingConfidence, apiRotationCount: run.routing.apiRotationCount, modelFallbackUsed: run.routing.modelFallbackUsed, totalMs: run.routing.totalMs } : null; draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [text] }, { who: 'JARVIS', time: new Date().toISOString(), lines: [reply], modelIndicator, routingDebug }); draft.conversations = draft.conversations.slice(-100); return draft; });
        if (!modelFailure) {
          if (run.plan.intent === 'direct' && run.steps[0]?.status === 'queued') { run.steps[0].status = 'completed'; run.steps[0].startedAt = run.startedAt; run.steps[0].completedAt = new Date().toISOString(); }
          finishRun(run, { reply, task: createdTask }, providerResult ? { input: providerResult.inputTokens, output: providerResult.outputTokens, total: providerResult.tokens } : { total: 0 });
        }
        await updateState((draft) => { const stored = draft.runs?.find((item) => item.id === run.id); if (stored) Object.assign(stored, run); return draft; });
        return json(res, modelFailure ? (modelFailure.code === 'REQUEST_ERROR' ? 400 : modelFailure.code === 'HUMAN_ACTION_REQUIRED' ? 409 : 503) : 200, { reply, task: createdTask, assistant: 'JARVIS', grounded: !modelFailure && !run.routing?.site, runId: run.id, intent: run.plan.intent, plan: run.plan, model: run.model, modelIndicator: run.model ? { handledBy: run.model, fallbackFrom: run.routing?.modelFallbackUsed ? run.routing.fallbackFrom : null } : null, routing: process.env.JARVIS_ROUTER_DEBUG === 'true' ? run.routing : undefined });
      }

  return false;
}
