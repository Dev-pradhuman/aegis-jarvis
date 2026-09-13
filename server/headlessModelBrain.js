import { chatGPTBootstrap, chatGPTTaskPrompt, chatGPTToolResults, parseChatGPTWebResponse } from './chatgptWebProtocol.js';
import { ToolRuntimeError } from './toolErrors.js';

const callHistory = new Map();
const recentContext = (context = []) => context.filter((item) => ['user', 'assistant'].includes(item.role)).slice(-4).map((item) => `${item.role}: ${String(item.content || '').slice(0, 500)}`).join('\n');
function toolResultsFromContext(context = []) { return context.filter((item) => item.role === 'tool').map((item) => { let value; try { value = JSON.parse(item.content); } catch { value = { status: 'failed', error: { code: 'INVALID_RESPONSE', message: 'Unreadable tool result.' } }; } return { toolCallId: item.tool_call_id, toolName: item.name, ...value }; }); }

export async function executeHeadlessModel(options = {}, config) {
  const { request = '', context = [], continuationState = {}, state = {}, tools = [], capabilities = [], transport } = options;
  const backend = state[config.stateKey] || {};
  if (process.env[config.enabledEnv] !== 'true' && backend.enabled !== true) throw new ToolRuntimeError('CONFIGURATION_MISSING', `${config.label} brain is disabled. Enable it in Settings after signing in.`);
  const started = performance.now();
  state[config.stateKey] ??= { enabled: false, sessionUrl: null, turns: 0, bootstrapped: false, lastSuccessAt: null, lastError: null };
  const conversationId = continuationState.conversationId || null;
  const jarvisSession = conversationId ? (state.chatSessions || []).find((item) => item.id === conversationId) : null;
  const browserSession = jarvisSession || state[config.stateKey];
  const field = (suffix) => jarvisSession ? `${config.sessionPrefix}${suffix}` : ({ ConversationUrl: 'sessionUrl', Turns: 'turns', Bootstrapped: 'bootstrapped' }[suffix]);
  const urlField = field('ConversationUrl'); const turnsField = field('Turns'); const bootField = field('Bootstrapped');
  browserSession[turnsField] ??= 0; browserSession[bootField] ??= false;
  const maxTurns = Math.max(4, Number(process.env[config.maxTurnsEnv] || 40));
  if (browserSession[turnsField] >= maxTurns) { await transport.reset(config.project ? { projectName: config.project.name(state), projectUrl: state[config.stateKey].projectUrl } : {}); browserSession[urlField] = null; browserSession[turnsField] = 0; browserSession[bootField] = false; }
  const results = toolResultsFromContext(context); const isContinuation = results.length > 0;
  const prompt = isContinuation ? chatGPTToolResults(results) : browserSession[bootField] ? chatGPTTaskPrompt({ tools, capabilities, request, contextSummary: recentContext(context) }) : chatGPTBootstrap({ tools, capabilities, request, contextSummary: recentContext(context) });
  const emit = (event) => options.onEvent?.({ backend: config.logicalModel, sessionId: conversationId, runId: continuationState.runId || null, ...event });
  state.activity ??= []; state.activity.unshift({ id: `activity-${Date.now()}-${config.sessionPrefix}`, type: `${config.eventPrefix}.thinking`, message: `${config.label} is reasoning`, meta: { runId: continuationState.runId || null }, at: new Date().toISOString() });
  try {
    const targetUrl = config.targetUrl?.(state) || null;
    // A configured inference conversation is authoritative. In particular,
    // never turn a new JARVIS chat into navigation to the ChatGPT Project home;
    // that page is a container, not the configured inference conversation.
    const initialSessionUrl = targetUrl || browserSession[urlField] || null;
    const projectOptions = config.project ? { projectName: config.project.name(state), projectUrl: jarvisSession?.[`${config.sessionPrefix}ProjectUrl`] || config.project.url?.(state) || state[config.stateKey].projectUrl, targetUrl } : {};
    const response = await transport.send(prompt, { sessionUrl: initialSessionUrl, newSession: Boolean(jarvisSession && !initialSessionUrl && !targetUrl), ...projectOptions, signal: options.signal, onDelta: (delta, meta) => emit({ type: 'generation.delta', delta, replace: Boolean(meta?.replace) }) });
    const parsed = parseChatGPTWebResponse(response.text, tools);
    const maxCalls = Math.max(1, Number(process.env[config.maxCallsEnv] || 4));
    if (parsed.kind === 'tool_calls' && parsed.calls.length > maxCalls) throw new ToolRuntimeError('TOOL_LOOP_LIMIT', `${config.label} requested more than ${maxCalls} tools in one step.`);
    const historyKey = `${config.logicalModel}:${continuationState.runId || conversationId || 'global'}`;
    if (parsed.kind === 'tool_calls') { const counts = callHistory.get(historyKey) || new Map(); for (const call of parsed.calls) { const signature = `${call.function.name}:${call.function.arguments}`; const count = Number(counts.get(signature) || 0) + 1; counts.set(signature, count); if (count > 2) throw new ToolRuntimeError('TOOL_LOOP_LIMIT', `${config.label} repeatedly requested the same tool call: ${call.function.name}`); } callHistory.set(historyKey, counts); emit({ type: 'generation.tool_call', toolCalls: parsed.calls.map((call) => ({ id: call.id, name: call.function.name })) }); } else callHistory.delete(historyKey);
    browserSession[urlField] = response.sessionUrl || browserSession[urlField]; browserSession[turnsField] += 1; browserSession[bootField] = true;
    if (config.project && response.projectUrl) { state[config.stateKey].projectUrl = response.projectUrl; if (jarvisSession) jarvisSession[`${config.sessionPrefix}ProjectUrl`] = response.projectUrl; }
    state[config.stateKey].lastSuccessAt = new Date().toISOString(); state[config.stateKey].lastError = null;
    const latencyMs = Math.round((performance.now() - started) * 100) / 100;
    state.activity.unshift({ id: `activity-${Date.now()}-${config.sessionPrefix}-done`, type: parsed.kind === 'tool_calls' ? `${config.eventPrefix}.tool_requested` : `${config.eventPrefix}.completed`, message: parsed.kind === 'tool_calls' ? `${config.label} requested ${parsed.calls.length} canonical tool call(s)` : `${config.label} completed`, meta: { runId: continuationState.runId || null, latencyMs }, at: new Date().toISOString() });
    return { reply: parsed.kind === 'final' ? parsed.text : '', toolCalls: parsed.kind === 'tool_calls' ? parsed.calls : [], provider: config.logicalModel, model: config.logicalModel, logicalModel: config.logicalModel, tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0, routingTelemetry: { selectedModel: config.logicalModel, finalModel: config.logicalModel, apiRotationCount: 0, modelFallbackUsed: false, providerAttempts: [{ providerId: config.logicalModel, modelId: config.logicalModel, attempt: 1, startedAt: new Date(Date.now() - latencyMs).toISOString(), latencyMs, success: true, statusCode: 200 }] } };
  } catch (error) { state[config.stateKey].lastError = { code: error.code || config.unavailableCode, message: error.message, at: new Date().toISOString() }; emit({ type: 'generation.error', error: { code: error.code || config.unavailableCode, message: error.message } }); throw error; }
}
