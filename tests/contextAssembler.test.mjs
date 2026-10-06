import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleModelContext } from '../server/contextAssembler.js';
import { embed } from '../server/extendedAdapters.js';

function withContextEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return fn(); }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('context assembly bounds history to recent turns and per-message size', () => withContextEnv({ CONTEXT_MAX_CHARS: '2000', CONTEXT_RECENT_TURNS: '2', CONTEXT_TURN_CHAR_LIMIT: '300' }, () => {
  const conversations = Array.from({ length: 12 }, (_, index) => ({ who: index % 2 ? 'JARVIS' : 'YOU', lines: [`message-${index} ${'x'.repeat(500)}`] }));
  const result = assembleModelContext({ query: 'continue', conversations, memories: [], includeTools: false });
  assert.equal(result.telemetry.recentHistoryMessages, 4);
  assert.ok(result.context.every((message) => message.content.length <= 300));
  assert.ok(result.telemetry.contextChars <= 2000);
  assert.equal(result.telemetry.selectedToolIds.length, 0);
}));

test('context assembly retrieves relevant memory with provenance', () => withContextEnv({ CONTEXT_MEMORY_TOP_K: '2' }, () => {
  const memories = [
    { id: 'memory-mail', kind: 'project', text: 'Gmail integration uses Composio for inbox email retrieval.', embedding: embed('Gmail integration uses Composio for inbox email retrieval.') },
    { id: 'memory-weather', kind: 'note', text: 'Tomorrow will be sunny.', embedding: embed('Tomorrow will be sunny.') },
  ];
  const result = assembleModelContext({ query: 'How do we retrieve Gmail email?', conversations: [], memories, includeTools: false });
  assert.equal(result.telemetry.retrievedMemories, 1);
  assert.match(result.context[0].content, /memory-mail/);
  assert.doesNotMatch(result.context[0].content, /memory-weather/);
}));

test('tool capability context includes only enabled relevant tool metadata', () => {
  const tools = Array.from({ length: 20 }, (_, index) => ({ id: index === 0 ? 'files.read' : `tool.${index}`, name: `Tool ${index}`, description: index === 0 ? 'Read a project file' : `Unrelated operation ${index}`, module: 'files', enabled: index < 15, riskLevel: 'READ_ONLY', inputSchema: { type: 'object', properties: {} } }));
  const result = assembleModelContext({ query: 'read the README file', conversations: [], memories: [], includeTools: true, tools });
  assert.ok(result.telemetry.selectedToolIds.includes('files.read'));
  assert.ok(result.telemetry.selectedToolIds.every((id) => id !== 'tool.19'));
  assert.match(result.context[0].content, /discovery metadata only/);
});
