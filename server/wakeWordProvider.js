export class WakeWordProvider {
  constructor(options = {}) {
    this.sensitivity = options.sensitivity || 0.5;
    this.cooldownMs = options.cooldownMs || 2000;
    this.falseTriggerCount = 0;
    this.lastTrigger = 0;
    // mock implementation
    this.isInstalled = options.isInstalled ?? true;
  }

  process(audioChunk) {
    if (!this.isInstalled) return false;
    
    const now = Date.now();
    if (now - this.lastTrigger < this.cooldownMs) {
      return false;
    }

    // Since we don't have a real openWakeWord ONNX engine bound yet:
    // NOT_IMPLEMENTED. We return false so push-to-talk remains the primary path.
    // The test mock uses a separate MockWakeWordProvider subclass.
    return false;
  }
}

export class MockWakeWordProvider extends WakeWordProvider {
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
