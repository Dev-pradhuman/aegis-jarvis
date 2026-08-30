import assert from 'node:assert/strict';
import test from 'node:test';
import { composioActionHash, composioStatus, composioToolRisk, createComposioConnectLink, executeComposioTool, listComposioTools, validateComposioProjectKey } from '../server/composioAdapter.js';

const original = { key: process.env.COMPOSIO_API_KEY, user: process.env.COMPOSIO_USER_ID, configs: process.env.COMPOSIO_AUTH_CONFIGS };
test.beforeEach(() => { process.env.COMPOSIO_API_KEY = 'ak_project_test'; process.env.COMPOSIO_USER_ID = 'local-user'; process.env.COMPOSIO_AUTH_CONFIGS = JSON.stringify({ gmail: 'ac_gmail' }); });
test.after(() => { for (const [name, value] of Object.entries({ COMPOSIO_API_KEY: original.key, COMPOSIO_USER_ID: original.user, COMPOSIO_AUTH_CONFIGS: original.configs })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

test('Composio status reports readiness without exposing the API key', () => {
  const status = composioStatus();
  assert.equal(status.configured, true);
  assert.equal(status.toolkits.find((item) => item.slug === 'gmail').authConfigured, true);
  assert.equal(JSON.stringify(status).includes('ak_project_test'), false);
});

test('Composio identifies consumer keys that cannot manage Platform connections', () => {
  process.env.COMPOSIO_API_KEY = 'ck_consumer_test';
  const status = composioStatus();
  assert.equal(status.configured, false);
  assert.equal(status.hasCredential, true);
  assert.equal(status.credentialType, 'consumer');
  assert.equal(status.connectReady, false);
  assert.match(status.configurationError, /Project API key/);
});

test('Composio project-key validation rejects consumer keys before network access', async () => {
  let called = false;
  await assert.rejects(() => validateComposioProjectKey('ck_consumer', async () => { called = true; }), /beginning with ak_/);
  assert.equal(called, false);
});

test('Composio project-key validation checks auth-config access', async () => {
  let request;
  const result = await validateComposioProjectKey('ak_project_test', async (url, init) => { request = { url, headers: init.headers }; return { ok: true, json: async () => ({ items: [] }) }; });
  assert.equal(result.valid, true);
  assert.match(request.url, /auth_configs\?limit=1$/);
  assert.equal(request.headers['x-api-key'], 'ak_project_test');
});

test('Composio connect links use the configured auth config and stable user', async () => {
  let request;
  const connection = await createComposioConnectLink({ toolkit: 'gmail' }, async (url, init) => { request = { url, body: JSON.parse(init.body), headers: init.headers }; return { ok: true, json: async () => ({ connected_account_id: 'ca_1', redirect_url: 'https://connect.example/link', expires_at: 'later' }) }; });
  assert.match(request.url, /\/api\/v3\/connected_accounts\/link$/);
  assert.deepEqual(request.body, { auth_config_id: 'ac_gmail', user_id: 'local-user' });
  assert.equal(request.headers['x-api-key'], 'ak_project_test');
  assert.equal(connection.connectedAccountId, 'ca_1');
});

test('Composio connect automatically creates and remembers managed auth', async () => {
  process.env.COMPOSIO_AUTH_CONFIGS = '{}';
  const requests = [];
  const connection = await createComposioConnectLink({ toolkit: 'googlecalendar' }, async (url, init = {}) => {
    requests.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('/auth_configs?')) return { ok: true, json: async () => ({ items: [] }) };
    if (url.endsWith('/auth_configs')) return { ok: true, json: async () => ({ auth_config: { id: 'ac_calendar' } }) };
    return { ok: true, json: async () => ({ connected_account_id: 'ca_calendar', redirect_url: 'https://connect.example/calendar' }) };
  });
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[1].body, { toolkit: { slug: 'googlecalendar' }, auth_config: { type: 'use_composio_managed_auth', credentials: {}, restrict_to_following_tools: [] } });
  assert.equal(requests[2].body.auth_config_id, 'ac_calendar');
  assert.equal(JSON.parse(process.env.COMPOSIO_AUTH_CONFIGS).googlecalendar, 'ac_calendar');
  assert.equal(connection.authConfigCreated, true);
});

test('Composio tool discovery is toolkit-scoped and versioned', async () => {
  let requestedUrl;
  const tools = await listComposioTools({ toolkit: 'gmail', query: 'draft' }, async (url) => { requestedUrl = url; return { ok: true, json: async () => ({ items: [{ slug: 'GMAIL_CREATE_EMAIL_DRAFT', name: 'Create draft', toolkit: { slug: 'gmail' }, input_parameters: { subject: { type: 'string' } }, version: 'latest' }] }) }; });
  assert.match(requestedUrl, /toolkit_slug=gmail/);
  assert.match(requestedUrl, /toolkit_versions=latest/);
  assert.equal(tools[0].slug, 'GMAIL_CREATE_EMAIL_DRAFT');
});

test('Composio risk classification gates mutations but not grounded reads', () => {
  assert.equal(composioToolRisk('GMAIL_FETCH_EMAILS'), 'READ_ONLY');
  assert.equal(composioToolRisk('GOOGLECALENDAR_LIST_EVENTS'), 'READ_ONLY');
  assert.equal(composioToolRisk('GMAIL_SEND_EMAIL'), 'EXTERNAL_ACTION');
  assert.equal(composioToolRisk('DISCORDBOT_CREATE_MESSAGE'), 'EXTERNAL_ACTION');
  assert.equal(composioToolRisk('INSTAGRAM_SEND_TEXT_MESSAGE'), 'EXTERNAL_ACTION');
});

test('Composio exact-action approval hash changes with arguments or account', () => {
  const first = composioActionHash({ toolSlug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@example.com' }, connectedAccountId: 'ca_1' });
  assert.notEqual(first, composioActionHash({ toolSlug: 'GMAIL_SEND_EMAIL', arguments: { to: 'b@example.com' }, connectedAccountId: 'ca_1' }));
  assert.notEqual(first, composioActionHash({ toolSlug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@example.com' }, connectedAccountId: 'ca_2' }));
});

test('Composio tool execution sends structured arguments and account identity', async () => {
  let request;
  const result = await executeComposioTool({ toolSlug: 'DISCORDBOT_CREATE_MESSAGE', arguments: { channel_id: '1', content: 'hello' }, connectedAccountId: 'ca_discord' }, async (url, init) => { request = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ successful: true, data: { id: 'message-1' }, log_id: 'log-1' }) }; });
  assert.match(request.url, /DISCORDBOT_CREATE_MESSAGE$/);
  assert.equal(request.body.connected_account_id, 'ca_discord');
  assert.equal(request.body.version, 'latest');
  assert.equal(result.successful, true);
  assert.equal(result.logId, 'log-1');
});
