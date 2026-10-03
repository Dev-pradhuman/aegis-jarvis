import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

export async function listCameras() {
  try {
    const files = await readdir('/dev');
    const videoFiles = files.filter(f => f.startsWith('video'));
    const cameras = [];
    for (const f of videoFiles) {
      try {
        const stats = await stat(`/dev/${f}`);
        if (stats.isCharacterDevice()) {
          cameras.push(`/dev/${f}`);
        }
      } catch (e) {
        // ignore
      }
    }
    return cameras;
  } catch (e) {
    return [];
  }
}

export async function captureCamera(devicePath = '/dev/video0') {
  if (!devicePath.startsWith('/dev/video')) throw new Error('Invalid camera device path');
  
  const tmpPath = path.join(tmpdir(), `aegis-jarvis-camera-${crypto.randomUUID()}.jpg`);
  
  try {
    // Attempt to capture a single frame using ffmpeg
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'video4linux2',
      '-i', devicePath,
      '-vframes', '1',
      tmpPath
    ]);
    return { ok: true, path: tmpPath, timestamp: new Date().toISOString() };
  } catch (err) {
    throw Object.assign(new Error(`Failed to capture from camera ${devicePath}`), { code: 'CAMERA_CAPTURE_FAILED' });
  }
}
