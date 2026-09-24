import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const bridgeUrl = new URL('../public/brain/main.js', import.meta.url);
const htmlUrl = new URL('../index.html', import.meta.url);

const offlineAssetMinimums = new Map([
  ['../public/vendor/mediapipe/vision_bundle.cjs', 100_000],
  ['../public/vendor/mediapipe/vision_bundle.mjs', 100_000],
  ['../public/vendor/mediapipe/hand_landmarker.task', 1_000_000],
  ['../public/vendor/mediapipe/wasm/vision_wasm_internal.js', 100_000],
  ['../public/vendor/mediapipe/wasm/vision_wasm_internal.wasm', 1_000_000],
  ['../public/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js', 100_000],
  ['../public/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm', 1_000_000],
]);

test('the neural brain bridge binds every gesture and cleans up resources', async () => {
  const bridge = await readFile(bridgeUrl, 'utf8');
  const html = await readFile(htmlUrl, 'utf8');

  assert.match(bridge, /onRotate: \(dTheta, dPhi\) => scene\.rotateBy\(dTheta, dPhi\)/);
  assert.match(bridge, /onRoll: \(rad\) => scene\.spinBy\(rad\)/);
  assert.match(bridge, /onZoom: \(factor\) => scene\.zoomBy\(factor\)/);
  assert.match(bridge, /tracker\.stop\(\);[\s\S]*scene\.dispose\(\)/);
  assert.match(bridge, /Offline gesture assets missing/);

  assert.match(html, /"three": "\/vendor\/three\/three\.module\.min\.js"/);
  assert.match(html, /"three\/addons\/": "\/vendor\/three\/addons\/"/);
  assert.match(html, /location\.pathname === '\/legacy'/);
  assert.match(html, /brainScript\.src = '\/brain\/main\.js'/);
});

test('offline gesture runtime and model assets are present', async () => {
  for (const [relativePath, minimumBytes] of offlineAssetMinimums) {
    const asset = await stat(new URL(relativePath, import.meta.url));
    assert.ok(
      asset.size >= minimumBytes,
      `${relativePath} is unexpectedly small (${asset.size} bytes)`,
    );
  }
});
