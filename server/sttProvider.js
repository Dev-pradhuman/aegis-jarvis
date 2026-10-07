import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

export class WhisperProvider {
  constructor(options = {}) {
    this.modelPath = options.modelPath || process.env.WHISPER_MODEL_PATH || join(process.cwd(), '.cache/voice/whisper-tiny.en.bin');
    this.binaryPath = options.binaryPath || join(process.cwd(), 'bin/whisper');
    this.timeoutMs = options.timeoutMs || 10000;
  }

  async transcribe(audioBuffer) {
    try {
      await access(this.modelPath);
    } catch {
      throw Object.assign(new Error('STT model not found. Please download it.'), { code: 'MODEL_MISSING' });
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, ['-m', this.modelPath, '-f', '-']);
      
      let output = '';
      child.stdout.on('data', chunk => output += chunk.toString());
      
      let errorOut = '';
      child.stderr.on('data', chunk => errorOut += chunk.toString());

      const timer = setTimeout(() => {
        child.kill();
        reject(Object.assign(new Error('Transcription timed out'), { code: 'TIMEOUT' }));
      }, this.timeoutMs);

      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(Object.assign(new Error(`Transcription failed: ${errorOut}`), { code: 'EXEC_ERROR' }));
          return;
        }
        resolve(output.trim());
      });

      child.on('error', err => {
        clearTimeout(timer);
        reject(Object.assign(new Error(`Spawn error: ${err.message}`), { code: 'SPAWN_ERROR' }));
      });

      child.stdin.on('error', () => {});
      child.stdin.write(audioBuffer);
      child.stdin.end();
    });
  }
}

export class FakeSTTProvider {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 10;
    this.shouldFail = options.shouldFail || false;
    this.failCode = options.failCode || 'MODEL_MISSING';
    this.mockText = options.mockText || 'test transcription';
  }

  async transcribe(audioBuffer) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.shouldFail) {
          reject(Object.assign(new Error('Fake STT failure'), { code: this.failCode }));
        } else {
          resolve(this.mockText);
        }
      }, this.timeoutMs);
    });
  }
}
