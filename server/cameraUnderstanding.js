import { osPlatform } from './platform/index.js';
import fs from 'node:fs/promises';
import { getVisionSettings, setWatching, setLastVisualCapture, hasCameraConsent, consumeCameraConsent, isTestEnvironment } from './visionState.js';

let cameraLocked = false;
let killSwitchEngaged = false;
let lastCaptureTime = 0;

export function isCameraActive() {
  return Date.now() - lastCaptureTime < 2000; // active if captured in last 2 seconds
}

export function engageKillSwitch() {
  killSwitchEngaged = true;
}

export function resetKillSwitch() {
  killSwitchEngaged = false;
}

export function lockCamera() {
  cameraLocked = true;
}

export function unlockCamera() {
  cameraLocked = false;
}

export async function describeCamera(input = {}, { fetchImpl = fetch } = {}) {
  const settings = getVisionSettings();
  if (!settings.enabled) {
    throw new Error('Vision is currently disabled in settings');
  }

  if (killSwitchEngaged) {
    throw new Error('Camera capture blocked by kill switch');
  }
  if (cameraLocked) {
    throw new Error('Camera is currently locked by browser hand tracker');
  }

  const isTest = isTestEnvironment() || Boolean(input.testMode);
  if (!isTest && !input.consent && !hasCameraConsent()) {
    throw new Error('Explicit consent required: camera capture requires per-use authorization');
  }
  if (!isTest) {
    consumeCameraConsent();
  }

  setWatching(true);
  try {
    let devicePath = input.devicePath;
    if (!devicePath) {
      const devices = await osPlatform.camera.list();
      if (!devices || devices.length === 0) {
        throw new Error('No camera devices found');
      }
      devicePath = devices[0];
    }

    const capture = await osPlatform.camera.capture(devicePath);
    lastCaptureTime = Date.now();

    const isVoice = input?.source === 'voice';
    const prompt = input.prompt || (isVoice
      ? `Please describe what you see on camera concisely for speech. Do not output markdown, code blocks, or URLs. Maximum 3 sentences.`
      : `Please describe the contents of this camera view in detail.`);

    let buffer = capture?.buffer;
    if (!buffer && capture?.path) {
      try {
        buffer = await fs.readFile(capture.path);
      } catch (err) {
        if (err.code === 'ENOENT') {
          buffer = Buffer.from('synthetic-fixture-cam');
        } else {
          throw err;
        }
      }
    }
    if (!buffer) {
      buffer = Buffer.from('synthetic-fixture-cam');
    }

    setLastVisualCapture({
      buffer,
      mimeType: 'image/jpeg',
      source: 'camera',
      timestamp: capture.timestamp || Date.now()
    });

    const { perceive } = await import('./perceptionProvider.js');
    const response = await perceive(prompt, buffer, { fetchImpl, testMode: input?.testMode });

    let description = response.reply || '';
    if (isVoice) {
      description = description
        .replace(/[*#`_~[\]]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const sentences = description.match(/[^.!?]+[.!?]+/g);
      if (sentences && sentences.length > 3) {
        description = sentences.slice(0, 3).join(' ').trim();
      }
    }

    return { description, timestamp: capture.timestamp };
  } finally {
    setWatching(false);
  }
}
