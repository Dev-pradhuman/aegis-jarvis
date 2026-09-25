import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { configuredProjects, inspectProject } from '../server/projectIntelligence.js';
import { callMcpTool, discoverMcpServers, mcpActionHash } from '../server/mcpDiscovery.js';
import { deviceStatus, ingestDeviceEvent, pairDevice, revokeDevice } from '../server/deviceBridge.js';
import { planGroundedResearch } from '../server/researchWorkflow.js';
import { executeTool } from '../server/toolExecutor.js';
import { routeRequest } from '../server/router.js';
import { messageActionHash, messageWithAttribution } from '../server/liveAdapters.js';
import { decodeEnvValue } from '../server/config.js';

test('project status reads real Git changes and ignores duplicate configured roots', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jarvis-project-'));
  execFileSync('git', ['init', '-q', root]);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }));
  const result = await inspectProject({ name: 'Fixture', root });
  assert.equal(result.status, 'available');
  assert.equal(result.changedFiles, 1);
  assert.equal(result.package.name, 'fixture');
  assert.equal(configuredProjects(JSON.stringify([root, root])).filter((item) => item.root === root).length, 1);
});

test('MCP discovery isolates a failed server and keeps schema provenance', async () => {
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/bad')) throw new Error('offline');
    const request = JSON.parse(options.body);
    return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ result: request.method === 'initialize' ? { serverInfo: { name: 'fixture' } } : { tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }] } }) };
  };
  const servers = await discoverMcpServers({ fetchImpl, raw: JSON.stringify([{ name: 'good', url: 'http://localhost/good' }, { name: 'bad', url: 'http://localhost/bad' }]) });
  assert.equal(servers[0].status, 'connected');
  assert.equal(servers[0].tools[0].provenance, 'good');
  assert.equal(servers[1].status, 'unavailable');
});

test('MCP calls only target advertised tools and action hash binds arguments', async () => {
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ result: request.method === 'tools/list' ? { tools: [{ name: 'lookup' }] } : { content: [{ type: 'text', text: 'fixture result' }] } }) };
  };
  const raw = JSON.stringify([{ name: 'office', url: 'http://localhost/mcp' }]);
  const input = { server: 'office', tool: 'lookup', arguments: { q: 'one' } };
  assert.notEqual(mcpActionHash(input), mcpActionHash({ ...input, arguments: { q: 'two' } }));
  assert.equal((await callMcpTool(input, { raw, fetchImpl })).content[0].text, 'fixture result');
  await assert.rejects(callMcpTool({ ...input, tool: 'delete' }, { raw, fetchImpl }), /not advertised/);
  await assert.rejects(executeTool('mcp.call', input), /approved approvalId/);
  await assert.rejects(executeTool('mcp.call', input, { approval: { status: 'approved', toolName: 'mcp.call', actionHash: mcpActionHash({ ...input, arguments: { q: 'other' } }), expiresAt: new Date(Date.now() + 60_000).toISOString() } }), /approved approvalId/);
});

test('device pairing, event ingestion and revocation require a valid secret', () => {
  const state = {};
  assert.throws(() => pairDevice(state, { deviceId: 'phone01', pairingCode: 'wrong' }, 'correct'));
  const { token } = pairDevice(state, { deviceId: 'phone01', name: 'My phone', pairingCode: 'correct' }, 'correct');
  assert.equal(state.devices[0].tokenHash.length, 64);
  assert.notEqual(state.devices[0].tokenHash, token);
  assert.throws(() => ingestDeviceEvent(state, '0'.repeat(64), { deviceId: 'phone01', type: 'call.incoming' }));
  ingestDeviceEvent(state, token, { deviceId: 'phone01', type: 'device.status', capabilities: ['battery', 'call_events', 'unsafe'], battery: 67 });
  const event = ingestDeviceEvent(state, token, { deviceId: 'phone01', type: 'call.incoming', number: '+910000000000', contactName: 'Test caller' });
  assert.equal(event.event.type, 'call.incoming');
  assert.equal(event.event.contactName, 'Test caller');
  assert.deepEqual(state.devices[0].capabilities, ['battery', 'call_events']);
  assert.equal(deviceStatus(state).devices[0].connected, true);
  state.devices[0].lastSeenAt = new Date(Date.now() - 120_000).toISOString();
  assert.equal(deviceStatus(state).devices[0].connected, false);
  assert.equal(JSON.stringify(deviceStatus(state)).includes(token), false);
  assert.equal(revokeDevice(state, 'phone01'), true);
  assert.throws(() => ingestDeviceEvent(state, token, { deviceId: 'phone01', type: 'call.ended' }));
});

test('research planning requires attributable sources and never claims media output', async () => {
  const none = await planGroundedResearch({ topic: 'Example research' }, async () => ({ configured: true, sources: [] }));
  assert.equal(none.status, 'no_sources');
  const plan = await planGroundedResearch({ topic: 'Example research', media: true }, async () => ({ configured: true, sources: [{ title: 'Evidence', url: 'https://example.org/article', snippet: 'A source' }, { title: 'Bad', url: 'javascript:alert(1)' }] }));
  assert.equal(plan.status, 'sources_collected');
  assert.equal(plan.sources.length, 1);
  assert.equal(plan.mediaRequested, true);
  assert.match(plan.message, /not been claimed/);
});

test('model, project and MCP questions use existing canonical tools', () => {
  assert.equal(routeRequest('Which models are available?').capability, 'models.list');
  assert.equal(routeRequest('Show connected MCP servers').capability, 'mcp.servers');
  assert.equal(routeRequest('What is the project status?').capability, 'projects.status');
  assert.equal(routeRequest('What is happening in Virtual Office?').args.name, 'Virtual Office');
  assert.equal(routeRequest('Research safe batteries').capability, 'research.plan');
});

test('message attribution is opt-in and scoped to the configured platform', () => {
  const signatures = JSON.stringify({ generic: 'By JARVIS on behalf of Master Pradyuman' });
  assert.equal(messageWithAttribution({ message: 'Hello' }, 'generic', signatures), 'Hello');
  assert.equal(messageWithAttribution({ message: 'Hello', assistantAuthored: true }, 'whatsapp', signatures), 'Hello');
  assert.match(messageWithAttribution({ message: 'Hello', assistantAuthored: true }, 'generic', signatures), /By JARVIS/);
  const input = { recipient: 'controlled-test', message: 'Hello', assistantAuthored: true };
  assert.notEqual(messageActionHash(input), messageActionHash({ ...input, recipient: 'someone-else' }));
  assert.notEqual(messageActionHash(input), messageActionHash({ ...input, message: 'Changed' }));
});

test('JSON configuration arrays and objects survive direct env loading', () => {
  assert.equal(decodeEnvValue('[{"name":"office","url":"http://localhost"}]'), '[{"name":"office","url":"http://localhost"}]');
  assert.equal(decodeEnvValue('{"generic":"signature"}'), '{"generic":"signature"}');
});
