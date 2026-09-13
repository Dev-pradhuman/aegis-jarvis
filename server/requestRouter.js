import { getToolDefinition, listTools } from './registry.js';
import { validateToolArguments } from './schemaValidation.js';
import { routeRequest } from './router.js';
import { selectRelevantTools } from './toolFilter.js';
import { needleProvider } from './needleProvider.js';

const safeName = (id) => id.replaceAll('.', '__');
const canonicalName = (name, tools) => tools.find((tool) => tool.id === name || safeName(tool.id) === name)?.id || null;
const setting = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export function normalizeIncomingRequest(value) { return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim(); }
export function requestComplexity(text) { const value = normalizeIncomingRequest(text); const reasons = []; if (!value) reasons.push('empty_request'); if (/\b(?:why|analyse|analyze|figure out|compare|research|plan|debug|fix|investigate|summari[sz]e|decide|what should|best way)\b/i.test(value)) reasons.push('reasoning_language'); if (/\b(?:and then|then|after that|before you|while|without touching|anything unnecessary)\b/i.test(value)) reasons.push('multi_step'); if (/\b(?:it|that|this|him|her|them|the one|again)\b/i.test(value) && /^(?:open|close|send|message|play|pause|resume|fix|do)\b/i.test(value.replace(/^(?:hey\s+)?jarvis[,\s]+/i, ''))) reasons.push('context_reference'); if (value.length > 220) reasons.push('long_request'); return { complex: reasons.length > 0, reasons }; }
export function needleEligibleTools(tools = listTools({ includeDisabled: false })) { return tools.filter((tool) => tool.enabled && tool.id !== 'tools.discover' && (['READ_ONLY', 'LOW_RISK_WRITE'].includes(tool.riskLevel) || ['system.app.open', 'apps.close', 'communication.send', 'clipboard.write'].includes(tool.id))); }
function fallback(reason, details = {}) { return { route: 'CHATGPT', reason, confidence: details.confidence ?? 0, ...details }; }
export async function routeIncomingRequest(text, options = {}) {
  const started = performance.now(); const request = normalizeIncomingRequest(text); const deterministic = options.deterministicRoute || routeRequest(request, { source: options.source || 'chat' });
  if (deterministic.route === 'TOOL_CALL' && deterministic.confidence >= 0.9) return { route: 'DETERMINISTIC', reason: 'deterministic_fast_path', tool: deterministic.capability, arguments: deterministic.args, confidence: deterministic.confidence, legacyRoute: deterministic, routerMs: Math.round((performance.now() - started) * 100) / 100 };
  const complexity = requestComplexity(request); if (complexity.complex) return fallback('complex_request', { complexity, routerMs: Math.round((performance.now() - started) * 100) / 100 });
  const enabled = options.enabled ?? String(process.env.JARVIS_NEEDLE_ENABLED || 'true').toLowerCase() !== 'false'; if (!enabled) return fallback('needle_disabled', { routerMs: Math.round((performance.now() - started) * 100) / 100 });
  const allEligible = needleEligibleTools(options.tools);
  const filtered = selectRelevantTools(request, allEligible, options.history || [], { topK: Number(process.env.JARVIS_NEEDLE_TOOL_TOP_K || 12) }); const tools = filtered.tools;
  if (!tools.length) return fallback('no_needle_tools', { toolFilter: filtered.telemetry, routerMs: Math.round((performance.now() - started) * 100) / 100 });
  try {
    const result = await (options.needle || needleProvider()).classifyOrCall({ request, tools }); const calls = Array.isArray(result.function_calls) ? result.function_calls : []; const confidence = Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 0; const low = setting(options.fallbackThreshold ?? process.env.JARVIS_NEEDLE_FALLBACK_THRESHOLD, 0.75);
    if (calls.length !== 1) return fallback(calls.length ? 'needle_multi_tool' : 'needle_refused', { confidence, needleMs: result.latencyMs, toolFilter: filtered.telemetry, routerMs: Math.round((performance.now() - started) * 100) / 100 });
    const tool = canonicalName(calls[0].name, allEligible); const definition = tool ? getToolDefinition(tool) : null; if (!definition?.enabled) return fallback('needle_invalid_tool', { confidence, proposedTool: calls[0].name, needleMs: result.latencyMs, toolFilter: filtered.telemetry, routerMs: Math.round((performance.now() - started) * 100) / 100 });
    const high = definition.riskLevel === 'READ_ONLY' ? setting(options.readOnlyThreshold ?? process.env.JARVIS_NEEDLE_READ_ONLY_THRESHOLD, 0.85) : setting(options.autoExecuteThreshold ?? process.env.JARVIS_NEEDLE_AUTO_EXEC_THRESHOLD, 0.90);
    if (confidence < high) return fallback(confidence < low ? 'needle_low_confidence' : 'needle_below_auto_threshold', { confidence, requiredConfidence: high, proposedTool: tool, riskLevel: definition.riskLevel, needleMs: result.latencyMs, toolFilter: filtered.telemetry, routerMs: Math.round((performance.now() - started) * 100) / 100 });
    let args; try { args = validateToolArguments(definition.inputSchema, calls[0].arguments || {}); } catch (error) { return fallback('needle_invalid_arguments', { confidence, proposedTool: tool, validationError: error.code, needleMs: result.latencyMs, toolFilter: filtered.telemetry, routerMs: Math.round((performance.now() - started) * 100) / 100 }); }
    return { route: 'NEEDLE', reason: 'single_tool_high_confidence', tool, arguments: args, confidence, needleMs: result.latencyMs, toolFilter: filtered.telemetry, routerMs: Math.round((performance.now() - started) * 100) / 100 };
  } catch (error) { return fallback('needle_failure', { errorCode: error.code || 'NEEDLE_UNAVAILABLE', needleError: error.message, routerMs: Math.round((performance.now() - started) * 100) / 100 }); }
}
