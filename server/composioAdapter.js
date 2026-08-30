import crypto from 'node:crypto';

const apiRoot = 'https://backend.composio.dev';
export const COMPOSIO_TOOLKITS = [
  { slug: 'gmail', label: 'Gmail', capabilities: ['email', 'drafts', 'search'] },
  { slug: 'googlecalendar', label: 'Google Calendar', capabilities: ['calendar', 'events', 'reminders'] },
  { slug: 'discord', label: 'Discord User', capabilities: ['account', 'communities'] },
  { slug: 'discordbot', label: 'Discord Bot', capabilities: ['channel messaging', 'threads', 'moderation'] },
  { slug: 'instagram', label: 'Instagram', capabilities: ['messaging', 'publishing', 'insights'], note: 'Business or Creator account required' },
];

function configured() { return Boolean(process.env.COMPOSIO_API_KEY); }
function userId(value) { return String(value || process.env.COMPOSIO_USER_ID || 'jarvis-local-user').trim().slice(0, 128); }

function credentialType() {
  const key = String(process.env.COMPOSIO_API_KEY || '').trim();
  if (key.startsWith('ak_')) return 'project';
  if (key.startsWith('ck_')) return 'consumer';
  return key ? 'unknown' : 'missing';
}

function authConfigs() {
  try {
    const parsed = JSON.parse(process.env.COMPOSIO_AUTH_CONFIGS || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function rememberAuthConfig(toolkit, id) {
  const next = { ...authConfigs(), [toolkit]: id };
  process.env.COMPOSIO_AUTH_CONFIGS = JSON.stringify(next);
  return id;
}

async function request(pathname, options = {}, fetchImpl = fetch) {
  if (!configured()) { const error = new Error('COMPOSIO_API_KEY is not configured'); error.code = 'NOT_CONFIGURED'; throw error; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15_000));
  try {
    const response = await fetchImpl(`${apiRoot}${pathname}`, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json', 'x-api-key': process.env.COMPOSIO_API_KEY, ...(options.body ? { 'content-type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.message || payload.error?.message || payload.error || `Composio returned HTTP ${response.status}`); error.status = response.status; error.details = payload; throw error; }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Composio request timed out');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function validateComposioProjectKey(apiKey, fetchImpl = fetch) {
  const key = String(apiKey || '').trim();
  if (!key.startsWith('ak_')) { const error = new Error('Enter a Composio Platform Project API key beginning with ak_.'); error.status = 400; throw error; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(`${apiRoot}/api/v3/auth_configs?limit=1`, { signal: controller.signal, headers: { accept: 'application/json', 'x-api-key': key } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.message || payload.error?.message || payload.error || `Composio returned HTTP ${response.status}`); error.status = response.status; throw error; }
    return { valid: true, credentialType: 'project' };
  } catch (error) {
    if (error.name === 'AbortError') { const timeout = new Error('Composio key validation timed out'); timeout.status = 504; throw timeout; }
    throw error;
  } finally { clearTimeout(timer); }
}

export function composioStatus() {
  const configs = authConfigs();
  const keyType = credentialType();
  const projectKeyConfigured = keyType === 'project';
  return {
    configured: projectKeyConfigured,
    hasCredential: configured(),
    credentialType: keyType,
    connectReady: projectKeyConfigured,
    configurationError: keyType === 'consumer' ? 'A Composio consumer key (ck_) cannot create app connections. Enter a Platform Project API key (ak_) instead.' : keyType === 'unknown' ? 'The saved Composio credential is not a Platform Project API key. Enter a key beginning with ak_.' : null,
    userIdConfigured: Boolean(process.env.COMPOSIO_USER_ID),
    toolkits: COMPOSIO_TOOLKITS.map((toolkit) => ({ ...toolkit, authConfigured: Boolean(configs[toolkit.slug]) })),
  };
}

export async function listComposioAccounts(input = {}, fetchImpl = fetch) {
  const params = new URLSearchParams({ user_ids: userId(input.userId) });
  if (input.toolkit) params.set('toolkit_slugs', String(input.toolkit).toLowerCase());
  const payload = await request(`/api/v3/connected_accounts?${params}`, {}, fetchImpl);
  const items = payload.items || payload.connected_accounts || [];
  return items.map((item) => ({
    id: item.id || item.nanoid,
    toolkit: item.toolkit?.slug || item.toolkit_slug || item.appName || null,
    status: item.status || 'UNKNOWN',
    alias: item.alias || null,
    createdAt: item.created_at || item.createdAt || null,
  }));
}

export async function listComposioTools(input = {}, fetchImpl = fetch) {
  const params = new URLSearchParams({ toolkit_versions: 'latest', limit: String(Math.min(100, Math.max(1, Number(input.limit || 50)))) });
  if (input.toolkit) params.set('toolkit_slug', String(input.toolkit).toLowerCase());
  if (input.query) params.set('query', String(input.query).slice(0, 200));
  const payload = await request(`/api/v3.1/tools?${params}`, {}, fetchImpl);
  return (payload.items || []).map((tool) => ({ slug: tool.slug, name: tool.name, description: tool.description, toolkit: tool.toolkit?.slug || null, inputSchema: tool.input_parameters || {}, version: tool.version || 'latest' }));
}

export async function ensureComposioAuthConfig(input = {}, fetchImpl = fetch) {
  const toolkit = String(input.toolkit || '').toLowerCase();
  if (!COMPOSIO_TOOLKITS.some((item) => item.slug === toolkit)) throw new Error(`Unsupported Composio toolkit: ${toolkit || 'missing'}`);
  if (credentialType() === 'consumer') { const error = new Error('COMPOSIO_API_KEY is a consumer key (ck_). Use a Platform Project API key (ak_) for app connections.'); error.status = 400; throw error; }
  const explicit = String(input.authConfigId || authConfigs()[toolkit] || '').trim();
  if (explicit) return { id: explicit, created: false };

  const params = new URLSearchParams({ toolkit_slug: toolkit, is_composio_managed: 'true', show_disabled: 'false', limit: '50' });
  const listed = await request(`/api/v3/auth_configs?${params}`, {}, fetchImpl);
  const existing = (listed.items || []).find((item) => String(item.status || 'ENABLED').toUpperCase() === 'ENABLED');
  const existingId = existing?.id || existing?.nanoid || existing?.auth_config?.id;
  if (existingId) return { id: rememberAuthConfig(toolkit, existingId), created: false };

  const created = await request('/api/v3/auth_configs', { method: 'POST', body: { toolkit: { slug: toolkit }, auth_config: { type: 'use_composio_managed_auth', credentials: {}, restrict_to_following_tools: [] } } }, fetchImpl);
  const createdId = created.auth_config?.id || created.id || created.nanoid;
  if (!createdId) throw new Error(`Composio did not return an auth config ID for ${toolkit}`);
  return { id: rememberAuthConfig(toolkit, createdId), created: true };
}

export async function createComposioConnectLink(input = {}, fetchImpl = fetch) {
  const toolkit = String(input.toolkit || '').toLowerCase();
  if (!COMPOSIO_TOOLKITS.some((item) => item.slug === toolkit)) throw new Error(`Unsupported Composio toolkit: ${toolkit || 'missing'}`);
  const authConfig = await ensureComposioAuthConfig(input, fetchImpl);
  const payload = await request('/api/v3/connected_accounts/link', { method: 'POST', body: { auth_config_id: authConfig.id, user_id: userId(input.userId), ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}), ...(input.alias ? { alias: String(input.alias).slice(0, 100) } : {}) } }, fetchImpl);
  if (!payload.redirect_url) throw new Error(`Composio did not return an authorization URL for ${toolkit}`);
  return { toolkit, authConfigId: authConfig.id, authConfigCreated: authConfig.created, connectedAccountId: payload.connected_account_id || null, redirectUrl: payload.redirect_url, expiresAt: payload.expires_at || null };
}

export function composioToolRisk(toolSlug) {
  const action = String(toolSlug || '').toUpperCase().split('_').slice(1).join('_');
  return /^(GET|LIST|FETCH|SEARCH|FIND|READ|CHECK|RESOLVE|LOOKUP|QUERY|DOWNLOAD)_/.test(`${action}_`) ? 'READ_ONLY' : 'EXTERNAL_ACTION';
}

export function composioActionHash(input = {}) {
  const normalized = JSON.stringify({ toolSlug: String(input.toolSlug || '').toUpperCase(), arguments: input.arguments || {}, connectedAccountId: input.connectedAccountId || null, userId: userId(input.userId) });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function executeComposioTool(input = {}, fetchImpl = fetch) {
  const toolSlug = String(input.toolSlug || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(toolSlug)) throw new Error('A valid Composio toolSlug is required');
  const prefix = toolSlug.split('_')[0].toLowerCase();
  if (!COMPOSIO_TOOLKITS.some((item) => item.slug === prefix || (item.slug === 'googlecalendar' && prefix === 'googlecalendar'))) throw new Error(`Composio toolkit is not allowed: ${prefix}`);
  const payload = await request(`/api/v3.1/tools/execute/${encodeURIComponent(toolSlug)}`, { method: 'POST', body: { user_id: userId(input.userId), version: input.version || 'latest', arguments: input.arguments || {}, ...(input.connectedAccountId ? { connected_account_id: input.connectedAccountId } : {}) }, timeoutMs: input.timeoutMs || 30_000 }, fetchImpl);
  return { toolSlug, successful: payload.successful !== false && !payload.error, data: payload.data ?? payload, error: payload.error || null, logId: payload.log_id || null };
}
