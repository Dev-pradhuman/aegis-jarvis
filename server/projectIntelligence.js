import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ownRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export function configuredProjects(raw = process.env.JARVIS_PROJECT_ROOTS) {
  let extra = [];
  if (raw) {
    try { extra = JSON.parse(raw); } catch { return [{ name: 'JARVIS', root: ownRoot, configurationError: 'JARVIS_PROJECT_ROOTS must be a JSON array' }]; }
  }
  if (!Array.isArray(extra)) extra = [];
  const entries = [{ name: 'JARVIS', root: ownRoot }, ...extra.filter((item) => typeof item === 'string' || (item && typeof item.root === 'string')).map((item) => typeof item === 'string' ? { name: path.basename(item), root: item } : item)];
  return [...new Map(entries.map((item) => [path.resolve(item.root), { name: String(item.name || path.basename(item.root)).slice(0, 80), root: path.resolve(item.root), ...(item.configurationError ? { configurationError: item.configurationError } : {}) }])).values()].slice(0, 20);
}

async function git(root, args) {
  try { return (await run('git', ['-C', root, ...args], { timeout: 4000, maxBuffer: 512_000 })).stdout.trim(); }
  catch { return null; }
}

export async function inspectProject(project) {
  const { name, root } = project;
  try {
    if (!(await stat(root)).isDirectory()) throw new Error('Not a directory');
    const [branch, head, changes, packageText] = await Promise.all([
      git(root, ['branch', '--show-current']), git(root, ['rev-parse', '--short', 'HEAD']), git(root, ['status', '--porcelain=v1', '--untracked-files=normal']),
      readFile(path.join(root, 'package.json'), 'utf8').catch(() => null),
    ]);
    let packageInfo = null;
    try { if (packageText) { const parsed = JSON.parse(packageText); packageInfo = { name: parsed.name || null, version: parsed.version || null, scripts: Object.keys(parsed.scripts || {}) }; } } catch { /* Invalid metadata is reported as absent. */ }
    const lines = changes === null ? [] : changes.split('\n').filter(Boolean);
    return { name, root, status: branch === null ? 'directory' : 'available', branch, head, changedFiles: changes === null ? null : lines.length, changes: lines.slice(0, 30), truncated: lines.length > 30, package: packageInfo, ...(project.configurationError ? { configurationError: project.configurationError } : {}) };
  } catch (error) { return { name, root, status: 'unavailable', error: error.message }; }
}

export async function listProjectStatus() {
  return Promise.all(configuredProjects().map(inspectProject));
}
