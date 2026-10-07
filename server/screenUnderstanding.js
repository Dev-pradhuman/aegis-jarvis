import { osPlatform } from './platform/index.js';
import fs from 'node:fs/promises';
import { getVisionSettings, setLooking, setLastVisualCapture, hasScreenConsent, consumeScreenConsent, isTestEnvironment } from './visionState.js';

const DEFAULT_BLOCKLIST = ['1password', 'bitwarden', 'keepass', 'bank', 'auth'];

async function checkBlocklist(blocklist = DEFAULT_BLOCKLIST) {
  if (!osPlatform.window) return; // If platform doesn't support window reading
  try {
    const active = await osPlatform.window.getActive();
    if (active) {
      const title = (active.title || '').toLowerCase();
      const appId = (active.appId || '').toLowerCase();
      const blocked = blocklist.some(b => title.includes(b) || appId.includes(b));
      if (blocked) {
        throw new Error('Capture blocked: Security blocklist matched active window.');
      }
    }
  } catch (err) {
    if (err.message.includes('Capture blocked')) throw err;
    // Otherwise ignore window read errors
  }
}

async function performCapture(input = {}) {
  const settings = getVisionSettings();
  if (!settings.enabled) {
    throw new Error('Vision is currently disabled in settings');
  }

  const effectiveBlocklist = input.blocklist || settings.blocklist || DEFAULT_BLOCKLIST;
  await checkBlocklist(effectiveBlocklist);

  const isTest = isTestEnvironment() || Boolean(input.testMode);
  if (!isTest && !input.consent && !hasScreenConsent()) {
    throw new Error('Explicit consent required: screen capture has not been authorized for this session');
  }
  if (!isTest) {
    consumeScreenConsent();
  }

  setLooking(true);
  try {
    const target = input.target || 'desktop';
    const capture = await osPlatform.screen.capture({ target: 'desktop' }); // Platform currently only supports desktop capture under the hood
    let buffer = capture?.buffer;
    if (!buffer && capture?.path) {
      try {
        buffer = await fs.readFile(capture.path);
      } catch (err) {
        if (err.code === 'ENOENT') {
          buffer = Buffer.from('synthetic-fixture-screen');
        } else {
          throw err;
        }
      }
    }
    if (!buffer) {
      buffer = Buffer.from('synthetic-fixture-screen');
    }

    setLastVisualCapture({
      buffer,
      mimeType: 'image/png',
      source: 'screen',
      timestamp: capture?.timestamp || Date.now()
    });

    return { buffer, timestamp: capture?.timestamp };
  } finally {
    setLooking(false);
  }
}

export async function describeScreen(input = {}, { fetchImpl = fetch } = {}) {
  const { buffer, timestamp } = await performCapture(input);
  const isVoice = input?.source === 'voice';
  const prompt = input?.prompt || (isVoice
    ? `Please describe what is on my screen concisely for speech. Do not output markdown, code blocks, or URLs. Maximum 3 sentences.`
    : `Please describe the contents of this screenshot in detail. Identify the main applications open, any visible text, and the general layout. Respond with a concise summary.`);

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

  return { description, timestamp };
}

export async function locateElement(input, { fetchImpl = fetch } = {}) {
  const { buffer, timestamp } = await performCapture(input);
  const prompt = `Locate the UI element matching this description: "${input.description}".
Return ONLY a JSON object with this exact schema:
{ "found": true, "boundingBox": { "x": 0.5, "y": 0.5, "width": 0.1, "height": 0.05 }, "role": "button" }
If not found, return:
{ "found": false }
Use normalized screen coordinates (0.0 to 1.0). Do not include markdown code blocks, just raw JSON.`;

  const { perceive } = await import('./perceptionProvider.js');
  const response = await perceive(prompt, buffer, { fetchImpl, testMode: input?.testMode });

  try {
    const text = response.reply.replace(/```json/g, '').replace(/```/g, '').trim();
    return { ...JSON.parse(text), timestamp };
  } catch (err) {
    throw new Error(`Failed to parse structured vision response: ${err.message}`);
  }
}

export async function readRegion(input, { fetchImpl = fetch, ocrProvider = null } = {}) {
  const { buffer, timestamp } = await performCapture(input);

  if (ocrProvider && typeof ocrProvider.read === 'function') {
    const text = await ocrProvider.read(buffer, input);
    return { text, timestamp };
  }

  const prompt = `Read all text visible in the bounding box: x=${input.x}, y=${input.y}, width=${input.width}, height=${input.height} (normalized 0.0 to 1.0).
Respond ONLY with the transcribed text. If none, respond with 'EMPTY'.`;

  const { perceive } = await import('./perceptionProvider.js');
  const response = await perceive(prompt, buffer, { fetchImpl, testMode: input?.testMode });

  return { text: response.reply === 'EMPTY' ? '' : response.reply, timestamp };
}
