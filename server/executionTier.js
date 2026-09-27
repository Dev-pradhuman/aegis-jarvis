// This local, deterministic intent router runs before any model or browser call.
// Ambiguous ordinary conversation stays local; only clear capability needs escalate.
export function classifyExecutionTier(request, { attachments = [], settings = {} } = {}) {
  const text = String(request || '').trim();
  const preferredSite = /\b(?:use|ask|via)\s+claude\b/i.test(text) ? 'claude' : 'chatgpt';
  const explicitWeb = /\b(?:use|ask|via)\s+(?:claude|chatgpt)\b/i.test(text);
  const requiresVision = attachments.some((item) => /^(image|video)/i.test(item.type || ''));
  const complex = /\b(?:deep (?:architecture|analysis|review|research|reasoning)|entire (?:repository|repo|codebase)|large[- ]context|complex (?:debugging|coding|planning|research)|difficult (?:reasoning|coding|problem)|multi[- ]file refactor|redesign .+ component|sophisticated writing)\b/i.test(text);
  const requiresWeb = /\b(?:research (?:the|current|latest)|latest (?:news|developments)|current sources)\b/i.test(text);
  const manual = settings.modelMode === 'manual';
  const preferredExecutionTier = manual ? 'MANUAL_SOURCE' : requiresVision ? 'ZERO_COST_API' : explicitWeb || complex || requiresWeb ? 'HEADLESS_WEB' : 'LOCAL_MODEL';
  return {
    intent: 'MODEL_RESPONSE',
    taskType: complex ? /\b(repo|codebase|coding|debugging|refactor)\b/i.test(text) ? 'CODING' : 'COMPLEX' : requiresVision ? 'VISION' : requiresWeb ? 'RESEARCH' : 'GENERAL',
    complexity: complex ? 'HIGH' : 'NORMAL',
    requiredCapabilities: requiresVision ? ['image'] : ['text'],
    requiresVision,
    requiresWeb,
    requiresStrongReasoning: complex,
    preferredExecutionTier,
    preferredSite,
    confidence: explicitWeb || requiresVision ? 0.99 : complex || requiresWeb ? 0.9 : 0.75,
  };
}
