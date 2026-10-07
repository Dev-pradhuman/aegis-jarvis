export class EnergyVADProvider {
  constructor(options = {}) {
    this.energyThreshold = options.energyThreshold || 500;
    this.silenceDurationMs = options.silenceDurationMs || 1000;
    this.sampleRate = options.sampleRate || 16000;
    this.bytesPerSample = 2; // 16-bit
    this.buffer = Buffer.alloc(0);
    this.lastSpeechTime = 0;
    this.isSpeaking = false;
  }

  process(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    // Calculate RMS energy
    let energySum = 0;
    const samples = chunk.length / this.bytesPerSample;
    for (let i = 0; i < chunk.length; i += this.bytesPerSample) {
      const sample = chunk.readInt16LE(i);
      energySum += sample * sample;
    }
    const rms = Math.sqrt(energySum / samples);
    
    const now = Date.now();

    if (rms > this.energyThreshold) {
      this.isSpeaking = true;
      this.lastSpeechTime = now;
      return false;
    }

    if (this.isSpeaking && (now - this.lastSpeechTime > this.silenceDurationMs)) {
      this.isSpeaking = false;
      return true; // End of speech detected
    }

    return false;
  }

  flush() {
    const result = this.buffer;
    this.buffer = Buffer.alloc(0);
    this.isSpeaking = false;
    this.lastSpeechTime = 0;
    return result;
  }
}
