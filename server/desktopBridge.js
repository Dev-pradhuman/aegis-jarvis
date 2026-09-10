import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { platformDesktopRequest } from './platform/index.js';

const script = fileURLToPath(new URL('../windows/desktop-native.ps1', import.meta.url)).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
export async function desktopRequest(operation, args = {}, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') return platformDesktopRequest(operation, args, { ...options, platform });
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let stdout;
  try {
    stdout = await new Promise((resolve, reject) => {
      const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-Operation', operation], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; let bytes = 0;
      const timer = setTimeout(() => { child.kill(); reject(Object.assign(new Error('Native timeout'), { killed: true })); }, operation === 'apps.index' ? 20000 : 8000);
      child.stdout.on('data', (chunk) => { bytes += chunk.length; if (bytes > (operation === 'screen.capture' ? 24 : 4) * 1024 * 1024) { child.kill(); reject(new Error('Native output limit')); } else output += chunk.toString('utf8'); });
      child.stderr.resume(); // Never print command payloads or native diagnostics containing user data.
      child.once('error', reject);
      child.once('close', () => { clearTimeout(timer); resolve(output); });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(args));
    });
  } catch (error) {
    if (!error.stdout) throw Object.assign(new Error('Windows bridge is unavailable or timed out.'), { code: error.killed ? 'TIMEOUT' : 'CONNECTION_UNAVAILABLE' });
    stdout = error.stdout;
  }
  let data; try { data = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()); } catch { throw Object.assign(new Error('Windows bridge returned invalid data.'), { code: 'PROVIDER_ERROR' }); }
  if (!data.ok) throw Object.assign(new Error(`${data.error?.message || 'Windows action failed.'}${data.error?.exceptionType ? ` (${data.error.exceptionType}: ${data.error.errorId || ''})` : ''}`), { code: data.error?.code || 'EXECUTION_FAILED' });
  return data.result;
}
