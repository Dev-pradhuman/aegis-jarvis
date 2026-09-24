import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.JARVIS_PORT || 8787);
let backend = null;
let frontend = null;
let stopping = false;

async function healthy() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
    const data = await response.json();
    return response.ok && data.ok === true && data.service === 'jarvis';
  } catch { return false; }
  finally { clearTimeout(timer); }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  frontend?.kill('SIGTERM');
  backend?.kill('SIGTERM');
  const force = setTimeout(() => { frontend?.kill('SIGKILL'); backend?.kill('SIGKILL'); process.exit(code); }, 3500);
  force.unref();
  Promise.all([backend, frontend].filter(Boolean).map((child) => new Promise((resolve) => child.exitCode !== null ? resolve() : child.once('exit', resolve))))
    .finally(() => { clearTimeout(force); process.exit(code); });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

if (await healthy()) console.log(`[dev] Reusing healthy JARVIS service on ${port}`);
else {
  backend = spawn(process.execPath, ['server/index.js'], { cwd: root, env: process.env, stdio: 'inherit' });
  backend.once('exit', (code) => { if (!stopping) { console.error(`[dev] JARVIS service exited (${code ?? 'signal'})`); stop(code || 1); } });
  const deadline = Date.now() + 12000;
  while (!stopping && Date.now() < deadline && !(await healthy())) await new Promise((resolve) => setTimeout(resolve, 250));
  if (!stopping && !(await healthy())) { console.error(`[dev] JARVIS service did not become healthy on ${port}`); stop(1); }
}

if (!stopping) {
  frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { cwd: root, env: process.env, stdio: 'inherit' });
  frontend.once('exit', (code) => { if (!stopping) stop(code || 0); });
}
