import { osPlatform } from './platform/index.js';
import { executeModelPool } from './modelPool.js';

export async function describeCamera(input, { fetchImpl = fetch } = {}) {
  const devicePath = input.devicePath || '/dev/video0';
  const capture = await osPlatform.camera.capture(devicePath);
  const prompt = input.prompt || `Please describe the contents of this camera view in detail.`;
  
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(capture.path);
  
  const { perceive } = await import('./perceptionProvider.js');
  const response = await perceive(prompt, buffer, { fetchImpl, testMode: input?.testMode });
  
  return { description: response.reply, timestamp: capture.timestamp };
}
