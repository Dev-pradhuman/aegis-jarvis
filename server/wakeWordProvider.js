export class WakeWordProvider {
  constructor(options = {}) {
    this.status = 'NOT_IMPLEMENTED';
    this.sensitivity = options.sensitivity || 0.5;
    this.cooldownMs = options.cooldownMs || 2000;
    this.falseTriggerCount = 0;
    this.lastTrigger = 0;
    // Real openWakeWord engine is not integrated into Node runtime.
    // Heuristic fake cannot be selected from production config; push-to-talk is primary.
    this.isInstalled = false;
  }

  process(audioChunk) {
    // Real wake word provider is NOT_IMPLEMENTED.
    // Always returns false so push-to-talk remains the primary path.
    return false;
  }
}

export class MockWakeWordProvider extends WakeWordProvider {
  constructor(options = {}) {
    super(options);
    this.isInstalled = options.isInstalled ?? true;
    this.status = 'WORKING_TESTED';
  }

  process(audioChunk) {
    if (!this.isInstalled) return false;
    
    const now = Date.now();
    if (now - this.lastTrigger < this.cooldownMs) {
      return false;
    }

    const isWakeWord = audioChunk.toString().includes('WAKE');
    if (isWakeWord) {
      if (this.sensitivity > 0.9 && Math.random() > 0.5) {
        this.falseTriggerCount++;
        return false;
      }
      this.lastTrigger = now;
      return true;
    }
    return false;
  }
}
