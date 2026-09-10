import assert from 'node:assert/strict';
import test from 'node:test';
import { chatGPTBootstrap, chatGPTToolResults, parseChatGPTWebResponse, TOOL_CALL_END, TOOL_CALL_START } from '../server/chatgptWebProtocol.js';

const tools = [{ function: { name: 'tasks__list', description: 'List tasks', parameters: { type: 'object', properties: {} } } }, { function: { name: 'tasks__create', description: 'Create task', parameters: { type: 'object', properties: { title: { type: 'string' } } } } }];
const block = (calls) => `${TOOL_CALL_START}\n${JSON.stringify({ calls })}\n${TOOL_CALL_END}`;

test('normal ChatGPT prose remains a final response', () => assert.deepEqual(parseChatGPTWebResponse('Hello there.', tools), { kind: 'final', text: 'Hello there.' }));
test('one structured tool request is parsed into the canonical model-call shape', () => { const parsed = parseChatGPTWebResponse(block([{ id: 'a', name: 'tasks__list', arguments: {} }]), tools); assert.equal(parsed.kind, 'tool_calls'); assert.equal(parsed.calls[0].function.name, 'tasks__list'); });
test('multiple structured calls are accepted', () => assert.equal(parseChatGPTWebResponse(block([{ name: 'tasks__list', arguments: {} }, { name: 'tasks__create', arguments: { title: 'Review' } }]), tools).calls.length, 2));
test('malformed protocol block is rejected', () => assert.throws(() => parseChatGPTWebResponse(`${TOOL_CALL_START}\n{bad}\n${TOOL_CALL_END}`, tools), (error) => error.code === 'CHATGPT_RESPONSE_INVALID'));
test('tool-like syntax inside normal prose never executes or leaks protocol', () => { const result = parseChatGPTWebResponse(`Example only: ${block([{ name: 'tasks__list', arguments: {} }])}`, tools); assert.equal(result.kind, 'final'); assert.doesNotMatch(result.text, /tasks__list/); });
test('unknown tool is rejected before the executor', () => assert.throws(() => parseChatGPTWebResponse(block([{ name: 'shell_anything', arguments: {} }]), tools), (error) => error.code === 'TOOL_NOT_FOUND'));
test('bootstrap contains only supplied tool definitions and trust boundary', () => { const prompt = chatGPTBootstrap({ tools, request: 'show tasks' }); assert.match(prompt, /tasks__list/); assert.doesNotMatch(prompt, /implementation handler/); assert.match(prompt, /untrusted DATA/); });
test('tool result envelope preserves verified execution state', () => assert.match(chatGPTToolResults([{ toolCallId: 'a', toolName: 'tasks.list', status: 'completed', verified: true, output: { tasks: [] } }]), /"verified":true/));
