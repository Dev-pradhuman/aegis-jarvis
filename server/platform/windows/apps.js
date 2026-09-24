import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { resolveApp } from '../linux/apps.js';

const execFileAsync = promisify(execFile);

async function shortcuts(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'EACCES') return []; throw error; }
  const found = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await shortcuts(file));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) found.push({
      id: entry.name.slice(0, -4), name: entry.name.slice(0, -4), genericName: null,
      icon: null, startupWMClass: null, terminal: false, hidden: false, noDisplay: false, file,
    });
  }
  return found;
}

export function createWindowsApps(options = {}) {
  const env = options.env || process.env;
  const run = options.execFile || execFileAsync;
  const roots = [
    env.APPDATA && path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    env.ProgramData && path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
  const list = async () => (await Promise.all(roots.map(shortcuts))).flat().sort((a, b) => a.name.localeCompare(b.name));
  return {
    list,
    async open(query) {
      const resolution = resolveApp(query, await list());
      if (resolution.status !== 'resolved') return resolution;
      await run('explorer.exe', [resolution.app.file], { timeout: 10_000, windowsHide: true });
      return { status: 'launched', app: resolution.app, match: resolution.match, verified: false, verification: 'Windows Shell accepted the shortcut; window state is unavailable.' };
    },
  };
}
