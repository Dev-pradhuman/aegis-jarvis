import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

export function platformError(code, message, details = undefined) {
  return Object.assign(new Error(message), { code, ...(details ? { details } : {}) });
}

export function displayEnvironment(env = process.env) {
  const sessionType = String(env.XDG_SESSION_TYPE || '').toLowerCase();
  if (sessionType === 'wayland' || env.WAYLAND_DISPLAY) return 'wayland';
  if (sessionType === 'x11' || env.DISPLAY) return 'x11';
  return 'none';
}

export async function commandPath(name, env = process.env) {
  if (!name) return null;
  if (path.isAbsolute(name)) { try { await access(name); return name; } catch { return null; } }
  const extensions = process.platform === 'win32' ? String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const directory of String(env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, process.platform === 'win32' ? `${name}${extension}` : name);
      try { await access(candidate); return candidate; } catch {}
    }
  }
  return null;
}

export function runFile(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args.map(String), {
      timeout: options.timeout ?? 8000,
      maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
      windowsHide: true,
      cwd: options.cwd,
      env: options.env || process.env,
      encoding: options.encoding || 'utf8',
    }, (error, stdout, stderr) => {
      if (error) return reject(platformError(error.killed ? 'TIMEOUT' : 'EXECUTION_FAILED', options.errorMessage || `${path.basename(file)} failed.`, { exitCode: error.code, signal: error.signal, stderr: String(stderr || '').slice(0, 500) }));
      resolve({ stdout, stderr });
    });
  });
}

export function spawnWithInput(file, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args.map(String), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: options.env || process.env });
    let stdout = ''; let stderr = ''; let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(platformError('TIMEOUT', `${path.basename(file)} timed out.`)); }, options.timeout ?? 8000);
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-4 * 1024 * 1024); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
    child.once('error', (error) => finish(platformError('CONNECTION_UNAVAILABLE', `${path.basename(file)} is unavailable.`, { cause: error.message })));
    child.once('close', (code) => code === 0 ? finish(null, { stdout, stderr }) : finish(platformError('EXECUTION_FAILED', `${path.basename(file)} failed.`, { exitCode: code, stderr })));
    child.stdin.end(String(input ?? ''));
  });
}
