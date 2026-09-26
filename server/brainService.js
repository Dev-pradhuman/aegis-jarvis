import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { brainCatalog } from './brainSources.js';

const commands = [
  { id: 'codex', command: 'codex', label: 'Codex CLI' },
  { id: 'claude', command: 'claude', label: 'Claude Code' },
  { id: 'opencode', command: 'opencode', label: 'OpenCode' },
];

function executable(command) {
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(folder, command);
    try { fs.accessSync(file, fs.constants.X_OK); return file; } catch {}
  }
  return null;
}

export function detectedCliSources() {
  return commands.map((item) => {
    const location = executable(item.command);
    const result = location ? spawnSync(location, ['--version'], { encoding: 'utf8', timeout: 3000, env: process.env }) : null;
    return { id: item.id, label: item.label, executable: location, version: result?.status === 0 ? String(result.stdout || result.stderr).trim().slice(0, 120) : null, status: !location ? 'NOT_INSTALLED' : result?.status === 0 ? 'DETECTED_AUTH_UNVERIFIED' : 'ERROR' };
  });
}

export async function testBrainSource(sourceId, credentialId = null, { catalog = brainCatalog, fetchImpl = fetch } = {}) {
  const source = catalog.find(sourceId);
  if (source.type === 'CLI') {
    const detected = detectedCliSources().find((entry) => entry.id === source.adapter);
    return detected || { status: 'NOT_INSTALLED' };
  }
  const credential = credentialId ? source.credentials.find((item) => item.id === credentialId) : source.credentials.find((item) => item.enabled);
  if (source.type === 'API' && !credential) return { status: 'CONFIGURATION_REQUIRED', message: 'Add an API key' };
  if (credentialId && !credential) return { status: 'BRAIN_CREDENTIAL_NOT_FOUND' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const started = performance.now();
  try {
    const secret = credential ? catalog.credentialSecret(credential.id) : '';
    const response = await fetchImpl(`${source.baseUrl.replace(/\/$/, '')}/models`, { signal: controller.signal, headers: { accept: 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) } });
    const latencyMs = Math.round(performance.now() - started);
    if (response.ok) return { status: 'HEALTHY', latencyMs };
    return { status: response.status === 401 || response.status === 403 ? 'INVALID_CREDENTIAL' : response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'DEGRADED' : 'UNVERIFIED', httpStatus: response.status, latencyMs };
  } catch (error) { return { status: error.name === 'AbortError' ? 'TIMEOUT' : 'OFFLINE', latencyMs: Math.round(performance.now() - started) }; }
  finally { clearTimeout(timeout); }
}

export async function discoverBrainModels(sourceId, { catalog = brainCatalog, fetchImpl = fetch } = {}) {
  const source = catalog.find(sourceId);
  if (source.type === 'CLI') return { models: [], status: 'UNSUPPORTED' };
  const credential = source.credentials.find((item) => item.enabled);
  const secret = credential ? catalog.credentialSecret(credential.id) : '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetchImpl(`${source.baseUrl.replace(/\/$/, '')}/models`, { signal: controller.signal, headers: { accept: 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) } });
    if (!response.ok) return { models: [], status: response.status === 401 ? 'INVALID_CREDENTIAL' : 'UNAVAILABLE' };
    const payload = await response.json().catch(() => ({}));
    const list = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
    return { models: list.map((item) => typeof item === 'string' ? { id: item } : { id: item.id || item.name, name: item.name || item.id }).filter((item) => item.id).slice(0, 500), status: 'HEALTHY' };
  } catch { return { models: [], status: 'OFFLINE' }; }
  finally { clearTimeout(timeout); }
}
