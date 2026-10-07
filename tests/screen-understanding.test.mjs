import test from 'node:test';
import assert from 'node:assert/strict';
import { describeScreen, locateElement, readRegion } from '../server/screenUnderstanding.js';
import { osPlatform } from '../server/platform/index.js';

test('WP3: Screen understanding', async (t) => {
  const originalCapture = osPlatform.screen.capture;
  const originalGetActive = osPlatform.window ? osPlatform.window.getActive : null;

  if (!osPlatform.window) osPlatform.window = {};

  osPlatform.screen.capture = async () => ({ path: '/tmp/screen.png', timestamp: '2026-01-01' });

  const mockFetch = async (url, options) => {
    return { ok: true, status: 200, json: async () => ({ response: 'Mocked output' }) };
  };

  const mockStructuredFetch = async (url, options) => {
    return { ok: true, status: 200, json: async () => ({ response: '{"found": true}' }) };
  };

  await t.test('describeScreen uses capture and perceive', async () => {
    osPlatform.window.getActive = async () => ({ title: 'Safe App' });
    const res = await describeScreen({ testMode: true }, { fetchImpl: mockFetch });
    assert.strictEqual(res.description, 'Fake perception response');
  });

  await t.test('blocks capture if active window is in blocklist', async () => {
    osPlatform.window.getActive = async () => ({ title: 'My 1Password Vault' });
    await assert.rejects(
      describeScreen({}, { fetchImpl: mockFetch }),
      /Capture blocked: Security blocklist matched/
    );

    osPlatform.window.getActive = async () => ({ appId: 'com.bank.app' });
    await assert.rejects(
      describeScreen({}, { fetchImpl: mockFetch }),
      /Capture blocked: Security blocklist matched/
    );
  });

  await t.test('locateElement returns parsed json', async () => {
    osPlatform.window.getActive = async () => ({ title: 'Safe App' });
    const res = await locateElement({ description: 'btn' }, { fetchImpl: mockStructuredFetch });
    assert.strictEqual(res.found, true);
  });

  await t.test('locateElement without testMode', async () => {
    const res = await locateElement({ description: 'btn' }, { fetchImpl: mockStructuredFetch });
    assert.strictEqual(res.found, true);
  });

  await t.test('readRegion uses optional OCR provider', async () => {
    osPlatform.window.getActive = async () => ({ title: 'Safe App' });
    const ocrProvider = {
      read: async () => 'OCR text'
    };
    const res = await readRegion({ x: 0, y: 0, width: 1, height: 1 }, { ocrProvider });
    assert.strictEqual(res.text, 'OCR text');
  });

  // Restore mocks
  osPlatform.screen.capture = originalCapture;
  if (originalGetActive) osPlatform.window.getActive = originalGetActive;
  else delete osPlatform.window;
});
