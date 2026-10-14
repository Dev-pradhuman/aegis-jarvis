const MODEL_REGISTRY = {
  // IDs remain stable for saved configuration and Runs. Labels describe routing
  // roles, because the actual provider/model is selected by the Brain workflow.
  'agent_brain': { label: 'General conversation', role: 'agent_brain', fallbackModel: 'fallback', capabilities: ['text', 'tools'] },
  'deepseek-v4-flash': { label: 'Tool workflow', role: 'general', fallbackModel: 'fallback', capabilities: ['text', 'tools'] },
  'fallback': { label: 'Deep reasoning', role: 'deep_reasoning_global_fallback', fallbackModel: null, capabilities: ['text', 'tools'] },
  'laguna-s-2.1': { label: 'Coding', role: 'coding', fallbackModel: 'fallback', capabilities: ['text', 'tools'] },
  'minimax-m3': { label: 'Computer use', role: 'computer_use', fallbackModel: 'fallback', capabilities: ['text', 'computer_use'] },
  'perception': { label: 'Perception', role: 'perception', fallbackModel: 'fallback', capabilities: ['text', 'image', 'audio', 'video'] },
  'mimo-v2.5': { label: 'Multimodal reasoning', role: 'multimodal_reasoning', fallbackModel: 'fallback', capabilities: ['text', 'image', 'audio', 'video'] },
  'nemotron-3.5-lightning': { label: 'Intent routing', role: 'router', fallbackModel: 'deepseek-v4-flash', capabilities: ['text', 'structured_output'] },
};

export function classifyForModel(request, input = {}) {
  const text = String(request || '');
  const coding = /\b(repository|repo|codebase|implement|refactor|debug|failing tests?|typescript|javascript|python|git|dependency)\b/i.test(text);
  const computer = /\b(click|open|focus|minimize|maximize|close|fill (the )?form|navigate|desktop|spreadsheet|presentation|terminal|window|windows|screen|camera|volume|audio|sound|mute|unmute|media|music|player|song|browser|website|webpage|calendar|events?|meeting|emails?|inbox|gmail|tasks?|remind|reminders?|screenshot|capture)\b/i.test(text);
  const deep = /\b(prove|theorem|derive|difficult math|algorithm design|distributed architecture|compare .+ approaches|scientific reasoning)\b/i.test(text);
  if (input.hasMedia) return { taskType: 'perception', complexity: coding || computer ? 'high' : 'medium', primaryModel: 'perception', supportModels: coding ? ['mimo-v2.5', 'laguna-s-2.1'] : computer ? ['mimo-v2.5', 'minimax-m3'] : ['mimo-v2.5'], requiresTools: coding || computer, requiresMultimodal: true, confidence: 0.99, reason: 'Media route requires a compatible perception source; legacy logical IDs do not imply a specific provider.' };
  if (coding && deep) return { taskType: 'coding', complexity: 'high', primaryModel: 'fallback', supportModels: ['laguna-s-2.1'], requiresTools: true, requiresMultimodal: false, confidence: 0.96, reason: 'Deep architecture or algorithm reasoning is required before repository implementation.' };
  if (computer && deep) return { taskType: 'computer_use', complexity: 'high', primaryModel: 'fallback', supportModels: ['minimax-m3'], requiresTools: true, requiresMultimodal: false, confidence: 0.94, reason: 'Deep reasoning is required before computer operation.' };
  if (coding) return { taskType: 'coding', complexity: 'medium', primaryModel: 'laguna-s-2.1', supportModels: [], requiresTools: true, requiresMultimodal: false, confidence: 0.94, reason: 'Repository-level software engineering work.' };
  if (computer) return { taskType: 'computer_use', complexity: 'medium', primaryModel: 'minimax-m3', supportModels: [], requiresTools: true, requiresMultimodal: false, confidence: 0.92, reason: 'The task primarily requires computer or GUI operation.' };
  if (deep) return { taskType: 'deep_reasoning', complexity: 'high', primaryModel: 'fallback', supportModels: [], requiresTools: false, requiresMultimodal: false, confidence: 0.91, reason: 'Deep deliberate reasoning materially improves reliability.' };
  if (/\b(agentic|multi-step|workflow|automation|plan and execute|use tools?)\b/i.test(text)) return { taskType: 'agentic', complexity: 'medium', primaryModel: 'deepseek-v4-flash', supportModels: [], requiresTools: true, requiresMultimodal: false, confidence: 0.92, reason: 'Agentic route requires a tool-capable source chosen by the Brain workflow.' };
  return { taskType: 'general', complexity: 'normal', primaryModel: 'agent_brain', supportModels: [], requiresTools: false, requiresMultimodal: false, confidence: 0.88, reason: 'General conversation enters the local-first Brain workflow.' };
}

export function selectLogicalModel(request, settings = {}, input = {}) {
  const automatic = classifyForModel(request, input);
  if (settings.modelMode === 'manual' && MODEL_REGISTRY[settings.manualModel]) return { ...automatic, routingMode: 'manual', requestedModel: settings.manualModel, primaryModel: settings.manualModel, supportModels: [], reason: 'User manual model override.' };
  if (settings.jarvisMode === 'coding') return { ...automatic, routingMode: 'coding', requestedModel: 'laguna-s-2.1', primaryModel: 'laguna-s-2.1', supportModels: [], reason: 'Coding mode selects the coding logical route; the Brain workflow chooses the actual source.' };
  if (settings.jarvisMode === 'deepthinking') return { ...automatic, routingMode: 'deepthinking', requestedModel: 'fallback', primaryModel: 'fallback', supportModels: [], reason: 'Deep Thinking mode selects the reasoning logical route; the Brain workflow chooses the actual source.' };
  return { ...automatic, routingMode: 'auto', requestedModel: 'auto' };
}

export function modelRegistry() { return structuredClone(MODEL_REGISTRY); }
