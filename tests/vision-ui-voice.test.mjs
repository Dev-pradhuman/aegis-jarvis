import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest } from '../server/router.js';
import {
  getVisionSettings,
  updateVisionSettings,
  setLastVisualCapture,
  getLastVisualCapture,
  clearLastVisualCapture,
  isLooking,
  setLooking,
  isWatching,
  setWatching,
  grantScreenConsent,
  hasScreenConsent,
  consumeScreenConsent,
  grantCameraConsent,
  hasCameraConsent,
  consumeCameraConsent,
  resetConsents
} from '../server/visionState.js';
import { describeScreen } from '../server/screenUnderstanding.js';
import { describeCamera } from '../server/cameraUnderstanding.js';

test('WP8: Vision Intent Mapping in router.js', () => {
  const screenQueries = [
    "what's on my screen",
    "what is on my screen",
    "what is this",
    "describe my screen",
    "look at my screen",
    "jarvis, what's on my screen?",
    "look at the screen",
    "describe the screen"
  ];

  for (const query of screenQueries) {
    const route = routeRequest(query);
    assert.equal(route.route, 'TOOL_CALL', `Query "${query}" should route to TOOL_CALL`);
    assert.equal(route.capability, 'screen.describe', `Query "${query}" should map to screen.describe`);
    assert.ok(route.confidence >= 0.9, `Query "${query}" should have confidence >= 0.9`);
  }

  const cameraQueries = [
    "what do you see on camera",
    "what do you see on the camera",
    "what is on camera",
    "what's on camera",
    "look at camera",
    "look at the camera",
    "describe camera",
    "describe the camera"
  ];

  for (const query of cameraQueries) {
    const route = routeRequest(query);
    assert.equal(route.route, 'TOOL_CALL', `Query "${query}" should route to TOOL_CALL`);
    assert.equal(route.capability, 'camera.describe', `Query "${query}" should map to camera.describe`);
    assert.ok(route.confidence >= 0.9, `Query "${query}" should have confidence >= 0.9`);
  }
});

import { osPlatform } from '../server/platform/index.js';

test('WP8: Vision Spoken Response Formatting', async () => {
  // Test that when source is voice, markdown/urls are stripped and clamped to max 3 sentences
  const fakeFetchVoice = async () => ({
    ok: true,
    json: async () => ({
      response: "**Title:** Here is what is open. [Click here](http://example.com) for details. First sentence is clear. Second sentence is concise. Third sentence finishes it. Fourth sentence should be dropped! Fifth sentence is definitely extra."
    })
  });

  const originalCapture = osPlatform.screen.capture;
  const originalGetActive = osPlatform.window?.getActive;
  if (!osPlatform.window) osPlatform.window = {};
  osPlatform.screen.capture = async () => ({ buffer: Buffer.from('synthetic-screen'), timestamp: Date.now() });
  osPlatform.window.getActive = async () => ({ title: 'Code Editor', appId: 'code' });

  try {
    const screenResult = await describeScreen({ source: 'voice', testMode: true }, { fetchImpl: fakeFetchVoice });
    assert.ok(screenResult.description, 'Should return a description');
    assert.ok(!screenResult.description.includes('**'), 'Should not contain markdown bold');
    assert.ok(!screenResult.description.includes('http://'), 'Should not contain URLs');
    const sentences = screenResult.description.match(/[^.!?]+[.!?]+/g) || [];
    assert.ok(sentences.length <= 3, `Should clamp to at most 3 sentences, got ${sentences.length}`);
  } finally {
    osPlatform.screen.capture = originalCapture;
    if (originalGetActive) osPlatform.window.getActive = originalGetActive;
  }

  const fakeFetchCam = async () => ({
    ok: true,
    json: async () => ({
      response: "I see a person smiling at the camera. There is a bookshelf behind them. A cup of coffee rests on the desk. This fourth sentence is extra."
    })
  });

  const camResult = await describeCamera({ source: 'voice', testMode: true }, { fetchImpl: fakeFetchCam });
  assert.ok(camResult.description, 'Should return camera description');
  const camSentences = camResult.description.match(/[^.!?]+[.!?]+/g) || [];
  assert.ok(camSentences.length <= 3, `Camera description should clamp to at most 3 sentences, got ${camSentences.length}`);
});

test('WP8: In-Memory Thumbnail Preview and 30-Second Expiry', async () => {
  clearLastVisualCapture();
  assert.equal(getLastVisualCapture(), null, 'Should start with no capture');

  const fakeBuffer = Buffer.from('test-image-bytes');
  setLastVisualCapture({
    buffer: fakeBuffer,
    mimeType: 'image/jpeg',
    source: 'screen',
    timestamp: Date.now()
  });

  const capture = getLastVisualCapture();
  assert.ok(capture, 'Capture should be stored in memory');
  assert.equal(capture.source, 'screen');
  assert.ok(capture.dataUrl.startsWith('data:image/jpeg;base64,'));
  assert.ok(typeof capture.ageMs === 'number');

  // Test clear
  clearLastVisualCapture();
  assert.equal(getLastVisualCapture(), null, 'Should be cleared after clearLastVisualCapture()');

  // Test expiration logic
  setLastVisualCapture({
    buffer: fakeBuffer,
    mimeType: 'image/png',
    source: 'camera',
    timestamp: Date.now() - 31_000 // artificially aged > 30s
  });
  const expired = getLastVisualCapture();
  assert.equal(expired, null, 'Captures older than 30s should auto-expire');
});

test('WP8: Looking and Watching Indicators', () => {
  setLooking(false);
  setWatching(false);
  assert.equal(isLooking(), false);
  assert.equal(isWatching(), false);

  setLooking(true);
  assert.equal(isLooking(), true);
  setLooking(false);
  assert.equal(isLooking(), false);

  setWatching(true);
  assert.equal(isWatching(), true);
  setWatching(false);
  assert.equal(isWatching(), false);
});

test('WP8: Vision Settings and Blocklist Configuration', () => {
  const initial = getVisionSettings();
  assert.equal(initial.enabled, true);
  assert.ok(initial.blocklist.includes('1password'));

  updateVisionSettings({
    enabled: false,
    blocklist: ['custom-vault', 'banking-portal'],
    maxDimension: 512
  });

  const updated = getVisionSettings();
  assert.equal(updated.enabled, false);
  assert.deepEqual(updated.blocklist, ['custom-vault', 'banking-portal']);
  assert.equal(updated.maxDimension, 512);

  // Restore defaults
  updateVisionSettings({
    enabled: true,
    blocklist: ['1password', 'bitwarden', 'keepass', 'bank', 'auth'],
    maxDimension: 1024
  });
});

test('WP8: Explicit Consent Policies for Screen and Camera', () => {
  resetConsents();

  // Screen consent
  assert.equal(hasScreenConsent(), false);
  // Single-use screen consent
  grantScreenConsent(false);
  assert.equal(hasScreenConsent(), true);
  assert.equal(consumeScreenConsent(), true);
  assert.equal(hasScreenConsent(), false);

  // Session screen consent
  grantScreenConsent(true);
  assert.equal(hasScreenConsent(), true);
  assert.equal(consumeScreenConsent(), true);
  assert.equal(hasScreenConsent(), true); // Remains true because session remembered

  // Camera consent: never remembered for session
  resetConsents();
  assert.equal(hasCameraConsent(), false);
  const result = grantCameraConsent();
  assert.equal(result.session, false, 'Camera consent must never be remembered for session');
  assert.equal(hasCameraConsent(), true);
  assert.equal(consumeCameraConsent(), true);
  assert.equal(hasCameraConsent(), false, 'Camera consent must be strictly single-use');
});

test('WP8: Camera and Screen tool executor integration', async () => {
  const { executeTool } = await import('../server/toolExecutor.js');
  
  // Test camera.list
  const listRes = await executeTool('camera.list', {});
  assert.equal(listRes.ok, true);
  assert.ok(Array.isArray(listRes.data.devices));

  // Test camera.capture
  const capRes = await executeTool('camera.capture', { devicePath: '/dev/video0' });
  assert.equal(capRes.ok, true);
  assert.ok(capRes.data.path || capRes.data.buffer);
});
