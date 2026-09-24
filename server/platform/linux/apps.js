import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export function parseDesktopEntry(content, file, desktop = '') {
  let inEntry = false;
  const fields = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { inEntry = line === '[Desktop Entry]'; continue; }
    if (!inEntry || !line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals > 0) fields[line.slice(0, equals)] = line.slice(equals + 1);
  }
  if (fields.Type !== 'Application' || !fields.Name || !fields.Exec) return null;
  const desktops = desktop.split(':').filter(Boolean);
  const only = (fields.OnlyShowIn || '').split(';').filter(Boolean);
  const excluded = (fields.NotShowIn || '').split(';').filter(Boolean);
  if (only.length && !desktops.some((item) => only.includes(item))) return null;
  if (desktops.some((item) => excluded.includes(item))) return null;
  return {
    id: path.basename(file, '.desktop'), name: fields.Name, genericName: fields.GenericName || null,
    exec: fields.Exec, icon: fields.Icon || null, startupWMClass: fields.StartupWMClass || null,
    terminal: fields.Terminal === 'true', hidden: fields.Hidden === 'true', noDisplay: fields.NoDisplay === 'true',
    file,
  };
}

function dataDirectories(env, home) {
  const homeData = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const system = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  return [...new Set([homeData, ...system].map((item) => path.join(item, 'applications')))];
}

async function desktopFiles(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'EACCES') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await desktopFiles(file));
    else if (entry.name.endsWith('.desktop') && (entry.isFile() || entry.isSymbolicLink())) files.push(file);
  }
  return files;
}

export async function discoverLinuxApps({ env = process.env, home = os.homedir() } = {}) {
  const seen = new Set();
  const apps = [];
  for (const directory of dataDirectories(env, home)) {
    for (const file of await desktopFiles(directory)) {
      const id = path.relative(directory, file).split(path.sep).join('-');
      if (seen.has(id)) continue;
      seen.add(id); // Hidden=true in a higher-priority directory masks the system entry.
      let entry;
      try { entry = parseDesktopEntry(await readFile(file, 'utf8'), file, env.XDG_CURRENT_DESKTOP || ''); }
      catch (error) { if (error.code === 'ENOENT' || error.code === 'EACCES') continue; throw error; }
      if (entry && !entry.hidden && !entry.noDisplay) apps.push({ ...entry, id: id.replace(/\.desktop$/, '') });
    }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

const normalize = (value) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const aliases = { 'vs code': 'visual studio code', vscode: 'visual studio code', code: 'visual studio code' };

function distance(a, b) {
  let prior = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, prior[j] + 1, prior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prior = current;
  }
  return prior[b.length];
}

export function resolveApp(query, apps) {
  const raw = normalize(query);
  const target = aliases[raw] || raw;
  if (!target) return { status: 'not_found', candidates: [] };
  const scored = apps.map((app) => {
    const names = [app.name, app.genericName, app.id, app.startupWMClass].filter(Boolean).map(normalize);
    const idExact = normalize(app.id) === target;
    const nameExact = normalize(app.name) === target;
    const genericExact = normalize(app.genericName) === target;
    const classExact = normalize(app.startupWMClass) === target;
    const genericWord = app.genericName && normalize(app.genericName).split(' ').includes(target);
    const fuzzy = target.length >= 5 ? Math.min(...names.map((name) => distance(target, name))) : Infinity;
    return { app, score: idExact ? 110 : nameExact ? 100 : genericExact ? 95 : classExact ? 90 : genericWord ? 85 : fuzzy <= 2 ? 70 - fuzzy : 0 };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name));
  if (!scored.length) return { status: 'not_found', candidates: [] };
  const best = scored[0].score;
  const tied = scored.filter((item) => item.score === best).map((item) => item.app);
  return tied.length === 1 ? { status: 'resolved', app: tied[0], match: best >= 85 ? 'exact' : 'fuzzy' } : { status: 'ambiguous', candidates: tied };
}

export function createLinuxApps(options = {}) {
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const run = options.execFile || execFileAsync;
  const discover = () => discoverLinuxApps({ env, home });
  return {
    list: discover,
    async open(query) {
      const resolution = resolveApp(query, await discover());
      if (resolution.status !== 'resolved') return resolution;
      await access(resolution.app.file, constants.R_OK);
      await run('gio', ['launch', resolution.app.file], { timeout: 10_000, windowsHide: true });
      return { status: 'launched', app: resolution.app, match: resolution.match, verified: false, verification: 'Desktop launcher accepted the request; window state is unavailable.' };
    },
  };
}
