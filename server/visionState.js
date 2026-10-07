// server/visionState.js

export function isTestEnvironment() {
  return (
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.CI) ||
    process.env.npm_lifecycle_event === 'test' ||
    process.execArgv.includes('--test') ||
    process.argv.some(arg => typeof arg === 'string' && (arg.includes('--test') || arg.includes('tests/')))
  );
}

const DEFAULT_SETTINGS = {
  enabled: true,
  blocklist: ['1password', 'bitwarden', 'keepass', 'bank', 'auth'],
  maxDimension: 1024,
};

let visionSettings = { ...DEFAULT_SETTINGS };

let lastVisualCapture = null;
let captureExpiryTimeout = null;

let isScreenCapturing = false;
let isCameraCapturing = false;

let screenConsentSession = false;
let screenConsentRemaining = 0;
let cameraConsentRemaining = 0;

export function getVisionSettings() {
  return {
    ...visionSettings,
    blocklist: [...visionSettings.blocklist]
  };
}

export function updateVisionSettings(newSettings = {}) {
  if (typeof newSettings.enabled === 'boolean') {
    visionSettings.enabled = newSettings.enabled;
  }
  if (Array.isArray(newSettings.blocklist)) {
    visionSettings.blocklist = newSettings.blocklist.map(s => String(s).toLowerCase().trim()).filter(Boolean);
  }
  if (typeof newSettings.maxDimension === 'number' && newSettings.maxDimension > 0) {
    visionSettings.maxDimension = newSettings.maxDimension;
  }
  return getVisionSettings();
}

export function setLastVisualCapture({ buffer, mimeType = 'image/jpeg', source = 'screen', timestamp = Date.now() }) {
  if (captureExpiryTimeout) {
    clearTimeout(captureExpiryTimeout);
    captureExpiryTimeout = null;
  }

  const base64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(String(buffer)).toString('base64');
  const now = Date.now();
  const captureTime = typeof timestamp === 'number' && !Number.isNaN(timestamp) ? timestamp : now;
  const expiresAt = captureTime + 30_000;

  lastVisualCapture = {
    dataUrl: `data:${mimeType};base64,${base64}`,
    source,
    timestamp: captureTime,
    expiresAt,
  };

  const remainingMs = Math.max(0, expiresAt - now);
  if (Number.isFinite(remainingMs)) {
    captureExpiryTimeout = setTimeout(() => {
      lastVisualCapture = null;
    }, remainingMs);
  }

  return lastVisualCapture;
}

export function getLastVisualCapture() {
  if (!lastVisualCapture) return null;
  if (Date.now() > lastVisualCapture.expiresAt) {
    lastVisualCapture = null;
    return null;
  }
  return {
    ...lastVisualCapture,
    ageMs: Math.max(0, Date.now() - lastVisualCapture.timestamp)
  };
}

export function clearLastVisualCapture() {
  if (captureExpiryTimeout) {
    clearTimeout(captureExpiryTimeout);
    captureExpiryTimeout = null;
  }
  lastVisualCapture = null;
  return { ok: true };
}

export function setLooking(active) {
  isScreenCapturing = Boolean(active);
}

export function isLooking() {
  return isScreenCapturing;
}

export function setWatching(active) {
  isCameraCapturing = Boolean(active);
}

export function isWatching() {
  return isCameraCapturing;
}

export function grantScreenConsent(rememberSession = false) {
  if (rememberSession) {
    screenConsentSession = true;
  } else {
    screenConsentRemaining += 1;
  }
  return { granted: true, session: screenConsentSession };
}

export function hasScreenConsent() {
  return screenConsentSession || screenConsentRemaining > 0;
}

export function consumeScreenConsent() {
  if (screenConsentSession) return true;
  if (screenConsentRemaining > 0) {
    screenConsentRemaining -= 1;
    return true;
  }
  return false;
}

export function grantCameraConsent() {
  // Camera consent is strictly per-capture; never remembered for session
  cameraConsentRemaining += 1;
  return { granted: true, session: false };
}

export function hasCameraConsent() {
  return cameraConsentRemaining > 0;
}

export function consumeCameraConsent() {
  if (cameraConsentRemaining > 0) {
    cameraConsentRemaining -= 1;
    return true;
  }
  return false;
}

export function resetConsents() {
  screenConsentSession = false;
  screenConsentRemaining = 0;
  cameraConsentRemaining = 0;
}
