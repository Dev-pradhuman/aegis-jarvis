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
    if (attachments.length) return null; // The current web adapter cannot attach media through the normal UI.
    const result = await web(request, { preferred: decision.preferredSite });
    attempts.push({ tier: 'HEADLESS_WEB', status: result.status });
    if (result.status === 'HUMAN_ACTION_REQUIRED') throw Object.assign(new Error('Complete verification in the browser, then resume'), { code: 'HUMAN_ACTION_REQUIRED', attempts });
    return result.status === 'READY' ? webResult(result, decision) : null;
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
