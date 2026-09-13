import { executeHeadlessModel } from './headlessModelBrain.js';
import { chatGPTWebTransport, DEFAULT_JARVIS_CHATGPT_URL } from './chatgptWebTransport.js';
import { geminiWebTransport } from './geminiWebTransport.js';
import { executeModelPool } from './modelPool.js';

const configs = {
  'chatgpt-web': { logicalModel: 'chatgpt-web', label: 'ChatGPT Headless', stateKey: 'chatgptWeb', sessionPrefix: 'chatgpt', eventPrefix: 'chatgpt', enabledEnv: 'JARVIS_CHATGPT_WEB_ENABLED', maxTurnsEnv: 'JARVIS_CHATGPT_MAX_SESSION_TURNS', maxCallsEnv: 'JARVIS_CHATGPT_MAX_CALLS_PER_STEP', unavailableCode: 'CHATGPT_WEB_UNAVAILABLE', targetUrl: () => process.env.JARVIS_CHATGPT_URL || DEFAULT_JARVIS_CHATGPT_URL, project: { name: (state) => process.env.JARVIS_CHATGPT_PROJECT_NAME || state.chatgptWeb?.projectName || 'jarvis-chat', url: (state) => process.env.JARVIS_CHATGPT_PROJECT_URL || state.chatgptWeb?.projectUrl || null } },
  'gemini-web': { logicalModel: 'gemini-web', label: 'Gemini Headless', stateKey: 'geminiWeb', sessionPrefix: 'gemini', eventPrefix: 'gemini', enabledEnv: 'JARVIS_GEMINI_WEB_ENABLED', maxTurnsEnv: 'JARVIS_GEMINI_MAX_SESSION_TURNS', maxCallsEnv: 'JARVIS_GEMINI_MAX_CALLS_PER_STEP', unavailableCode: 'GEMINI_WEB_UNAVAILABLE' },
};
const transportFor = (model, options) => options.transports?.[model] || options.transport || (model === 'chatgpt-web' ? chatGPTWebTransport() : geminiWebTransport());

export function executeChatGPTWebModel(options = {}) { return executeHeadlessModel({ ...options, transport: transportFor('chatgpt-web', options) }, configs['chatgpt-web']); }
export function executeGeminiWebModel(options = {}) { return executeHeadlessModel({ ...options, transport: transportFor('gemini-web', options) }, configs['gemini-web']); }

export async function executeBrainModel(options = {}) {
  const selected = options.logicalModel;
  if (!configs[selected]) { const { executeModelPool } = await import('./modelPool.js'); return executeModelPool(options); }
  try { return await (selected === 'chatgpt-web' ? executeChatGPTWebModel(options) : executeGeminiWebModel(options)); }
  catch (error) {
    const fallback = options.state?.brainBackends?.fallbackBackend;
    if (options.allowFallback === false || fallback === selected) throw error;
    let result;
    if (fallback === 'api') result = await executeModelPool({ ...options, logicalModel: options.state?.brainBackends?.apiFallbackModel || 'deepseek-v4-flash', allowFallback: true });
    else {
      if (!configs[fallback] || options.state?.[configs[fallback].stateKey]?.enabled !== true) throw error;
      const fallbackOptions = { ...options, logicalModel: fallback, transport: options.transports?.[fallback] };
      result = await (fallback === 'chatgpt-web' ? executeChatGPTWebModel(fallbackOptions) : executeGeminiWebModel(fallbackOptions));
    }
    const finalModel = result.logicalModel || fallback;
    result.routingTelemetry = { ...result.routingTelemetry, selectedModel: selected, finalModel, modelFallbackUsed: true, fallbackFrom: selected, fallbackTo: finalModel, providerAttempts: [{ providerId: selected, modelId: selected, attempt: 1, startedAt: new Date().toISOString(), latencyMs: 0, success: false, failureClass: error.code || 'PROVIDER_ERROR', failureReason: error.message }, ...(result.routingTelemetry?.providerAttempts || [])] };
    return result;
  }
}
