const MODEL_REGISTRY = {
  'muse-spark-1.2': { label: 'Muse Spark 1.2', role: 'agent_brain', fallbackModel: 'glm-5.2', capabilities: ['text', 'tools'] },
  'deepseek-v4-flash': { label: 'DeepSeek V4 Flash', role: 'general', fallbackModel: 'glm-5.2', capabilities: ['text', 'tools'] },
  'glm-5.2': { label: 'GLM-5.2', role: 'deep_reasoning_global_fallback', fallbackModel: null, capabilities: ['text', 'tools'] },
  'laguna-s-2.1': { label: 'Laguna S 2.1', role: 'coding', fallbackModel: 'glm-5.2', capabilities: ['text', 'tools'] },
  'minimax-m3': { label: 'MiniMax M3', role: 'computer_use', fallbackModel: 'glm-5.2', capabilities: ['text', 'computer_use'] },
  'nemotron-3-nano-omni': { label: 'Nemotron 3 Nano Omni', role: 'perception', fallbackModel: 'glm-5.2', capabilities: ['text', 'image', 'audio', 'video'] },
  'mimo-v2.5': { label: 'MiMo V2.5', role: 'multimodal_reasoning', fallbackModel: 'glm-5.2', capabilities: ['text', 'image', 'audio', 'video'] },
  'nemotron-3.5-lightning': { label: 'Nemotron 3.5 Lightning', role: 'router', fallbackModel: 'deepseek-v4-flash', capabilities: ['text', 'structured_output'] },
};

export function classifyForModel(request, input = {}) {
  const text = String(request || '');
  const coding = /\b(repository|repo|codebase|implement|refactor|debug|failing tests?|typescript|javascript|python|git|dependency)\b/i.test(text);
  const computer = /\b(click|open (chrome|browser|app)|fill (the )?form|navigate|desktop|spreadsheet|presentation)\b/i.test(text);
  const deep = /\b(prove|theorem|derive|difficult math|algorithm design|distributed architecture|compare .+ approaches|scientific reasoning)\b/i.test(text);
  if (input.hasMedia) return { taskType: 'perception', complexity: coding || computer ? 'high' : 'medium', primaryModel: 'nemotron-3-nano-omni', supportModels: coding ? ['mimo-v2.5', 'laguna-s-2.1'] : computer ? ['mimo-v2.5', 'minimax-m3'] : ['mimo-v2.5'], requiresTools: coding || computer, requiresMultimodal: true, confidence: 0.99, reason: 'Nano Omni perceives the media before MiMo multimodal reasoning and any execution specialist.' };
  if (coding && deep) return { taskType: 'coding', complexity: 'high', primaryModel: 'glm-5.2', supportModels: ['laguna-s-2.1'], requiresTools: true, requiresMultimodal: false, confidence: 0.96, reason: 'Deep architecture or algorithm reasoning is required before repository implementation.' };
  if (computer && deep) return { taskType: 'computer_use', complexity: 'high', primaryModel: 'glm-5.2', supportModels: ['minimax-m3'], requiresTools: true, requiresMultimodal: false, confidence: 0.94, reason: 'Deep reasoning is required before computer operation.' };
  if (coding) return { taskType: 'coding', complexity: 'medium', primaryModel: 'laguna-s-2.1', supportModels: [], requiresTools: true, requiresMultimodal: false, confidence: 0.94, reason: 'Repository-level software engineering work.' };
  if (computer) return { taskType: 'computer_use', complexity: 'medium', primaryModel: 'minimax-m3', supportModels: [], requiresTools: true, requiresMultimodal: false, confidence: 0.92, reason: 'The task primarily requires computer or GUI operation.' };
  if (deep) return { taskType: 'deep_reasoning', complexity: 'high', primaryModel: 'glm-5.2', supportModels: [], requiresTools: false, requiresMultimodal: false, confidence: 0.91, reason: 'Deep deliberate reasoning materially improves reliability.' };
  if (/\b(agentic|multi-step|workflow|automation|plan and execute|use tools?)\b/i.test(text)) return { taskType: 'agentic', complexity: 'medium', primaryModel: 'deepseek-v4-flash', supportModels: [], requiresTools: true, requiresMultimodal: false, confidence: 0.92, reason: 'DeepSeek V4 Flash is the fast agentic specialist.' };
  return { taskType: 'general', complexity: 'normal', primaryModel: 'muse-spark-1.2', supportModels: [], requiresTools: false, requiresMultimodal: false, confidence: 0.88, reason: 'Muse Spark 1.2 is the Normal-mode JARVIS agent brain.' };
}

export function selectLogicalModel(request, settings = {}, input = {}) {
  const automatic = classifyForModel(request, input);
  if (settings.modelMode === 'manual' && MODEL_REGISTRY[settings.manualModel]) return { ...automatic, routingMode: 'manual', requestedModel: settings.manualModel, primaryModel: settings.manualModel, supportModels: [], reason: 'User manual model override.' };
  if (settings.jarvisMode === 'coding') return { ...automatic, routingMode: 'coding', requestedModel: 'laguna-s-2.1', primaryModel: 'laguna-s-2.1', supportModels: [], reason: 'Coding mode explicitly selects Laguna S 2.1.' };
  if (settings.jarvisMode === 'deepthinking') return { ...automatic, routingMode: 'deepthinking', requestedModel: 'glm-5.2', primaryModel: 'glm-5.2', supportModels: [], reason: 'Deep Thinking mode explicitly selects GLM-5.2.' };
  return { ...automatic, routingMode: 'auto', requestedModel: 'auto' };
}

export function modelRegistry() { return structuredClone(MODEL_REGISTRY); }
