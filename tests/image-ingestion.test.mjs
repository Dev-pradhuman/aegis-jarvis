import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestImage } from '../server/imageIngestion.js';

test('WP2: Image Ingestion', async (t) => {
  await t.test('enforces byte cap', async () => {
    const hugeBuffer = Buffer.alloc(10 * 1024 * 1024);
    await assert.rejects(
      ingestImage(hugeBuffer),
      /Image size exceeds maximum allowed size/
    );
  });

  await t.test('validates type JPEG', async () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const res = await ingestImage(jpegBuffer);
    assert.strictEqual(res.mimeType, 'image/jpeg');
  });

  await t.test('validates type PNG', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await ingestImage(pngBuffer);
    assert.strictEqual(res.mimeType, 'image/png');
  });

  await t.test('fails on unsupported type', async () => {
    const randomBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    await assert.rejects(
      ingestImage(randomBuffer),
      /Unsupported image format/
    );
  });
});
