import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

export class AudioCapture extends EventEmitter {
  constructor(options = {}) {
    super();
    this.captureCommand = options.captureCommand || 'arecord'; // pw-record or arecord
    this.captureArgs = options.captureArgs || ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-q'];
    this.process = null;
  }

  start() {
    if (this.process) return;
    this.process = spawn(this.captureCommand, this.captureArgs);
    
    this.process.stdout.on('data', chunk => this.emit('data', chunk));
    
    this.process.on('error', err => {
      this.emit('error', Object.assign(new Error(`Capture error: ${err.message}`), { code: 'CAPTURE_ERROR' }));
      this.stop();
    });

    this.process.on('close', code => {
      if (code !== 0 && code !== null) {
         this.emit('error', Object.assign(new Error(`Capture closed with code ${code}`), { code: 'CAPTURE_ERROR' }));
      }
      this.process = null;
    });
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
  }
}

export class AudioPlayback {
  constructor(options = {}) {
    this.playCommand = options.playCommand || 'aplay'; // pw-play or aplay
    this.playArgs = options.playArgs || ['-f', 'S16_LE', '-r', '22050', '-c', '1', '-q'];
    this.process = null;
  }

  playStream(sourceStream) {
    return new Promise((resolve, reject) => {
      this.stop();
      this.process = spawn(this.playCommand, this.playArgs);
      
      this.process.stdin.on('error', () => {});
      sourceStream.on?.('error', () => {});
      sourceStream.pipe(this.process.stdin);
      
      this.process.on('error', err => {
        reject(Object.assign(new Error(`Playback error: ${err.message}`), { code: 'PLAYBACK_ERROR' }));
        this.stop();
      });

      this.process.on('close', code => {
        this.process = null;
        resolve();
      });
    });
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
  }
}
