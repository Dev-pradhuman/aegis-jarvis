import { executeModelPool } from './modelPool.js';

const assignments = {
  'muse-spark-1.2': 'Act as the primary JARVIS agent brain. Understand the request, use grounded context, and respond concisely.',
  'nemotron-3-nano-omni': 'Perceive the supplied media and return a precise structured description. Do not claim to perform downstream actions.',
  'mimo-v2.5': 'Reason over the structured multimodal perception and determine the meaning, intent, and best downstream action.',
  'glm-5.2': 'Reason carefully about the difficult parts and produce a concrete plan or conclusion for the next specialist.',
  'laguna-s-2.1': 'Act as the software-engineering specialist. Use the prior specialist result as context and produce the implementation-oriented result.',
  'minimax-m3': 'Act as the computer-operation specialist. Use the plan/perception context and report only operations that the available tools actually confirm.',
  'deepseek-v4-flash': 'Act as the primary JARVIS brain. Synthesize the grounded specialist result into a concise answer.',
};

export async function executeModelDelegation({ route, request, context = [], continuationState = null, state, attachments = [], allowFallback = true, execute = executeModelPool }) {
  const sequence = [...new Set([route.primaryModel, ...(route.supportModels || [])])];
  const stages = [];
  let latest = null;

  for (let index = 0; index < sequence.length; index += 1) {
    const logicalModel = sequence[index];
    const prior = stages.map((stage) => ({ logicalModel: stage.logicalModel, output: stage.reply }));
    const stageRequest = `${assignments[logicalModel] || 'Complete the assigned JARVIS stage.'}\n\nUser request: ${request}${prior.length ? `\n\nCompleted specialist outputs:\n${JSON.stringify(prior)}` : ''}`;
    latest = await execute({
      logicalModel,
      request: stageRequest,
      context,
      continuationState: { ...continuationState, delegationStage: index, delegationSequence: sequence, completedSpecialists: prior },
      state,
      allowFallback,
      attachments: index === 0 ? attachments : [],
      requiredModality: index === 0 && attachments.length ? attachments[0].type || 'text' : 'text',
      requiredCapability: logicalModel === 'minimax-m3' ? 'computer_use' : logicalModel === 'laguna-s-2.1' ? 'tools' : 'text',
    });
    stages.push({ logicalModel, finalModel: latest.logicalModel, provider: latest.provider, reply: latest.reply, tokens: latest.tokens || 0, inputTokens: latest.inputTokens || 0, outputTokens: latest.outputTokens || 0, cost: latest.cost || 0, routingTelemetry: latest.routingTelemetry });
  }

  const attempts = stages.flatMap((stage) => stage.routingTelemetry.providerAttempts || []);
  const fallbackStage = stages.find((stage) => stage.routingTelemetry.modelFallbackUsed);
  return {
    ...latest,
    tokens: stages.reduce((total, stage) => total + stage.tokens, 0),
    inputTokens: stages.reduce((total, stage) => total + stage.inputTokens, 0),
    outputTokens: stages.reduce((total, stage) => total + stage.outputTokens, 0),
    cost: stages.reduce((total, stage) => total + stage.cost, 0),
    routingTelemetry: {
      ...latest.routingTelemetry,
      selectedModel: route.primaryModel,
      finalModel: latest.logicalModel,
      providerAttempts: attempts,
      apiRotationCount: stages.reduce((total, stage) => total + Number(stage.routingTelemetry.apiRotationCount || 0), 0),
      modelFallbackUsed: stages.some((stage) => stage.routingTelemetry.modelFallbackUsed),
      fallbackFrom: fallbackStage?.routingTelemetry.fallbackFrom || null,
      fallbackTo: fallbackStage?.routingTelemetry.fallbackTo || null,
      delegations: stages.map(({ reply, ...stage }) => stage),
    },
  };
}
