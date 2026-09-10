import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelevantTools } from '../server/toolFilter.js';
import { listTools } from '../server/registry.js';

function tool(id, description, module = 'misc') {
  return { id, name: id, description, module, inputSchema: { type: 'object', properties: {} }, enabled: true };
}

const tools = [
  tool('gmail.latest', 'Fetch and read recent unread inbox email messages', 'communication'),
  tool('media.generate', 'Generate an image or video from a prompt', 'media'),
  tool('tasks.list', 'List the user tasks', 'productivity'),
  tool('memory.search', 'Search relevant memories', 'memory'),
  tool('runtime.telemetry', 'Read model provider uptime and usage', 'system'),
  tool('diagnostics', 'Check system health', 'system'),
  ...Array.from({ length: 30 }, (_, index) => tool(`filler.${index}`, `Unrelated widget operation number ${index}`)),
];

test('tool filter selects relevant tools, retains core tools, and shrinks schema payload', () => {
  const result = selectRelevantTools('show my latest unread emails', tools, [], { enabled: true, topK: 3 });
  const ids = result.tools.map((item) => item.id);
  assert.ok(ids.includes('gmail.latest'));
  assert.ok(ids.includes('tasks.list'));
  assert.ok(ids.includes('memory.search'));
  assert.ok(result.tools.length < tools.length);
  assert.ok(result.telemetry.schemaTokensAfter < result.telemetry.schemaTokensBefore);
});

test('tool filter uses two bounded history messages to anchor a follow-up', () => {
  const history = [{ role: 'user', content: 'Please generate a video showing a neural brain.' }, { role: 'assistant', content: 'What style?' }];
  const result = selectRelevantTools('make it cinematic', tools, history, { enabled: true, topK: 3 });
  assert.ok(result.tools.some((item) => item.id === 'media.generate'));
});

test('explicit command intent cannot lose command.execute to embedding top-k',()=>{
  const tools=listTools({includeDisabled:false});
  const result=selectRelevantTools('Execute command node --version and show tasks',tools,[],{topK:4});
  assert.ok(result.tools.some(tool=>tool.id==='command.execute'));
  assert.ok(result.tools.some(tool=>tool.id==='tasks.list'));
});

test('tool filter is a no-op when the registry is already under budget', () => {
  const small = tools.slice(0, 4);
  const result = selectRelevantTools('emails', small, [], { enabled: true, topK: 12 });
  assert.equal(result.telemetry.reason, 'under_budget');
  assert.equal(result.tools.length, small.length);
});
