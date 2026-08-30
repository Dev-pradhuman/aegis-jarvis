import { addRunStep, completeRun, createRun, failRun, transitionRun } from './runEngine.js';

export function classifyRequest(text) {
  if (/\b(create|add|remember)\s+(a\s+)?task\b/i.test(text)) return 'task';
  if (/\b(research|sources?|compare|fact.?check)\b/i.test(text)) return 'research';
  if (/\b(inspect|analy[sz]e|test|debug|repository|codebase|build)\b/i.test(text)) return 'development';
  if (/\b(workflow|automation|schedule)\b/i.test(text)) return 'workflow';
  return 'direct';
}

export function buildPlan(text, intent) {
  const plans = { task: [['Create durable task', 'tasks.create', false]], research: [['Gather relevant sources', 'research.search', false], ['Compare evidence and report attribution', null, false]], development: [['Inspect project structure', 'project.inspect', false], ['Run verification tests', 'command.execute', true], ['Summarize findings', null, false]], workflow: [['Load workflow definition', 'workflows.list', false], ['Execute workflow steps', 'workflows.run', false]] };
  return { goal: text, intent, steps: (plans[intent] || [['Answer directly', null, false]]).map(([description, capability, requiresApproval], index) => ({ id: `plan-step-${index + 1}`, index, description, capability, requiresApproval })) };
}

export async function beginRun(state, input) {
  const intent = classifyRequest(input.request);
  const run = createRun({ ...input, type: input.type || intent, plan: buildPlan(input.request, intent), provider: state.provider?.id, model: state.provider?.model });
  run.plan.steps.forEach((step) => addRunStep(run, step.description, step.capability, step.requiresApproval));
  transitionRun(run, 'planning');
  state.runs ??= []; state.runs.unshift(run); state.runs = state.runs.slice(0, 500);
  return run;
}

export function finishRun(run, result, usage) { return completeRun(run, result, usage); }
export function errorRun(run, error) { return failRun(run, error); }
