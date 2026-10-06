import { osPlatform } from './platform/index.js';
import { executeModelPool } from './modelPool.js';

export async function describeScreen(input, { fetchImpl = fetch } = {}) {
  const capture = await osPlatform.screen.capture({ target: 'desktop' });
  const prompt = `Please describe the contents of this screenshot in detail. Identify the main applications open, any visible text, and the general layout. Respond with a concise summary.`;
  const response = await executeModelPool({
    logicalModel: 'perception',
    request: prompt,
    attachments: [{ type: 'image/png', url: `file://${capture.path}` }],
    requiredModality: 'image',
    fetchImpl
  });
  return { description: response.reply, timestamp: capture.timestamp };
}

export async function locateElement(input, { fetchImpl = fetch } = {}) {
  const capture = await osPlatform.screen.capture({ target: 'desktop' });
  const prompt = `Locate the UI element matching this description: "${input.description}".
Return ONLY a JSON object with this exact schema:
{ "found": true, "boundingBox": { "x": 0.5, "y": 0.5, "width": 0.1, "height": 0.05 }, "role": "button" }
If not found, return:
{ "found": false }
Use normalized screen coordinates (0.0 to 1.0). Do not include markdown code blocks, just raw JSON.`;
  const response = await executeModelPool({
    logicalModel: 'perception',
    request: prompt,
    attachments: [{ type: 'image/png', url: `file://${capture.path}` }],
    requiredModality: 'image',
    fetchImpl,
    requiredCapability: 'structured_output',
    fetchImpl
  });
  
  try {
    const text = response.reply.replace(/```json/g, '').replace(/```/g, '').trim();
    return { ...JSON.parse(text), timestamp: capture.timestamp };
  } catch (err) {
    throw new Error(`Failed to parse structured vision response: ${err.message}`);
  }
}

export async function readRegion(input, { fetchImpl = fetch } = {}) {
  const capture = await osPlatform.screen.capture({ target: 'desktop' });
  const prompt = `Read all text visible in the bounding box: x=${input.x}, y=${input.y}, width=${input.width}, height=${input.height} (normalized 0.0 to 1.0).
Respond ONLY with the transcribed text. If none, respond with 'EMPTY'.`;
  const response = await executeModelPool({
    logicalModel: 'perception',
    request: prompt,
    attachments: [{ type: 'image/png', url: `file://${capture.path}` }],
    requiredModality: 'image',
    fetchImpl
  });
  return { text: response.reply === 'EMPTY' ? '' : response.reply, timestamp: capture.timestamp };
}
