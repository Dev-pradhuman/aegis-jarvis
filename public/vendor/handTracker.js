/* Adapted from ULTRON Orb UI by Sagar Tamang (MIT).
 * https://github.com/SAGAR-TAMANG/ultron-by-sagar-builds
 *
 * Gesture set: two pinched hands spread or brought together to zoom, and a
 * flat hand twisting at the wrist to spin the model on its own axis.
 *
 * PERFORMANCE. Measured: detectForVideo blocks for 13.3ms average, 18.9ms
 * worst, against a 16.7ms frame budget -- every inference overruns a frame by
 * itself, ~15 times a second. Throttling only changes how OFTEN you stutter.
 *
 * So inference runs in a Web Worker (vendor/handWorker.js) and the main thread
 * only grabs frames. Two earlier attempts used a MODULE worker and failed
 * ("ModuleFactory not set"); MediaPipe's wasm loader is a classic script that
 * needs importScripts, so the working combination is a CLASSIC worker plus the
 * CJS bundle. If the worker fails for any reason we fall back to main-thread
 * inference -- stuttery gestures beat no gestures.
 *
 * The CPU delegate was measured at 97.8ms vs 13.3ms on GPU, so it is only ever
 * a driver fallback, never a preference.
 *
 * Asset URLs point at our own backend so the HUD works without a CDN.
 */

const WASM_PATH = "/vendor/mediapipe/wasm";
const MODEL_PATH = "/vendor/mediapipe/hand_landmarker.task";
const BUNDLE_PATH = "/vendor/mediapipe/vision_bundle.cjs";
const WORKER_PATH = "/vendor/handWorker.js";

// Landmark indices (MediaPipe hand model)
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;

// Pinch hysteresis: thumb-index distance relative to hand size. Two thresholds
// so the grab doesn't flicker while your fingers hover at the boundary.
const PINCH_ON = 0.32;
const PINCH_OFF = 0.45;

// How far a flat hand must twist before it counts, and how much it turns the
// model. The deadzone stops a resting hand from slowly drifting the scene.
const TWIST_DEADZONE = 0.012;   // radians per sample
const TWIST_GAIN = 1.9;

const SMOOTHING = 0.4;          // grab-point follow, higher = snappier
const DETECT_INTERVAL_MS = 45;  // ~22Hz; see the note above about frame cost

class HandTracker {
  constructor(video, overlay, callbacks) {
    this.video = video;
    this.overlay = overlay;
    this.callbacks = callbacks;
    this.landmarker = null;   // main-thread fallback only
    this.worker = null;       // preferred: inference off the main thread
    this.inflight = false;    // one frame outstanding at a time
    this.stream = null;
    this.rafId = 0;
    this.running = false;
    this.lastDetect = 0;
    this.lastVideoTime = -1;

    this.handStates = new Map();   // keyed by handedness so it survives reorder
    this.prevMode = "idle";
    this.prevZoomDist = null;
    this.prevTwist = null;
    this.prevSpinGrab = null;
    this.lastStatus = { hands: 0, mode: "idle" };
    this.latest = [];
  }

  async start() {
    // 480x360 is plenty: the model resizes to its own input anyway, and a
    // smaller frame makes the per-frame ImageBitmap grab cheaper.
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 480, height: 360, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    try {
      await this.startWorker();
    } catch (err) {
      console.warn("[hands] worker unavailable, running on the main thread:", err);
      await this.startMainThread();
    }

    this.running = true;
    this.loop();
  }

  /* Inference in a worker. The main thread only grabs frames. */
  startWorker() {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        // Classic worker on purpose -- see the note at the top of this file.
        worker = new Worker(WORKER_PATH);
      } catch (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        try { worker.terminate(); } catch (_) {}
        reject(new Error("worker init timed out"));
      }, 15000);

      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === "ready") {
          clearTimeout(timer);
          this.worker = worker;
          worker.onmessage = (ev) => this.onWorkerMessage(ev);
          resolve();
        } else if (m.type === "error") {
          clearTimeout(timer);
          try { worker.terminate(); } catch (_) {}
          reject(new Error(m.error));
        }
      };
      worker.onerror = (err) => {
        clearTimeout(timer);
        try { worker.terminate(); } catch (_) {}
        reject(new Error(err.message || "worker failed to load"));
      };
      worker.postMessage({
        type: "init",
        bundle: new URL(BUNDLE_PATH, self.location.origin).href,
        wasmPath: new URL(WASM_PATH, self.location.origin).href,
        modelPath: new URL(MODEL_PATH, self.location.origin).href,
      });
    });
  }

  /* Fallback: stuttery gestures beat no gestures. */
  async startMainThread() {
    const { FilesetResolver, HandLandmarker } = await import(
      "/vendor/mediapipe/vision_bundle.mjs"
    );
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const base = {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, base);
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...base,
        baseOptions: { ...base.baseOptions, delegate: "CPU" },
      });
    }
  }

  onWorkerMessage(e) {
    const m = e.data || {};
    if (m.type === "result") {
      this.inflight = false;
      this.latest = m.landmarks || [];
      this.processHands(this.latest, m.handedness || []);
      this.drawOverlay(this.latest);
    } else if (m.type === "error") {
      this.inflight = false;
      console.warn("[hands] worker error:", m.error);
    }
  }

  loop = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;

    const now = performance.now();
    if (now - this.lastDetect < DETECT_INTERVAL_MS) return;
    this.lastDetect = now;
    this.lastVideoTime = this.video.currentTime;

    if (this.worker) {
      // Skip while one is outstanding: queueing would make the gesture lag
      // behind the hand, which is worse than sampling less often.
      if (this.inflight) return;
      this.inflight = true;
      createImageBitmap(this.video)
        .then((bitmap) => {
          this.worker.postMessage({ type: "frame", bitmap, timestamp: now }, [bitmap]);
        })
        .catch(() => { this.inflight = false; });
      return;
    }

    if (!this.landmarker) return;
    const res = this.landmarker.detectForVideo(this.video, now);
    this.latest = res.landmarks || [];
    this.processHands(this.latest, (res.handedness || []).map((h) => (h[0] && h[0].categoryName) || "?"));
    this.drawOverlay(this.latest);
  };

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    try { this.landmarker && this.landmarker.close(); } catch (_) {}
    this.landmarker = null;
    if (this.worker) {
      try { this.worker.postMessage({ type: "close" }); } catch (_) {}
      try { this.worker.terminate(); } catch (_) {}
      this.worker = null;
    }
    this.inflight = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.handStates.clear();
    this.prevMode = "idle";
    this.prevZoomDist = null;
    this.prevTwist = null;
    this.prevSpinGrab = null;
    const ctx = this.overlay.getContext("2d");
    ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.emitStatus({ hands: 0, mode: "idle" });
  }

  processHands(landmarks, labels) {
    const pinched = [];
    const flat = [];
    const seen = new Set();

    landmarks.forEach((lm, i) => {
      const label = labels[i] || String(i);
      seen.add(label);

      const scale = dist2d(lm[WRIST], lm[MIDDLE_MCP]);
      if (scale < 1e-6) return;
      const pinchRatio = dist2d(lm[THUMB_TIP], lm[INDEX_TIP]) / scale;

      // Mirrored so hand-right reads as screen-right from where you're sitting
      const raw = {
        x: 1 - (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
        y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
      };

      let st = this.handStates.get(label);
      if (!st) { st = { pinching: false, grab: raw }; this.handStates.set(label, st); }

      if (st.pinching && pinchRatio > PINCH_OFF) st.pinching = false;
      else if (!st.pinching && pinchRatio < PINCH_ON) st.pinching = true;

      st.grab = {
        x: st.grab.x + (raw.x - st.grab.x) * SMOOTHING,
        y: st.grab.y + (raw.y - st.grab.y) * SMOOTHING,
      };

      if (st.pinching) { pinched.push(st.grab); return; }

      // Flat hand: fingers extended, not pinching. The palm's roll is the angle
      // of the knuckle line (index MCP -> pinky MCP), which is exactly what
      // turns when you twist your wrist.
      if (isFlat(lm, scale)) {
        flat.push(Math.atan2(lm[PINKY_MCP].y - lm[INDEX_MCP].y, lm[PINKY_MCP].x - lm[INDEX_MCP].x));
      }
    });

    for (const k of this.handStates.keys()) if (!seen.has(k)) this.handStates.delete(k);

    const mode =
      pinched.length >= 2 ? "zoom" :
      flat.length >= 1 ? "twist" :
      pinched.length === 1 ? "spin" : "idle";

    // Reset reference points on any mode change, so switching gestures can't
    // jump the model by the difference between two unrelated measurements.
    if (mode !== this.prevMode) {
      this.prevZoomDist = null;
      this.prevTwist = null;
      this.prevSpinGrab = null;
      this.prevMode = mode;
    }

    if (mode === "zoom") {
      const d = Math.hypot(pinched[0].x - pinched[1].x, pinched[0].y - pinched[1].y);
      if (this.prevZoomDist && d > 1e-4) {
        // Hands apart -> factor < 1 -> camera closer -> zoom in.
        const factor = Math.min(1.18, Math.max(0.85, this.prevZoomDist / d));
        this.callbacks.onZoom(factor);
      }
      this.prevZoomDist = d;
    } else if (mode === "twist") {
      const a = flat[0];
      if (this.prevTwist !== null) {
        let d = a - this.prevTwist;
        while (d > Math.PI) d -= Math.PI * 2;      // shortest way round, so the
        while (d < -Math.PI) d += Math.PI * 2;     // model never spins the long way
        if (Math.abs(d) > TWIST_DEADZONE && this.callbacks.onRoll) {
          this.callbacks.onRoll(-d * TWIST_GAIN);
        }
      }
      this.prevTwist = a;
    } else if (mode === "spin") {
      const g = pinched[0];
      if (this.prevSpinGrab) {
        const dx = g.x - this.prevSpinGrab.x, dy = g.y - this.prevSpinGrab.y;
        if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) this.callbacks.onRotate(dx * 5, dy * 5);
      }
      this.prevSpinGrab = g;
    }

    this.emitStatus({ hands: landmarks.length, mode });
  }

  emitStatus(status) {
    if (status.hands !== this.lastStatus.hands || status.mode !== this.lastStatus.mode) {
      this.lastStatus = status;
      this.callbacks.onStatus(status);
    }
  }

  drawOverlay(landmarks) {
    const ctx = this.overlay.getContext("2d");
    if (!ctx) return;
    const { width, height } = this.overlay;
    ctx.clearRect(0, 0, width, height);

    for (const lm of landmarks) {
      const scale = dist2d(lm[WRIST], lm[MIDDLE_MCP]);
      const isPinch = scale > 1e-6 && dist2d(lm[THUMB_TIP], lm[INDEX_TIP]) / scale < PINCH_ON;
      const isFlatHand = scale > 1e-6 && isFlat(lm, scale);
      const X = (p) => (1 - p.x) * width;   // overlay sits on the mirrored preview
      const Y = (p) => p.y * height;

      if (isFlatHand) {
        // Show the knuckle line being tracked, so it's obvious what twist reads
        ctx.strokeStyle = "#ffcc66";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X(lm[INDEX_MCP]), Y(lm[INDEX_MCP]));
        ctx.lineTo(X(lm[PINKY_MCP]), Y(lm[PINKY_MCP]));
        ctx.stroke();
      }

      ctx.strokeStyle = isPinch ? "#ffcc66" : "rgba(255,170,48,0.5)";
      ctx.lineWidth = isPinch ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(X(lm[THUMB_TIP]), Y(lm[THUMB_TIP]));
      ctx.lineTo(X(lm[INDEX_TIP]), Y(lm[INDEX_TIP]));
      ctx.stroke();

      ctx.fillStyle = isPinch ? "#ffcc66" : "rgba(255,170,48,0.7)";
      for (const p of [lm[THUMB_TIP], lm[INDEX_TIP]]) {
        ctx.beginPath();
        ctx.arc(X(p), Y(p), isPinch ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function dist2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* Flat hand = all four fingers extended. Measured as tip-to-wrist distance
   against the hand's own size, which stays true however the hand is rotated —
   comparing tip.y against pip.y only works while the hand points upward, and
   this gesture is specifically about rotating the hand. */
function isFlat(lm, scale) {
  const far = (tip) => dist2d(lm[tip], lm[WRIST]) / scale > 1.55;
  return far(INDEX_TIP) && far(MIDDLE_TIP) && far(RING_TIP) && far(PINKY_TIP);
}

export { HandTracker };
