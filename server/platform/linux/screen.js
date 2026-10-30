import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, open, stat, chmod, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ensureLinuxDesktopEnv } from './env.js';

const defaultRun = promisify(execFile);
const helper = fileURLToPath(new URL('./portal_screenshot.py', import.meta.url));
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function createLinuxScreen({ run = defaultRun, directory = path.join(tmpdir(), 'aegis-jarvis-screenshots') } = {}) {
  async function capture({ target = 'desktop' } = {}) {
    ensureLinuxDesktopEnv();
    const isWayland = run === defaultRun && Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE || process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');

    if (isWayland) {
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const destination = path.join(directory, `${randomUUID()}.png`);
        let geom = null;

        if (target === 'window' || target === 'active_window') {
          try {
            const winOut = await run('hyprctl', ['activewindow', '-j'], { timeout: 3000, windowsHide: true });
            const win = JSON.parse(winOut.stdout || '{}');
            if (Array.isArray(win.at) && Array.isArray(win.size) && win.size[0] > 0 && win.size[1] > 0) {
              geom = `${win.at[0]},${win.at[1]} ${win.size[0]}x${win.size[1]}`;
            }
          } catch {}
        }

        const grimArgs = geom ? ['-g', geom, destination] : [destination];
        await run('grim', grimArgs, { timeout: 10_000, windowsHide: true });

        const sourceInfo = await stat(destination);
        if (!sourceInfo.isFile() || sourceInfo.size > 40_000_000) throw new Error('Captured screenshot file is invalid');
        const file = await open(destination, 'r');
        const header = Buffer.alloc(24);
        try { await file.read(header, 0, 24, 0); } finally { await file.close(); }
        const png = header.subarray(0, 8).equals(pngSignature);
        if (!png) throw new Error('Grim output is not valid PNG');
        await chmod(destination, 0o600);
        return {
          path: destination,
          mimeType: 'image/png',
          bytes: sourceInfo.size,
          width: header.readUInt32BE(16),
          height: header.readUInt32BE(20),
          backend: 'grim',
          target
        };
      } catch (err) {
        if (target === 'window' || target === 'active_window') {
          // If window capture specifically failed, propagate or fall back if possible
        }
      }
    }

    if (target !== 'desktop') throw Object.assign(new Error('Only full desktop capture is supported by this portal provider'), { code: 'SCREEN_TARGET_UNSUPPORTED' });
    let output;
    try {
      output = await run('python3', [helper], { timeout: 50_000, maxBuffer: 20_000, windowsHide: true });
    } catch (error) {
      let detail;
      try { detail = JSON.parse(error.stdout || ''); } catch { /* use process error */ }
      throw Object.assign(new Error(detail?.message || 'Desktop screenshot portal is unavailable'), { code: detail?.code || 'SCREEN_CAPTURE_FAILED' });
    }
    let response;
    try { response = JSON.parse(output.stdout); } catch { throw Object.assign(new Error('Invalid screenshot portal response'), { code: 'SCREEN_CAPTURE_FAILED' }); }
    if (!response.ok) throw Object.assign(new Error(response.code === 'SCREEN_PERMISSION_REQUIRED' ? 'Desktop screenshot was cancelled or denied' : response.message || 'Screenshot failed'), { code: response.code || 'SCREEN_CAPTURE_FAILED' });
    if (typeof response.uri !== 'string' || !response.uri.startsWith('file://')) throw Object.assign(new Error('Screenshot portal returned no local image'), { code: 'SCREEN_CAPTURE_FAILED' });
    const source = fileURLToPath(response.uri);
    const sourceInfo = await stat(source);
    if (!sourceInfo.isFile() || sourceInfo.size > 40_000_000) throw Object.assign(new Error('Screenshot file is invalid or too large'), { code: 'SCREEN_CAPTURE_FAILED' });
    const file = await open(source, 'r');
    const header = Buffer.alloc(24);
    try { await file.read(header, 0, 24, 0); } finally { await file.close(); }
    const png = header.subarray(0, 8).equals(pngSignature);
    const jpeg = header[0] === 0xff && header[1] === 0xd8;
    if (!png && !jpeg) throw Object.assign(new Error('Screenshot portal returned an unsupported image'), { code: 'SCREEN_CAPTURE_FAILED' });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const destination = path.join(directory, `${randomUUID()}.${png ? 'png' : 'jpg'}`);
    await copyFile(source, destination);
    await chmod(destination, 0o600);
    // The portal can save its temporary result in Pictures; retain only the private copy.
    await unlink(source).catch(() => {});
    return { path: destination, mimeType: png ? 'image/png' : 'image/jpeg', bytes: sourceInfo.size, width: png ? header.readUInt32BE(16) : null, height: png ? header.readUInt32BE(20) : null, backend: 'xdg-desktop-portal', target: 'desktop' };
  }
  return { capture };
}
