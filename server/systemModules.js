import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolFilterSettings } from './toolFilter.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export function diagnostics(state) {
  const lastContext = state.runtime?.lastModelRoute || {};
  return { service: 'ok', persistence: 'ok', provider: state.provider?.configured ? 'configured' : 'not configured', integrations: integrationStatus(state).filter((item) => item.status === 'configured').length, latency: state.runtime?.latency || {}, context: { ...toolFilterSettings(), maxChars: Number(process.env.CONTEXT_MAX_CHARS || 6000), recentTurns: Number(process.env.CONTEXT_RECENT_TURNS || 2), lastEstimatedTokens: Number(lastContext.estimatedContextTokens || 0), lastSelectedTools: lastContext.selectedToolIds || [] }, checkedAt: new Date().toISOString() };
}

export function integrationStatus(state) {
  const configured = (name) => Boolean(process.env[name]);
  const composioReady = String(process.env.COMPOSIO_API_KEY || '').startsWith('ak_');
  return [
    { id: 'openrouter', name: 'OpenRouter', status: configured('OPENROUTER_API_KEY') ? 'configured' : 'needs key' },
    { id: 'opencode-zen', name: 'OpenCode Zen', status: configured('OPENCODE_ZEN_API_KEY') ? 'configured' : 'needs key' },
    { id: '9router', name: '9router', status: configured('NINEROUTER_API_KEY') ? 'configured' : 'needs key' },
    { id: 'composio', name: 'Composio', status: composioReady ? 'configured' : configured('COMPOSIO_API_KEY') ? 'needs project key' : 'needs key' },
    { id: 'search', name: 'Web search', status: configured('SEARCH_PROVIDER_URL') ? 'configured' : 'needs provider' },
    { id: 'calendar', name: 'Calendar', status: configured('CALENDAR_API_URL') || composioReady ? 'configured' : 'not configured' },
    { id: 'messaging', name: 'Messaging', status: configured('MESSAGING_TOKEN') || configured('SLACK_BOT_TOKEN') || composioReady ? 'configured' : 'not configured' },
  ];
}

export function searchMemory(memories, query) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return memories.map((item) => ({ item, score: terms.reduce((score, term) => score + (JSON.stringify(item).toLowerCase().includes(term) ? 1 : 0), 0) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).map((entry) => entry.item);
}

export async function ingestDocument(documents, input) {
  const candidate = path.resolve(root, String(input.path || ''));
  if (input.content === undefined && candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error('Document path is outside the JARVIS workspace');
  const content = input.content !== undefined ? String(input.content) : await readFile(candidate, 'utf8');
  if (content.length > 2_000_000) throw new Error('Document exceeds the 2 MB ingestion limit');
  return { id: `document-${Date.now()}`, name: String(input.name || input.path || 'untitled'), content, bytes: Buffer.byteLength(content), createdAt: new Date().toISOString() };
}

export async function researchSearch(query) {
  const endpoint = process.env.SEARCH_PROVIDER_URL;
  if (!endpoint) return { configured: false, query, sources: [], message: 'SEARCH_PROVIDER_URL is not configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', ...(process.env.SEARCH_PROVIDER_KEY ? { authorization: `Bearer ${process.env.SEARCH_PROVIDER_KEY}` } : {}) }, body: JSON.stringify({ query }) });
    if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
    const data = await response.json();
    return { configured: true, query, sources: Array.isArray(data.sources) ? data.sources : Array.isArray(data.results) ? data.results : [], raw: data };
  } finally { clearTimeout(timer); }
}
