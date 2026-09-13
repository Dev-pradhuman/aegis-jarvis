import crypto from 'node:crypto';
import { embed } from './extendedAdapters.js';

const DEFAULT_TOP_K = 12;
const CORE_TOOLS = new Set(['tools.discover', 'tasks.list', 'memory.search', 'runtime.telemetry', 'diagnostics']);
let cachedIndex = null;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed))) : fallback;
}

function toolDocument(tool) {
  return `${tool.id}: ${tool.name || ''}. ${tool.description || ''}. Category: ${tool.module || 'general'}`;
}

function fingerprint(tools) {
  return crypto.createHash('sha256').update(tools.map(toolDocument).sort().join('\n')).digest('hex');
}

function cosine(left, right) {
  return left.reduce((sum, value, index) => sum + value * Number(right[index] || 0), 0);
}

function indexTools(tools) {
  const key = fingerprint(tools);
  if (cachedIndex?.key === key) return cachedIndex;
  cachedIndex = { key, vectors: tools.map((tool) => ({ id: tool.id, vector: embed(toolDocument(tool)) })) };
  return cachedIndex;
}

function queryText(query, history = []) {
  const recent = history.slice(-2).map((message) => String(message.content || message.lines?.join('\n') || '').trim().slice(0, 300)).filter(Boolean);
  return [...recent, String(query || '').trim()].join('\n');
}

function intentAnchors(query, tools) {
  const text=String(query||'').toLowerCase();const modules=new Set();const ids=new Set();
  const rules=[
    [/\b(command|terminal|shell|npm|node|test suite|git)\b/,['development'],['command.execute']],
    [/\b(task|todo)\b/,['productivity'],[]],
    [/\b(file|folder|readme|repository|repo|codebase)\b/,['files','development'],[]],
    [/\b(email|gmail|inbox|mail)\b/,['communication'],['gmail.latest']],
    [/\b(slack|discord|instagram|whatsapp|gmail|message|dm|contact|papa|mma|maam|arjun|aviral|vedant|ayush|ridhima|prajakta)\b/,['communication'],['contacts.resolve','communication.send']],
    [/\b(calendar|event|availability|meeting)\b/,['calendar'],[]],
    [/\b(browser|website|webpage|tab|url|youtube|github\.com|song|songs|playlist|video)\b/,['computer','browser','media'],['browser.external.open','browser.open','youtube.search','youtube.play']],
    [/\b(app|window|desktop|mouse|keyboard|clipboard|screen|volume|music|media|play|pause|ram|memory usage|running processes?|process memory)\b/,['computer'],[]],
    [/\b(memory|remember|recall|forget)\b/,['memory'],[]],
    [/\b(workflow|automation|schedule|trigger)\b/,['automation'],[]],
    [/\b(research|sources?|web search|fact.?check)\b/,['research'],[]],
    [/\b(notification|what did i miss|urgent)\b/,['notifications'],[]],
    [/\b(phone|sms|call|battery)\b/,['phone'],[]],
  ];
  for(const[pattern,families,explicit]of rules)if(pattern.test(text)){families.forEach(value=>modules.add(value));explicit.forEach(value=>ids.add(value));}
  for(const tool of tools){if(text.includes(tool.id.toLowerCase())||text.includes(String(tool.name||'').toLowerCase()))ids.add(tool.id);}
  return new Set(tools.filter(tool=>modules.has(tool.module)||ids.has(tool.id)).map(tool=>tool.id));
}

export function capabilitySummaries(tools = []) {
  const groups = new Map();
  for (const tool of tools.filter((item) => item.enabled !== false && item.id !== 'tools.discover')) {
    const category = tool.module || 'general';
    const current = groups.get(category) || { category, count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < 4) current.examples.push(tool.id);
    groups.set(category, current);
  }
  return [...groups.values()].sort((left, right) => left.category.localeCompare(right.category));
}

export function estimateSchemaTokens(tools = []) {
  return Math.ceil(JSON.stringify(tools.map(({ id, name, description, inputSchema }) => ({ id, name, description, inputSchema }))).length / 4);
}

export function selectRelevantTools(query, tools, history = [], options = {}) {
  const started = performance.now();
  const enabled = options.enabled ?? String(process.env.TOOL_FILTER_ENABLED || 'true').toLowerCase() !== 'false';
  const topK = boundedInteger(options.topK ?? process.env.TOOL_FILTER_TOP_K, DEFAULT_TOP_K, 1, 50);
  const source = Array.isArray(tools) ? tools : [];
  const beforeTokens = estimateSchemaTokens(source);
  const finish = (selected, reason) => ({
    tools: selected,
    telemetry: {
      enabled,
      reason,
      topK,
      totalTools: source.length,
      selectedTools: selected.length,
      schemaTokensBefore: beforeTokens,
      schemaTokensAfter: estimateSchemaTokens(selected),
      filterMs: Math.max(0, Math.round((performance.now() - started) * 100) / 100),
    },
  });

  if (!enabled) return finish(source, 'disabled');
  if (!String(query || '').trim()) return finish(source, 'empty_query');
  if (source.length <= topK + CORE_TOOLS.size) return finish(source, 'under_budget');

  try {
    const vector = embed(queryText(query, history));
    const index = indexTools(source);
    const ranked = index.vectors.map((entry) => ({ ...entry, score: cosine(vector, entry.vector) })).sort((left, right) => right.score - left.score);
    const keep = new Set(ranked.slice(0, topK).map((entry) => entry.id));
    for (const id of CORE_TOOLS) keep.add(id);
    for (const id of intentAnchors(queryText(query, history),source)) keep.add(id);
    const selected = source.filter((tool) => keep.has(tool.id));
    return finish(selected.length ? selected : source, selected.length ? 'ranked' : 'soft_fallback');
  } catch {
    return finish(source, 'soft_fallback');
  }
}

export function resetToolFilterCache() {
  cachedIndex = null;
}

export function toolFilterSettings() {
  return {
    enabled: String(process.env.TOOL_FILTER_ENABLED || 'true').toLowerCase() !== 'false',
    topK: boundedInteger(process.env.TOOL_FILTER_TOP_K, DEFAULT_TOP_K, 1, 50),
    coreTools: [...CORE_TOOLS],
  };
}
