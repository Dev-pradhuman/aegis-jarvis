import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const emitter = new EventEmitter();
let cache = { status: 'not_configured', vaultPath: null, nodes: [], edges: [], scannedAt: null, revision: 0, error: null };
let watcher = null; let watchedPath = null; let debounceTimer = null;
const noteId = (relative) => `obsidian-${crypto.createHash('sha1').update(relative.toLowerCase()).digest('hex').slice(0, 16)}`;
const vaultFolders = ['00-System/identity','00-System/preferences','00-System/memory-policy','10-People','20-Projects','30-Knowledge','40-Memories/Long-Term','40-Memories/Decisions','40-Memories/Events','50-Journal','60-Conversations','70-Tasks','80-Relationships','90-Archive','.obsidian'];

export function configuredVaultPath(value = process.env.OBSIDIAN_VAULT_PATH) {
  return path.resolve(value || path.join(os.homedir(), 'Documents', 'JARVIS-Vault'));
}

export async function initializeJarvisVault(vaultPath = configuredVaultPath()) {
  const root = path.resolve(vaultPath);
  await mkdir(root, { recursive: true });
  await Promise.all(vaultFolders.map((folder) => mkdir(path.join(root, folder), { recursive: true })));
  return { path: root, created: true, folders: [...vaultFolders] };
}

function parseFrontmatter(source) {
  if (!source.startsWith('---')) return { attributes: {}, body: source, malformed: false };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { attributes: {}, body: source, malformed: true };
  const attributes = {}; let malformed = false;
  for (const line of source.slice(3, end).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/); if (!match) { malformed = true; continue; }
    const key = match[1].trim(); let value = match[2].trim();
    if (/^\[.*\]$/.test(value)) value = value.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    attributes[key] = value;
  }
  return { attributes, body: source.slice(end + 4).trimStart(), malformed };
}

async function markdownFiles(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) await markdownFiles(root, target, output);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) output.push(target);
    if (output.length >= 20_000) break;
  }
  return output;
}

export async function scanMemoryGraph(vaultPath = configuredVaultPath()) {
  const root = path.resolve(vaultPath);
  try { if (!(await stat(root)).isDirectory()) throw new Error('Configured vault path is not a directory.'); }
  catch (error) { return (cache = { ...cache, status: 'missing', vaultPath: root, nodes: [], edges: [], scannedAt: new Date().toISOString(), error: error.code === 'ENOENT' ? 'Vault directory does not exist.' : error.message, revision: cache.revision + 1 }); }
  try {
    const files = await markdownFiles(root); const nodes = [];
    for (const file of files) {
      const [source, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
      const relative = path.relative(root, file).replaceAll('\\', '/'); const parsed = parseFrontmatter(source);
      const wikiLinks = [...parsed.body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim()).filter(Boolean);
      const inlineTags = [...parsed.body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((match) => match[1]);
      const frontTags = Array.isArray(parsed.attributes.tags) ? parsed.attributes.tags : String(parsed.attributes.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      nodes.push({ id: noteId(relative), title: path.basename(relative, '.md'), path: relative, folder: path.dirname(relative) === '.' ? '' : path.dirname(relative).replaceAll('\\', '/'), tags: [...new Set([...frontTags, ...inlineTags])], memoryType: parsed.attributes.type || parsed.attributes.memoryType || null, source: parsed.attributes.source || 'obsidian', modifiedAt: info.mtime.toISOString(), createdAt: info.birthtime.toISOString(), size: info.size, links: wikiLinks, malformedFrontmatter: parsed.malformed, preview: parsed.body.replace(/[#>*_`-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 280) });
    }
    const byPath = new Map(), byTitle = new Map(); for (const node of nodes) { byPath.set(node.path.toLowerCase().replace(/\.md$/, ''), node); const title = node.title.toLowerCase(); if (!byTitle.has(title)) byTitle.set(title, []); byTitle.get(title).push(node); }
    const edges = []; const seen = new Set();
    for (const node of nodes) for (const link of node.links) {
      const normalized = link.replaceAll('\\', '/').replace(/\.md$/i, '').toLowerCase(); const candidates = byPath.has(normalized) ? [byPath.get(normalized)] : (byTitle.get(path.basename(normalized)) || []);
      if (candidates.length !== 1) continue; const target = candidates[0]; const key = `${node.id}:${target.id}`; if (seen.has(key)) continue; seen.add(key); edges.push({ id: `edge-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}`, source: node.id, target: target.id, type: 'wiki-link' });
    }
    cache = { status: nodes.length ? 'ready' : 'empty', vaultPath: root, nodes: nodes.map(({ links, ...node }) => ({ ...node, connections: edges.filter((edge) => edge.source === node.id || edge.target === node.id).length })), edges, scannedAt: new Date().toISOString(), revision: cache.revision + 1, error: null };
  } catch (error) { cache = { ...cache, status: error.code === 'EACCES' ? 'permission_denied' : 'parser_failure', vaultPath: root, nodes: [], edges: [], scannedAt: new Date().toISOString(), error: error.message, revision: cache.revision + 1 }; }
  emitter.emit('update', memoryGraph()); return cache;
}

export function memoryGraph() { return structuredClone(cache); }
export function onMemoryGraphUpdate(listener) { emitter.on('update', listener); return () => emitter.off('update', listener); }
export function stopMemoryGraphWatcher() { if (watcher) watcher.close(); watcher = null; watchedPath = null; clearTimeout(debounceTimer); }
export async function startMemoryGraphWatcher(vaultPath = configuredVaultPath()) {
  const resolved = vaultPath ? path.resolve(vaultPath) : null;
  if (resolved === watchedPath && watcher) return memoryGraph();
  if (watcher) watcher.close(); watcher = null; watchedPath = resolved;
  await scanMemoryGraph(resolved);
  if (!resolved || ['missing', 'permission_denied'].includes(cache.status)) return memoryGraph();
  try { watcher = watch(resolved, { recursive: true }, (_event, filename) => { if (filename && !String(filename).toLowerCase().endsWith('.md')) return; clearTimeout(debounceTimer); debounceTimer = setTimeout(() => void scanMemoryGraph(resolved), 220); }); watcher.on('error', (error) => { cache = { ...cache, status: 'watcher_disconnected', error: error.message }; emitter.emit('update', memoryGraph()); }); }
  catch (error) { cache = { ...cache, status: 'watcher_disconnected', error: error.message }; }
  return memoryGraph();
}
export function searchVaultNotes(query, limit = 8) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter((term) => term.length > 1);
  return cache.nodes.map((node) => ({ node, score: terms.reduce((score, term) => score + (node.title.toLowerCase().includes(term) ? 5 : 0) + (node.path.toLowerCase().includes(term) ? 2 : 0) + (node.preview.toLowerCase().includes(term) ? 1 : 0), 0) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || b.node.connections - a.node.connections).slice(0, limit).map(({ node, score }) => ({ id: node.id, text: `${node.title}: ${node.preview}`, kind: node.memoryType || 'obsidian-note', memoryType: node.memoryType || 'document', source: 'obsidian', sourcePath: node.path, score, modifiedAt: node.modifiedAt }));
}
export async function writeVaultMemory(memory) {
  const root = configuredVaultPath(); await initializeJarvisVault(root);
  const kind=String(memory.memoryType||memory.kind||'long-term').toLowerCase();
  const relativeFolder=kind==='decision'?'40-Memories/Decisions':kind==='event'?'40-Memories/Events':kind==='project'?'20-Projects':kind==='person'?'10-People':'40-Memories/Long-Term';
  const folder = path.join(root, relativeFolder); await mkdir(folder, { recursive: true });
  const safeId=String(memory.id||`memory-${crypto.randomUUID()}`).replace(/[^a-zA-Z0-9_-]/g,'-');const file = path.join(folder, `${safeId}.md`);
  await writeFile(file, `---\nid: ${safeId}\ntype: ${memory.memoryType || memory.kind || 'long-term'}\nsource: jarvis\ncreated: ${memory.createdAt}\nupdated: ${memory.updatedAt || memory.createdAt}\nimportance: ${memory.importance || 'normal'}\nconfidence: ${Number(memory.confidence ?? 1)}\n---\n\n${memory.text}\n`, { flag: 'wx' });
  return path.relative(root, file).replaceAll('\\', '/');
}
export async function readVaultNote(relativePath) {
  const root = configuredVaultPath(), target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error('Note path escapes the configured vault.'), { code: 'PERMISSION_DENIED' });
  const source = await readFile(target, 'utf8'); return { path: path.relative(root, target).replaceAll('\\', '/'), content: source, bytes: Buffer.byteLength(source) };
}
