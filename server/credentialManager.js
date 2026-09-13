import { CONFIG_KEYS, removeConfig, saveConfig } from './config.js';

export const CREDENTIAL_PROVIDERS = Object.freeze({
  openrouter: { label: 'OpenRouter', prefix: 'OPENROUTER', verifyUrl: 'https://openrouter.ai/api/v1/models', auth: 'bearer' },
  openai: { label: 'OpenAI', prefix: 'OPENAI', verifyUrl: 'https://api.openai.com/v1/models?limit=1', auth: 'bearer' },
  anthropic: { label: 'Anthropic', prefix: 'ANTHROPIC', verifyUrl: 'https://api.anthropic.com/v1/models?limit=1', auth: 'anthropic' },
  gemini: { label: 'Gemini', prefix: 'GEMINI', verifyUrl: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', auth: 'gemini' },
  groq: { label: 'Groq', prefix: 'GROQ', verifyUrl: 'https://api.groq.com/openai/v1/models', auth: 'bearer' },
  'opencode-zen': { label: 'OpenCode Zen', prefix: 'OPENCODE_ZEN', verifyUrl: 'https://opencode.ai/zen/v1/models', auth: 'bearer' },
  '9router': { label: '9router', prefix: 'NINEROUTER', verifyUrl: 'https://9router.com/api/v1/models', auth: 'bearer' },
  custom: { label: 'Custom API', prefix: 'CUSTOM', verifyUrl: null, auth: 'bearer' },
});

const slotsFor = (definition) => [`${definition.prefix}_API_KEY`, ...Array.from({ length: 4 }, (_, index) => `${definition.prefix}_API_KEY_${index + 1}`)];
function syncDisabled(state) { const disabled = Object.entries(state.credentialMetadata || {}).filter(([, value]) => value.enabled === false).map(([slot]) => slot); saveConfig({ JARVIS_DISABLED_CREDENTIALS: disabled.join(',') || 'none' }); if (!disabled.length) { process.env.JARVIS_DISABLED_CREDENTIALS = ''; removeConfig(['JARVIS_DISABLED_CREDENTIALS']); } }
export function credentialCatalog(state = {}) {
  const metadata = state.credentialMetadata || {};
  return Object.entries(CREDENTIAL_PROVIDERS).map(([id, provider]) => ({ id, label: provider.label, keys: slotsFor(provider).filter((slot, index) => index === 0 || process.env[slot] || metadata[slot]).map((slot, index) => ({ slot, label: metadata[slot]?.label || `${provider.label} ${index ? `Key ${index + 1}` : 'Primary'}`, configured: Boolean(process.env[slot]), enabled: metadata[slot]?.enabled !== false, customUrl: id === 'custom' ? metadata[slot]?.customUrl || '' : undefined, verification: metadata[slot]?.verification || { status: 'not_verified' } })) }));
}
export function saveCredential(state, { providerId, slot, value, label, enabled = true, customUrl } = {}) {
  const provider = CREDENTIAL_PROVIDERS[providerId]; if (!provider) throw Object.assign(new Error('Unknown credential provider.'), { code: 'INVALID_ARGUMENTS' });
  const allowed = slotsFor(provider); const selected = slot || allowed.find((candidate) => !process.env[candidate]);
  if (!selected || !allowed.includes(selected) || !CONFIG_KEYS.includes(selected)) throw Object.assign(new Error(`No free ${provider.label} credential slot is available.`), { code: 'INVALID_ARGUMENTS' });
  if (value) saveConfig({ [selected]: String(value).trim() });
  state.credentialMetadata ??= {}; state.credentialMetadata[selected] = { ...(state.credentialMetadata[selected] || {}), providerId, label: String(label || state.credentialMetadata[selected]?.label || '').trim().slice(0, 80) || undefined, enabled: Boolean(enabled), ...(providerId === 'custom' && customUrl !== undefined ? { customUrl: String(customUrl).trim().replace(/\/$/, '') } : {}), verification: value ? { status: 'not_verified' } : state.credentialMetadata[selected]?.verification || { status: 'not_verified' } }; syncDisabled(state);
  return credentialCatalog(state).find((item) => item.id === providerId);
}
export function removeCredential(state, providerId, slot) {
  const provider = CREDENTIAL_PROVIDERS[providerId]; if (!provider || !slotsFor(provider).includes(slot)) throw Object.assign(new Error('Unknown credential slot.'), { code: 'INVALID_ARGUMENTS' });
  removeConfig([slot]); if (state.credentialMetadata) delete state.credentialMetadata[slot]; syncDisabled(state); return credentialCatalog(state).find((item) => item.id === providerId);
}
export async function verifyCredential(state, providerId, slot, options = {}) {
  const provider = CREDENTIAL_PROVIDERS[providerId]; if (!provider || !slotsFor(provider).includes(slot)) throw Object.assign(new Error('Unknown credential slot.'), { code: 'INVALID_ARGUMENTS' });
  const key = process.env[slot]; if (!key) throw Object.assign(new Error('Credential is not configured.'), { code: 'CONFIGURATION_MISSING' });
  const configuredCustomUrl = state.credentialMetadata?.[slot]?.customUrl; const customBase = options.customUrl || configuredCustomUrl; const verifyUrl = provider.verifyUrl || (customBase ? `${String(customBase).replace(/\/$/, '')}/models` : null); if (!verifyUrl) throw Object.assign(new Error('Configure the custom provider base URL before verification.'), { code: 'CONFIGURATION_MISSING' });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000); const headers = { accept: 'application/json' };
  if (provider.auth === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
  else if (provider.auth !== 'gemini') headers.authorization = `Bearer ${key}`;
  const target = provider.auth === 'gemini' ? `${verifyUrl}${verifyUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : verifyUrl;
  let verification;
  try { const response = await (options.fetchImpl || fetch)(target, { method: 'GET', headers, signal: controller.signal }); verification = response.ok ? { status: 'valid', verifiedAt: new Date().toISOString(), httpStatus: response.status } : response.status === 401 || response.status === 403 ? { status: 'invalid', verifiedAt: new Date().toISOString(), httpStatus: response.status } : { status: 'provider_error', verifiedAt: new Date().toISOString(), httpStatus: response.status }; }
  catch (error) { verification = { status: error.name === 'AbortError' ? 'network_error' : 'network_error', verifiedAt: new Date().toISOString(), message: error.name === 'AbortError' ? 'Verification timed out.' : 'Provider could not be reached.' }; }
  finally { clearTimeout(timer); }
  state.credentialMetadata ??= {}; state.credentialMetadata[slot] = { ...(state.credentialMetadata[slot] || {}), providerId, verification };
  return verification;
}
