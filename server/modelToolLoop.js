import { executeModelPool } from './modelPool.js';
import { invokeToolRequest } from './toolRuntime.js';
import { selectRelevantTools } from './toolFilter.js';
import { unattendedTools } from './toolPolicy.js';

const modelName = (id) => id.replaceAll('.', '__');

export async function executeModelToolLoop(options, dependencies = {}) {
  const model = dependencies.model || executeModelPool;
  const invoke = dependencies.invoke || invokeToolRequest;
  const available = selectRelevantTools(options.request, unattendedTools(), options.context).tools;
  const byName = new Map(available.map((tool) => [modelName(tool.id), tool]));
  const toolSpecs = available.map((tool) => ({ type: 'function', function: { name: modelName(tool.id), description: tool.description, parameters: tool.inputSchema } }));
  const transcript = [...(options.context || []), { role: 'user', content: options.request }];
  const calls = [];
  let usage = { tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
  const started = Date.now();
  for (let step = 0; step < 4; step += 1) {
    if (Date.now() - started > 60_000) throw Object.assign(new Error('Model tool loop timed out'), { code: 'TOOL_TIMEOUT' });
    const result = await model({ ...options, context: [], messagesOverride: transcript, toolSpecs });
    for (const key of Object.keys(usage)) usage[key] += Number(result[key] || 0);
    if (!result.toolCalls?.length) return { ...result, ...usage, executedToolCalls: calls };
    if (result.toolCalls.length > 4) throw Object.assign(new Error('Model requested too many tools'), { code: 'TOOL_LIMIT_EXCEEDED' });
    transcript.push({ role: 'assistant', content: result.reply || null, tool_calls: result.toolCalls });
    for (const call of result.toolCalls) {
      const tool = byName.get(call.function?.name);
      let output;
      try {
        if (!tool) throw Object.assign(new Error('Tool is not available to this model run'), { code: 'TOOL_UNAVAILABLE' });
        const args = JSON.parse(call.function.arguments || '{}');
        const response = await invoke(options.state, { toolId: tool.id, input: args, runId: options.continuationState?.runId || null });
        output = response.body;
        if (response.status !== 200) throw Object.assign(new Error(output?.error || output?.code || 'Tool execution failed'), { code: output?.code || 'TOOL_ERROR' });
        calls.push({ id: call.id, tool: tool.id, input: args, result: output, status: output.ok ? 'completed' : 'failed' });
      } catch (error) {
        output = { ok: false, code: error.code || 'TOOL_ERROR', error: error.message };
        calls.push({ id: call.id, tool: tool?.id || call.function?.name, status: 'failed', result: output });
      }
      transcript.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }
  throw Object.assign(new Error('Model tool loop exceeded four steps'), { code: 'TOOL_LIMIT_EXCEEDED' });
}
