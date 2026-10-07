import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

export class PiperProvider {
  constructor(options = {}) {
    this.modelPath = options.modelPath || join(process.cwd(), 'server/data/piper-voice.onnx');
    this.binaryPath = options.binaryPath || join(process.cwd(), 'bin/piper');
    this.playBinary = options.playBinary || 'aplay';
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
    return new Promise((resolve, reject) => {
      this.currentProcess = spawn(this.binaryPath, ['-m', this.modelPath, '--output_raw']);
      const playProcess = spawn(this.playBinary, ['-f', 'S16_LE', '-r', '22050', '-c', '1']);

      this.currentProcess.stdout.pipe(playProcess.stdin);
      
      let errorOut = '';
      this.currentProcess.stderr.on('data', chunk => errorOut += chunk.toString());

      playProcess.on('close', code => {
        this.currentProcess = null;
        if (code !== 0 && code !== null) {
          reject(new Error(`Playback failed: code ${code}`));
        } else {
          resolve();
        }
      });

      this.currentProcess.on('error', err => reject(err));
      playProcess.on('error', err => reject(err));

      this.currentProcess.stdin.write(text);
      this.currentProcess.stdin.end();
    });
  }

  stop() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
  }
}
