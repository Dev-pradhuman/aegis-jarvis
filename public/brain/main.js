import { createOrbScene } from '../vendor/orbScene.js';
import { HandTracker } from '../vendor/handTracker.js';

const REQUIRED_GESTURE_ASSETS = [
  new URL('../vendor/mediapipe/vision_bundle.cjs', import.meta.url).href,
  new URL('../vendor/mediapipe/hand_landmarker.task', import.meta.url).href,
  new URL('../vendor/mediapipe/wasm/vision_wasm_internal.wasm', import.meta.url).href,
];

async function assertGestureAssets() {
  const checks = await Promise.all(REQUIRED_GESTURE_ASSETS.map(async (path) => {
    try {
      const response = await fetch(path, { method: 'HEAD' });
      const contentType = response.headers.get('content-type') || '';
      return response.ok && !contentType.includes('text/html') ? null : path;
    } catch {
      return path;
    }
  }));
  const missing = checks.filter(Boolean);
  if (missing.length) {
    throw new Error(`Offline gesture assets missing: ${missing.join(', ')}`);
  }
}

export function mountNeuralBrain({ container, video, overlay, onStatus, onCameraChange, onError }) {
  const scene = createOrbScene(container, {
    tint: [1.12, 0.9, 0.62],
    onContextLost: () => onError?.('The WebGL context was lost. Reload the Brain tab to restart it.'),
  });

  const tracker = new HandTracker(video, overlay, {
    onRotate: (dTheta, dPhi) => scene.rotateBy(dTheta, dPhi),
    onRoll: (rad) => scene.spinBy(rad),
    onZoom: (factor) => scene.zoomBy(factor),
    onStatus: (status) => onStatus?.(status),
  });

  let cameraRunning = false;
  let disposed = false;

  async function startCamera() {
    if (disposed || cameraRunning) return;
    try {
      await assertGestureAssets();
      await tracker.start();
      if (disposed) {
        tracker.stop();
        return;
      }
      cameraRunning = true;
      onCameraChange?.(true);
    } catch (error) {
      tracker.stop();
      const message = error?.message || 'Camera or gesture model initialization failed.';
      onError?.(message);
      throw error;
    }
  }

  function stopCamera() {
    if (disposed || !cameraRunning) return;
    tracker.stop();
    cameraRunning = false;
    onCameraChange?.(false);
  }

  async function toggleCamera() {
    if (cameraRunning) stopCamera();
    else await startCamera();
  }

  function dispose() {
    if (disposed) return;
    tracker.stop();
    cameraRunning = false;
    disposed = true;
    scene.dispose();
  }

  return { scene, startCamera, stopCamera, toggleCamera, dispose };
}

window.mountNeuralBrain = mountNeuralBrain;
window.dispatchEvent(new Event('neural-brain-ready'));
