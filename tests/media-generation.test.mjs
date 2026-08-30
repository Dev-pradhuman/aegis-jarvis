import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { generateMedia } from '../server/mediaGeneration.js';

test('image generation uses Gemini generateContent with image response modality', async () => {
  process.env.GEMINI_API_KEY = 'test';
  process.env.GEMINI_IMAGE_MODEL = 'image-test';
  let request;
  const media = await generateMedia('image', 'amber neural brain', async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('image').toString('base64') } }] } }] }) };
  });
  assert.match(request.url, /image-test:generateContent/);
  assert.deepEqual(request.body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.equal(media.status, 'completed');
  assert.match(media.url, /^\/api\/generated\/[a-f0-9-]+\.png$/);
  await unlink(path.join(process.cwd(), 'server', 'data', 'generated', path.basename(media.url)));
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_IMAGE_MODEL;
});

test('video generation uses configured Veo model and returns a durable operation record', async () => { process.env.GEMINI_API_KEY = 'test'; process.env.GEMINI_VIDEO_MODEL = 'veo-test'; let request; const media = await generateMedia('video', 'flying robot', async (url, init) => { request = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ name: 'operations/video-1' }) }; }); assert.match(request.url, /veo-test:predictLongRunning/); assert.equal(request.body.instances[0].prompt, 'flying robot'); assert.equal(media.status, 'processing'); assert.equal(media.operationName, 'operations/video-1'); delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_VIDEO_MODEL; });
