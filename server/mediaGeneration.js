import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDirectory } from './platform/paths.js';
import { fetchWithCredentialRotation } from './credentialPool.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const generatedRoot = path.join(dataDirectory(path.dirname(serverDir)), 'generated');
const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

function imageData(payload) {
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.data) return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' };
    }
  }
  return null;
}

function imageExtension(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export async function generateMedia(kind, prompt, fetchImpl = fetch) {
  const cleanPrompt = String(prompt || '').trim().slice(0, 8000);
  if (!cleanPrompt) throw new Error('A media-generation prompt is required');
  if (kind === 'image') {
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
    const { response, credentialRef } = await fetchWithCredentialRotation('GEMINI_API_KEY', (key) => fetchImpl(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: cleanPrompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `Gemini image generation returned HTTP ${response.status}`);
    const generated = imageData(payload); if (!generated) throw new Error('Gemini returned no generated image');
    await mkdir(generatedRoot, { recursive: true });
    const fileName = `${crypto.randomUUID()}.${imageExtension(generated.mimeType)}`; await writeFile(path.join(generatedRoot, fileName), Buffer.from(generated.data, 'base64'));
    return { kind, status: 'completed', model, credentialSlot: credentialRef, url: `/api/generated/${fileName}` };
  }
  if (kind === 'video') {
    const model = process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-generate-preview';
    const { response, credentialRef } = await fetchWithCredentialRotation('GEMINI_API_KEY', (key) => fetchImpl(`${baseUrl}/models/${encodeURIComponent(model)}:predictLongRunning`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ instances: [{ prompt: cleanPrompt }] }) }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `Gemini video generation returned HTTP ${response.status}`);
    if (!payload.name) throw new Error('Gemini returned no video operation');
    return { id: `media-${crypto.randomUUID()}`, kind, status: 'processing', model, credentialSlot: credentialRef, operationName: payload.name, prompt: cleanPrompt, createdAt: new Date().toISOString() };
  }
  throw new Error(`Unsupported media kind: ${kind}`);
}

export async function refreshVideoJob(job, fetchImpl = fetch) {
  if (!job || job.kind !== 'video' || !job.operationName) throw new Error('Video job not found');
  if (job.status === 'completed' || job.status === 'failed') return job;
  const key = process.env[job.credentialSlot]; if (!key) throw new Error(`Credential ${job.credentialSlot} is no longer configured`);
  const response = await fetchImpl(`${baseUrl}/${job.operationName}`, { headers: { 'x-goog-api-key': key } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Gemini video status returned HTTP ${response.status}`);
  if (!payload.done) return { ...job, status: 'processing', checkedAt: new Date().toISOString() };
  if (payload.error) return { ...job, status: 'failed', error: payload.error.message || 'Video generation failed', completedAt: new Date().toISOString() };
  const uri = payload.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  return { ...job, status: uri ? 'completed' : 'failed', downloadUri: uri || null, error: uri ? null : 'Gemini completed without a video URI', completedAt: new Date().toISOString() };
}

export async function downloadVideoJob(job, fetchImpl = fetch) {
  if (!job || job.kind !== 'video' || job.status !== 'completed' || !job.downloadUri) throw new Error('Generated video is not ready');
  const key = process.env[job.credentialSlot];
  if (!key) throw new Error(`Credential ${job.credentialSlot} is no longer configured`);
  const response = await fetchImpl(job.downloadUri, { headers: { 'x-goog-api-key': key } });
  if (!response.ok) throw new Error(`Gemini video download returned HTTP ${response.status}`);
  return {
    content: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers?.get?.('content-type') || 'video/mp4',
  };
}

export async function readGeneratedMedia(fileName) {
  if (!/^[a-f0-9-]+\.(png|jpg|jpeg|webp)$/i.test(fileName)) throw new Error('Invalid generated media path');
  const extension = path.extname(fileName).toLowerCase();
  const contentType = ['.jpg', '.jpeg'].includes(extension) ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : 'image/png';
  return { content: await readFile(path.join(generatedRoot, fileName)), contentType };
}
