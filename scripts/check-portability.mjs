import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = ['server', 'src', 'desktop', 'scripts', 'test', 'tests'];
const extensions = ['', '.js', '.mjs', '.cjs', '.jsx', '.json'];
const failures = [];

function files(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'data', 'dist', 'release'].includes(entry.name)) continue;
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...files(item));
    else if (/\.(?:js|mjs|cjs|jsx)$/.test(entry.name)) found.push(item);
  }
  return found;
}

function exactCase(file) {
  const absolute = path.resolve(file);
  const relative = path.relative(process.cwd(), absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  let current = process.cwd();
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    let names;
    try { names = readdirSync(current); } catch { return false; }
    if (!names.includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

function resolveImport(source, specifier) {
  const base = path.resolve(path.dirname(source), specifier);
  for (const suffix of extensions) {
    const candidate = `${base}${suffix}`;
    try { if (statSync(candidate).isFile()) return candidate; } catch {}
  }
  for (const suffix of extensions.slice(1)) {
    const candidate = path.join(base, `index${suffix}`);
    try { if (statSync(candidate).isFile()) return candidate; } catch {}
  }
  return null;
}

for (const root of roots) {
  for (const file of files(root)) {
    const content = readFileSync(file, 'utf8');
    const pattern = /(?:from\s+|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g;
    for (const match of content.matchAll(pattern)) {
      const target = resolveImport(file, match[1]);
      if (!target) failures.push(`${file}: unresolved relative import ${match[1]}`);
      else if (!exactCase(target)) failures.push(`${file}: case mismatch in ${match[1]}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Portability check passed: relative imports resolve with exact filesystem casing.');
}
