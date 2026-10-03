import { executeModelDelegation } from './modelDelegation.js';
import { runWebAi } from './webAiProvider.js';
import { classifyExecutionTier } from './executionTier.js';

function webResult(outcome, decision) {
  return {
    reply: outcome.reply, provider: outcome.provider, model: outcome.model, logicalModel: outcome.model,
    tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0,
    routingTelemetry: {
      requestedModel: 'headless-web', selectedModel: 'headless-web', finalModel: outcome.model,
      executionTier: 'HEADLESS_WEB', site: outcome.site, preferredSite: decision.preferredSite,
      providerAttempts: outcome.attempts.map((attempt, index) => ({ providerId: `${attempt.site}-web`, attempt: index + 1, success: attempt.status === 'READY', status: attempt.status })),
      apiRotationCount: 0, modelFallbackUsed: outcome.attempts.length > 1,
    },
  };
}

export async function executeBrainWorkflow({ request, route, context = [], continuationState = null, state, attachments = [], allowFallback = true, execute, web = runWebAi }) {
  const decision = classifyExecutionTier(request, { attachments, settings: state?.modelRouting || {} });
  const attempts = [];
  const model = (sourceTier) => executeModelDelegation({ route, request, context, continuationState, state, attachments, allowFallback, sourceTier, execute });
  const runLocal = async () => {
    // A small text model cannot replace missing current sources, vision, or strong reasoning.
    if (decision.requiresVision || decision.requiresWeb || decision.requiresStrongReasoning) {
      attempts.push({ tier: 'LOCAL_MODEL', code: 'MODEL_CAPABILITY_UNSUPPORTED' });
      return null;
    }
    try { const result = await model('local'); result.routingTelemetry.executionTier = 'LOCAL_MODEL'; return result; }
    catch (error) { attempts.push({ tier: 'LOCAL_MODEL', code: error.code }); return null; }
  };
  const runWeb = async () => {
    if (attachments.length) return null;
    const webModelAdapter = async (options) => {
      const result = await web(options, { preferred: decision.preferredSite });
      if (result.status === 'HUMAN_ACTION_REQUIRED') throw Object.assign(new Error('Complete verification in the browser, then resume'), { code: 'HUMAN_ACTION_REQUIRED', attempts: result.attempts });
      if (result.status !== 'READY') throw new Error('Web AI Unavailable');
      return { reply: result.reply, toolCalls: result.toolCalls, provider: result.provider, model: result.model, logicalModel: result.model, tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0, routingTelemetry: { requestedModel: 'headless-web', selectedModel: 'headless-web', finalModel: result.model, executionTier: 'HEADLESS_WEB', site: result.site, preferredSite: decision.preferredSite, providerAttempts: (result.attempts || []).map((attempt, index) => ({ providerId: `${attempt.site}-web`, attempt: index + 1, success: attempt.status === 'READY', status: attempt.status })), apiRotationCount: 0, modelFallbackUsed: (result.attempts || []).length > 1 } };
    };
    try {
      return await execute({ request, context, continuationState, state, attachments, route, requiredModality: 'text' }, { model: webModelAdapter });
    } catch (error) {
      if (error.code === 'HUMAN_ACTION_REQUIRED') throw error;
      attempts.push({ tier: 'HEADLESS_WEB', code: error.code || 'WEB_AI_UNAVAILABLE' });
      return null;
    }
  };
  const runApi = async () => { try { const result = await model('api'); result.routingTelemetry.executionTier = 'ZERO_COST_API'; return result; } catch (error) { attempts.push({ tier: 'ZERO_COST_API', code: error.code }); return null; } };

  if (decision.preferredExecutionTier === 'MANUAL_SOURCE') return { result: await model('all'), decision };
  const sequence = decision.preferredExecutionTier === 'LOCAL_MODEL' ? [runLocal, runWeb, runApi]
    : decision.preferredExecutionTier === 'HEADLESS_WEB' ? [runWeb, runApi, runLocal]
      : [runApi, runLocal];
  for (const stage of sequence) {
    const result = await stage();
    if (result) { result.routingTelemetry.tierAttempts = attempts; return { result, decision }; }
  }
  const error = new Error('No compatible local, authorized web, or verified zero-cost API model is available');
  error.code = 'NO_ZERO_COST_MODEL_AVAILABLE';
  error.attempts = attempts;
  throw error;
}
