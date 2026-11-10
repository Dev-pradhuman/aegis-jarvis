import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let hudProcess = null;

export function startHUDManager(onInput, onVoice) {
  if (process.env.JARVIS_TEST === '1') return;
  try {
    execSync('pkill -f jarvis_hud.py 2>/dev/null || true');
  } catch {}
  
  const hudPath = fileURLToPath(new URL('../jarvis_hud.py', import.meta.url));
  
  hudProcess = spawn('python3', [hudPath], {
    env: { ...process.env, LD_PRELOAD: '/usr/lib/libgtk4-layer-shell.so' },
    stdio: 'ignore'
  });
  
  hudProcess.on('error', (err) => {
    console.warn('[HUDManager] Failed to spawn jarvis_hud.py:', err.message);
    hudProcess = null;
  });
  
  hudProcess.on('exit', () => {
    hudProcess = null;
  });
}

export function toggleHUD() {
  if (!hudProcess || hudProcess.exitCode !== null) {
    startHUDManager();
    return;
  }
  try {
    hudProcess.kill('SIGUSR1');
  } catch (e) {
    startHUDManager();
  }
}

export function stopHUDManager() {
  if (hudProcess && hudProcess.exitCode === null) {
    try {
      hudProcess.kill('SIGTERM');
    } catch {}
    hudProcess = null;
  }
  try {
    execSync('pkill -f jarvis_hud.py 2>/dev/null || true');
  } catch {}
}

process.once('exit', () => stopHUDManager());
process.once('SIGINT', () => stopHUDManager());
process.once('SIGTERM', () => stopHUDManager());
