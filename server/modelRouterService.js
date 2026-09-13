import { executeModelPool } from './modelPool.js';
import { modelRegistry, selectLogicalModel } from './modelRouting.js';

function needsLightning(request, route) {
  return !['chatgpt-web', 'gemini-web'].includes(route.primaryModel) && route.routingMode === 'auto' && route.taskType === 'general' && /\b(handle (this|it)|deal with (this|it)|figure (this|it) out|take care of (this|it)|what should i do)\b/i.test(String(request));
}

function parseClassification(reply) {
  const source = String(reply || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const value = JSON.parse(source);
  const registry = modelRegistry();
  if (!registry[value.primaryModel]) throw new Error('Router returned an unknown logical model');
  return {
    taskType: String(value.taskType || 'general'),
    complexity: String(value.complexity || 'normal'),
    primaryModel: value.primaryModel,
    supportModels: Array.isArray(value.supportModels) ? value.supportModels.filter((model) => registry[model] && model !== value.primaryModel).slice(0, 2) : [],
    requiresTools: Boolean(value.requiresTools),
    requiresMultimodal: Boolean(value.requiresMultimodal),
    confidence: Math.max(0, Math.min(1, Number(value.confidence || 0))),
    reason: String(value.reason || 'Lightning structured classification.'),
  };
}

export async function selectLogicalModelWithClassifier(request, settings = {}, input = {}, state = {}, execute = executeModelPool) {
  const deterministic = selectLogicalModel(request, settings, input);
  if (!needsLightning(request, deterministic)) return deterministic;
  const prompt = `Classify this JARVIS request. Return JSON only with taskType, complexity, primaryModel, supportModels, requiresTools, requiresMultimodal, confidence, and reason. Allowed models: muse-spark-1.2, gemini-best, openai-best, deepseek-v4-flash, glm-5.2, laguna-s-2.1, minimax-m3, nemotron-3-nano-omni, mimo-v2.5. Request: ${request}`;
  try {
    const routed = await execute({ logicalModel: 'nemotron-3.5-lightning', request: prompt, state, allowFallback: true });
    return { ...parseClassification(routed.reply), routingMode: 'auto', requestedModel: 'auto', classifierModel: routed.logicalModel, classifierTelemetry: routed.routingTelemetry };
  } catch (error) {
    return { ...deterministic, classifierFallback: true, classifierFailure: error.code || 'CLASSIFIER_UNAVAILABLE', reason: `${deterministic.reason} Lightning classification was unavailable, so deterministic/default routing was retained.` };
  }
}
