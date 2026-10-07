import { osPlatform } from './platform/index.js';
import fs from 'node:fs/promises';

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
  if (killSwitchEngaged) {
    throw new Error('Camera capture blocked by kill switch');
  }
  if (cameraLocked) {
    throw new Error('Camera is currently locked by browser hand tracker');
  }

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

  const prompt = input.prompt || `Please describe the contents of this camera view in detail.`;

  const buffer = await fs.readFile(capture.path);

  const { perceive } = await import('./perceptionProvider.js');
  const response = await perceive(prompt, buffer, { fetchImpl, testMode: input?.testMode });

  return { description: response.reply, timestamp: capture.timestamp };
}
