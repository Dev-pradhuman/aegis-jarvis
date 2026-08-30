/* Hand-landmark inference, off the main thread.
 *
 * WHY THIS EXISTS, measured: detectForVideo blocks for 13.3ms on average and
 * 18.9ms at worst, against a 16.7ms frame budget. Every inference overruns a
 * frame BY ITSELF, ~15 times a second. Throttling changes how often you stutter,
 * never whether you stutter -- which is why three attempts at tuning the
 * interval never helped.
 *
 * WHY IT IS A CLASSIC WORKER. Two earlier attempts used a MODULE worker and
 * failed with "ModuleFactory not set". MediaPipe's wasm loader
 * (vision_wasm_internal.js) is a classic script that calls importScripts, which
 * module workers do not provide. Shimming importScripts then made the worker
 * fail to load at all. The CJS bundle plus a classic worker is the combination
 * the loader is actually built for -- no shims, no patching.
 *
 * The main thread stays responsible for grabbing frames (createImageBitmap is
 * cheap and must touch the video element); this worker does the expensive part.
 */

/* global importScripts, vision */

let landmarker = null;
let busy = false;

self.onmessage = async (e) => {
  const msg = e.data || {};

  if (msg.type === "init") {
    try {
      // A CJS bundle expects CommonJS globals, which a worker does not have --
      // without these it throws "exports is not defined" the moment it runs.
      // Providing them is what makes importScripts a valid loader for it.
      self.module = { exports: {} };
      self.exports = self.module.exports;

      importScripts(msg.bundle);

      // Depending on the build it either populates module.exports or assigns a
      // global. Take whichever appeared rather than assuming one.
      const V =
        (self.module && self.module.exports && self.module.exports.FilesetResolver
          ? self.module.exports
          : null) ||
        self.vision ||
        self.TasksVision ||
        self.MediaPipeTasksVision;
      if (!V || !V.FilesetResolver) {
        throw new Error("tasks-vision not found after importScripts");
      }

      const fileset = await V.FilesetResolver.forVisionTasks(msg.wasmPath);
      const base = {
        baseOptions: { modelAssetPath: msg.modelPath, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      };
      try {
        landmarker = await V.HandLandmarker.createFromOptions(fileset, base);
      } catch (_) {
        // Only as a driver fallback. CPU was measured at 97.8ms vs 13.3ms on
        // GPU -- seven times worse, so it is never a preference.
        landmarker = await V.HandLandmarker.createFromOptions(fileset, {
          ...base,
          baseOptions: { ...base.baseOptions, delegate: "CPU" },
        });
      }
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", error: String((err && err.message) || err) });
    }
    return;
  }

  if (msg.type === "frame") {
    // Drop frames rather than queue them: a backlog would make the gesture lag
    // behind the hand, which feels worse than a lower sample rate.
    if (!landmarker || busy) {
      if (msg.bitmap && msg.bitmap.close) msg.bitmap.close();
      return;
    }
    busy = true;
    try {
      const res = landmarker.detectForVideo(msg.bitmap, msg.timestamp);
      self.postMessage({
        type: "result",
        landmarks: res.landmarks || [],
        handedness: (res.handedness || []).map((h) => (h[0] && h[0].categoryName) || "?"),
      });
    } catch (err) {
      self.postMessage({ type: "error", error: String((err && err.message) || err) });
    } finally {
      if (msg.bitmap && msg.bitmap.close) msg.bitmap.close();
      busy = false;
    }
    return;
  }

  if (msg.type === "close") {
    try { landmarker && landmarker.close(); } catch (_) {}
    landmarker = null;
    self.close();
  }
};
