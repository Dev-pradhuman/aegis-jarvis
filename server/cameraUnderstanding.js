import { osPlatform } from './platform/index.js';
import { executeModelPool } from './modelPool.js';

export async function describeCamera(input, { fetchImpl = fetch } = {}) {
  const devicePath = input.devicePath || '/dev/video0';
  const capture = await osPlatform.camera.capture(devicePath);
  const prompt = input.prompt || `Please describe the contents of this camera view in detail.`;
  const response = await executeModelPool({
    logicalModel: 'nemotron-3-nano-omni',
    request: prompt,
    attachments: [{ type: 'image/jpeg', url: `file://${capture.path}` }],
    requiredModality: 'image',
    fetchImpl

  });
  return { description: response.reply, timestamp: capture.timestamp };
}
