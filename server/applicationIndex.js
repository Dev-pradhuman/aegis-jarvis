import crypto from 'node:crypto';
import path from 'node:path';
import { desktopRequest } from './desktopBridge.js';

export const normalizeAppName = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/\.exe$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const aliases = { vscode: 'visual studio code', 'vs code': 'visual studio code', code: 'visual studio code', calc: 'calculator', 'note pad': 'notepad', mspaint: 'paint', zen: 'zen browser', chrome: 'google chrome', firefox: 'mozilla firefox', edge: 'microsoft edge', brave: 'brave' };
let cached; let pending;
export function normalizeApplicationIndex(items) {
  const groups = new Map();
  for (const item of items) {
    if (!item.name || !item.target || !['appId', 'shortcut', 'executable', 'desktop'].includes(item.kind)) continue;
    const key = normalizeAppName(item.name);
    const prior = groups.get(key) || [];
    const same = prior.find((entry) => entry.target === item.target || (entry.executable && item.executable && entry.executable.toLowerCase() === item.executable.toLowerCase()));
    if (same) { if (item.browser) same.browser = true; continue; }
    // StartApps and a shortcut with the same name represent the same shell entry.
    const generic = prior.find((entry) => entry.kind === 'appId');
    if (generic && item.kind !== 'appId') { Object.assign(generic, item, { appId: generic.appId }); continue; }
    if (item.kind === 'appId' && prior.length === 1) { prior[0].appId = item.appId; continue; }
    prior.push({ ...item }); groups.set(key, prior);
  }
  return [...groups.values()].flat().map((item) => ({ ...item, id: crypto.createHash('sha256').update(`${item.kind}:${item.target.toLowerCase()}`).digest('hex').slice(0, 20) }));
}
export async function applicationIndex(options = {}) {
  if (options.apps) return { apps: normalizeApplicationIndex(options.apps), warnings: [], cached: false };
  if (cached && Date.now() - cached.at < 300000 && !options.refresh) return { ...cached.data, cached: true };
  if (!pending) pending = (options.bridge || desktopRequest)('apps.index').then((data) => {
    const normalized = { ...data, apps: normalizeApplicationIndex(data.apps || []), cached: false };
    cached = { at: Date.now(), data: normalized }; return normalized;
  }).finally(() => { pending = null; });
  return pending;
}
export function searchApplications(query, apps) {
  const input = normalizeAppName(query); const needle = aliases[input] || input;
  if (!needle) return [];
  return apps.map((app) => {
    const name = normalizeAppName(app.name);
    const executable = normalizeAppName(String(app.executable || '').split(/[\\/]/).pop());
    const words = needle.split(' ');
    const score = app.id === query || name === needle || name === input ? 1 : executable === needle || executable === input ? 0.97 : name.startsWith(needle + ' ') || name.startsWith(input + ' ') ? 0.82 : words.every((word) => name.split(' ').includes(word)) ? 0.76 : name.includes(needle) || name.includes(input) ? 0.6 : 0;
    return { ...app, confidence: score };
  }).filter((app) => app.confidence >= 0.6).sort((a,b) => b.confidence-a.confidence || a.name.localeCompare(b.name));
}
export async function resolveInstalledApplication(query, options = {}) {
  if (!String(query || '').trim() || String(query).length > 200 || /[\r\n;&|`<>]/.test(query)) throw Object.assign(new Error('Provide an application name, not a command.'), { code: 'INVALID_ARGUMENTS' });
  const index = await applicationIndex(options);
  const matches = searchApplications(query, index.apps);
  if (!matches.length) throw Object.assign(new Error(`No installed application matched "${query}".`), { code: 'APP_NOT_FOUND' });
  if (matches[0].confidence < 0.9 || (matches[1] && matches[0].confidence - matches[1].confidence < 0.1)) throw Object.assign(new Error(`Application name is ambiguous. Choose: ${matches.slice(0,5).map((app) => app.name).join(', ')}`), { code: 'APP_AMBIGUOUS', candidates: matches.slice(0,5).map(({id,name}) => ({id,name})) });
  return matches[0];
}

export async function resolveInstalledBrowser(query, options = {}) {
  if (!String(query || '').trim() || String(query).length > 200 || /[\r\n;&|`<>]/.test(query)) throw Object.assign(new Error('Provide a browser name, not a command.'), { code: 'INVALID_ARGUMENTS' });
  const index = await applicationIndex(options);
  const matches = searchApplications(query, index.apps.filter((app) => app.browser === true));
  if (!matches.length) throw Object.assign(new Error(`No registered browser matched "${query}".`), { code: 'APP_NOT_FOUND' });
  if (matches[0].confidence < 0.9 || (matches[1] && matches[0].confidence - matches[1].confidence < 0.1)) throw Object.assign(new Error(`Browser name is ambiguous. Choose: ${matches.slice(0, 5).map((app) => app.name).join(', ')}`), { code: 'APP_AMBIGUOUS', candidates: matches.slice(0, 5).map(({ id, name }) => ({ id, name })) });
  return matches[0];
}
