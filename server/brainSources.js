import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelRegistry } from './modelRouting.js';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const sourceFile = path.join(dataDir, 'brain-sources.json');
const secretFile = path.join(dataDir, 'brain-secrets.json');
const allowedTypes = new Set(['API', 'LOCAL', 'CLI']);
const allowedCapabilities = new Set(['text', 'tools', 'image', 'audio', 'video', 'reasoning', 'coding', 'computer_use', 'structured_output']);
const cliAdapters = { codex: 'codex', claude: 'claude', opencode: 'opencode' };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function writePrivate(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
}

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function cleanCapabilities(value) { return [...new Set((Array.isArray(value) ? value : ['text']).filter((item) => allowedCapabilities.has(item)))]; }
function mask(secret) { return `••••${String(secret).slice(-4)}`; }
function sourceInput(input, current = {}) {
  const type = String(input.type ?? current.type ?? '').toUpperCase();
  if (!allowedTypes.has(type)) fail('BRAIN_SOURCE_INVALID', 'Choose an API, local, or CLI source');
  const name = String(input.name ?? current.name ?? '').trim().slice(0, 80);
  if (!name) fail('BRAIN_SOURCE_INVALID', 'Source name is required');
  const baseUrl = String(input.baseUrl ?? current.baseUrl ?? '').trim();
  if (type !== 'CLI') {
    let parsed;
    try { parsed = new URL(baseUrl); } catch { fail('BRAIN_SOURCE_INVALID', 'Enter a valid endpoint URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('BRAIN_SOURCE_INVALID', 'Endpoint must be an HTTP URL without credentials');
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) fail('BRAIN_SOURCE_INVALID', 'Remote model endpoints require HTTPS');
  }
  const modelId = String(input.modelId ?? current.modelId ?? '').trim().slice(0, 160);
  if (!modelId) fail('BRAIN_SOURCE_INVALID', 'Model ID is required');
  const logicalModels = [...new Set((Array.isArray(input.logicalModels) ? input.logicalModels : current.logicalModels || ['muse-spark-1.2']).map(String))];
  if (!logicalModels.length || logicalModels.some((item) => !modelRegistry()[item])) fail('BRAIN_SOURCE_INVALID', 'Select valid routing roles');
  const adapter = type === 'CLI' ? String(input.adapter ?? current.adapter ?? '') : null;
  if (type === 'CLI' && !cliAdapters[adapter]) fail('BRAIN_SOURCE_INVALID', 'Unsupported CLI adapter');
  return { ...current, id: current.id || crypto.randomUUID(), name, type, provider: String(input.provider ?? current.provider ?? type.toLowerCase()).trim().slice(0, 50), baseUrl: type === 'CLI' ? '' : baseUrl.replace(/\/$/, ''), modelId, logicalModels, capabilities: cleanCapabilities(input.capabilities ?? current.capabilities), priority: Math.max(0, Math.min(1000, Number(input.priority ?? current.priority ?? 100) || 0)), enabled: input.enabled === undefined ? current.enabled !== false : Boolean(input.enabled), adapter, credentials: current.credentials || [], createdAt: current.createdAt || new Date().toISOString() };
}

export function createBrainCatalog({ sourcesPath = sourceFile, secretsPath = secretFile, env = process.env } = {}) {
  const sources = readJson(sourcesPath, []);
  const secrets = readJson(secretsPath, {});
  const save = () => { writePrivate(secretsPath, secrets); writePrivate(sourcesPath, sources); };
  const find = (id) => { const source = sources.find((entry) => entry.id === id); if (!source) fail('BRAIN_SOURCE_NOT_FOUND', 'Brain source not found'); return source; };
  const exposed = (source, health = {}) => ({ ...source, health: health[`brain-${source.id}`]?.status || 'UNKNOWN', credentials: source.credentials.map((credential) => ({ ...credential, hint: mask(secrets[credential.id] || ''), status: health[`brain-${credential.id}`]?.status || 'UNKNOWN', retryAfter: health[`brain-${credential.id}`]?.retryAfter || null })), secretConfigured: source.type !== 'API' || source.credentials.some((item) => Boolean(secrets[item.id])) });
  const envKeys = () => Object.keys(env).filter((key) => /^(?:OPENROUTER|GEMINI|GROQ|XAI|ANTHROPIC|OPENAI|NVIDIA|CUSTOM|MODEL|OPENCODE_ZEN|NINEROUTER)_API_KEY(?:_\d+)?$/.test(key) && env[key]);
  const list = (health = {}) => sources.map((source) => exposed(source, health));
  const publicStatus = (health = {}) => {
    const entries = list(health);
    const importedKeys = envKeys();
    let configuredPoolKeys = [];
    try { configuredPoolKeys = Object.values(JSON.parse(env.MODEL_PROVIDER_POOLS || '{}')).flat().map((item) => item.credentialRef).filter((key) => key && env[key]); } catch {}
    const configured = entries.some((source) => source.enabled && source.secretConfigured) || importedKeys.length > 0 || configuredPoolKeys.length > 0;
    const statuses = entries.filter((source) => source.enabled).flatMap((source) => source.type === 'API' ? source.credentials.filter((key) => key.enabled).map((key) => key.status) : [source.health]);
    const healthy = statuses.filter((status) => status === 'HEALTHY').length;
    const knownFailed = statuses.filter((status) => ['INVALID_CREDENTIAL', 'OFFLINE', 'RATE_LIMITED', 'QUOTA_EXHAUSTED', 'PROVIDER_ERROR'].includes(status)).length;
    const status = !configured ? 'NO_BRAIN_CONFIGURED' : healthy && knownFailed ? 'PARTIALLY_AVAILABLE' : healthy ? 'ONLINE' : knownFailed && knownFailed === statuses.length ? 'OFFLINE' : 'CONFIGURED_UNVERIFIED';
    return { sources: entries, importedEnvironment: [...new Set([...importedKeys, ...configuredPoolKeys])].map((key) => ({ reference: key, hint: mask(env[key]) })), setupRequired: !configured, status };
  };
  const addSource = (input) => { const source = sourceInput(input); sources.push(source); save(); return exposed(source); };
  const updateSource = (id, input) => { const index = sources.findIndex((entry) => entry.id === id); if (index < 0) fail('BRAIN_SOURCE_NOT_FOUND', 'Brain source not found'); sources[index] = sourceInput(input, sources[index]); save(); return exposed(sources[index]); };
  const removeSource = (id) => { const source = find(id); for (const key of source.credentials) delete secrets[key.id]; sources.splice(sources.indexOf(source), 1); save(); };
  const addCredential = (sourceId, input) => {
    const source = find(sourceId);
    if (source.type !== 'API') fail('BRAIN_CREDENTIAL_INVALID', 'API keys are only used by API sources');
    const secret = String(input.secret || '').trim();
    if (!secret) fail('BRAIN_CREDENTIAL_INVALID', 'API key is required');
    if (source.credentials.some((entry) => secrets[entry.id] === secret)) fail('BRAIN_CREDENTIAL_DUPLICATE', 'This key is already configured for the source');
    const credential = { id: crypto.randomUUID(), label: String(input.label || '').trim().slice(0, 60), enabled: true, priority: source.credentials.length, createdAt: new Date().toISOString() };
    source.credentials.push(credential); secrets[credential.id] = secret; save(); return { ...credential, hint: mask(secret), status: 'UNKNOWN' };
  };
  const updateCredential = (sourceId, credentialId, input) => { const credential = find(sourceId).credentials.find((item) => item.id === credentialId); if (!credential) fail('BRAIN_CREDENTIAL_NOT_FOUND', 'Credential not found'); if (typeof input.enabled === 'boolean') credential.enabled = input.enabled; if (Number.isFinite(input.priority)) credential.priority = Math.max(0, Math.min(1000, input.priority)); save(); return { ...credential, hint: mask(secrets[credential.id]) }; };
  const removeCredential = (sourceId, credentialId) => { const source = find(sourceId); const index = source.credentials.findIndex((item) => item.id === credentialId); if (index < 0) fail('BRAIN_CREDENTIAL_NOT_FOUND', 'Credential not found'); source.credentials.splice(index, 1); delete secrets[credentialId]; save(); };
  const credentialSecret = (id) => secrets[id] || '';
  const poolEntries = () => sources.filter((source) => source.enabled).flatMap((source) => {
    const keys = source.type === 'API' ? source.credentials.filter((item) => item.enabled && secrets[item.id]) : [{ id: source.id, priority: 0 }];
    return source.logicalModels.flatMap((logicalModel) => keys.map((credential) => ({ id: `brain-${credential.id}`, sourceId: source.id, type: source.type, provider: source.provider, baseUrl: source.baseUrl, modelId: source.modelId, logicalModel, capabilities: source.capabilities, modalities: source.capabilities.filter((item) => ['text', 'image', 'audio', 'video'].includes(item)), priority: source.priority * 1000 + credential.priority, credentialId: source.type === 'API' ? credential.id : null, adapter: source.adapter })));
  });
  return { list, publicStatus, addSource, updateSource, removeSource, addCredential, updateCredential, removeCredential, credentialSecret, poolEntries, find, envKeys };
}

export const brainCatalog = createBrainCatalog();
