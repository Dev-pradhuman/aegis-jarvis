import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

export class PiperProvider {
  constructor(options = {}) {
    this.modelPath = options.modelPath || process.env.PIPER_MODEL_PATH || join(process.cwd(), '.cache/voice/piper-voice.onnx');
    this.binaryPath = options.binaryPath || join(process.cwd(), 'bin/piper');
    this.audioPlayback = options.audioPlayback || null;
    this.currentProcess = null;
  }

  async checkModel() {
    try {
      await access(this.modelPath);
    } catch {
      throw Object.assign(new Error('TTS model not found'), { code: 'MODEL_MISSING' });
    }
  }

  async speak(text) {
    await this.checkModel();
    if (!this.audioPlayback) throw new Error('No audio playback configured');

    return new Promise((resolve, reject) => {
      this.currentProcess = spawn(this.binaryPath, ['-m', this.modelPath, '--output_raw']);
      
      let errorOut = '';
      this.currentProcess.stderr.on('data', chunk => errorOut += chunk.toString());

      const playbackPromise = this.audioPlayback.playStream(this.currentProcess.stdout);

      this.currentProcess.on('close', code => {
        this.currentProcess = null;
      });

      this.currentProcess.on('error', err => reject(err));

      this.currentProcess.stdin.on('error', () => {});
      this.currentProcess.stdin.write(text);
      this.currentProcess.stdin.end();
      
      playbackPromise.then(resolve).catch(reject);
    });
  }

  stop() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    if (this.audioPlayback) {
      this.audioPlayback.stop();
    }
  }
}
