import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCamera, isCameraActive, engageKillSwitch, resetKillSwitch, lockCamera, unlockCamera } from '../server/cameraUnderstanding.js';
import { osPlatform } from '../server/platform/index.js';

test('WP4: Camera Understanding', async (t) => {
  const originalCapture = osPlatform.camera.capture;
  const originalList = osPlatform.camera.list;

  if (!osPlatform.camera) osPlatform.camera = {};

  osPlatform.camera.list = async () => ['/dev/video0', '/dev/video1'];
  osPlatform.camera.capture = async (devicePath) => {
    return { path: '/tmp/cam.jpg', timestamp: '2026-01-01', device: devicePath };
  };

  const mockFetch = async (url, options) => {
    return { ok: true, status: 200, json: async () => ({ response: 'A fake camera view' }) };
  };

  t.afterEach(() => {
    resetKillSwitch();
    unlockCamera();
  });

  await t.test('describeCamera uses list and capture', async () => {
    const res = await describeCamera({ testMode: true }, { fetchImpl: mockFetch });
    assert.strictEqual(res.description, 'Fake perception response');
    assert.strictEqual(isCameraActive(), true);
  });

  await t.test('describeCamera handles explicit device path', async () => {
    let capturedDevice = null;
    osPlatform.camera.capture = async (devicePath) => {
      capturedDevice = devicePath;
      return { path: '/tmp/cam.jpg', timestamp: '2026-01-01', device: devicePath };
    };

    await describeCamera({ devicePath: '/dev/video1', testMode: true }, { fetchImpl: mockFetch });
    assert.strictEqual(capturedDevice, '/dev/video1');
  });

  await t.test('fails if camera is locked by hand tracker', async () => {
    lockCamera();
    await assert.rejects(
      describeCamera({}, { fetchImpl: mockFetch }),
      /Camera is currently locked by browser hand tracker/
    );
  });

  await t.test('fails if kill switch is engaged', async () => {
    engageKillSwitch();
    await assert.rejects(
      describeCamera({}, { fetchImpl: mockFetch }),
      /Camera capture blocked by kill switch/
    );
  });

  // Restore mocks
  osPlatform.camera.capture = originalCapture;
  if (originalList) osPlatform.camera.list = originalList;
  else delete osPlatform.camera.list;
});
