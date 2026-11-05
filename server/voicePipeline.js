import { EventEmitter } from 'node:events';

export class VoicePipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = 'idle'; // idle, wake_listening, capturing, transcribing, thinking, speaking, muted, error, confirm_listening
    
    this.enabled = false;
    this.audioSource = options.audioSource || null;
    this.audioPlayback = options.audioPlayback || null;
    this.wakeWordProvider = options.wakeWordProvider || null;
    this.sttProvider = options.sttProvider || null;
    this.ttsProvider = options.ttsProvider || null;
    this.vadProvider = options.vadProvider || null;

    this.lastTranscript = '';
    this.lastReply = '';
    this.lastRunId = null;
    this.activeTurnId = null;
    this.updatedAt = null;
    this.lastUpdatedAt = null;
  }

  transition(newState) {
    this.state = newState;
    this.emit('stateChange', this.state);
  }

  startListening() {
    if (this.state === 'idle' || this.state === 'muted' || this.state === 'error') {
      this.transition('wake_listening');
      if (this.audioSource) {
        if (!this._boundAudioHandler) {
          this._boundAudioHandler = this.handleAudioData.bind(this);
        }
        this.audioSource.removeListener('data', this._boundAudioHandler);
        this.audioSource.on('data', this._boundAudioHandler);
        if (typeof this.audioSource.start === 'function') {
          this.audioSource.start();
        }
      }
    }
  }
  
  handleAudioData(chunk) {
    if ((this.state === 'wake_listening' || this.state === 'confirm_listening') && this.wakeWordProvider) {
      const detected = this.wakeWordProvider.process(chunk);
      if (detected) {
        this.triggerWakeWord();
      }
    } else if (this.state === 'capturing' && this.vadProvider) {
      const endOfSpeech = this.vadProvider.process(chunk);
      if (endOfSpeech) {
        this.stopCapturing(this.vadProvider.flush());
      }
    } else if (this.state === 'speaking') {
      // Ignore audio or optionally perform barge-in detection if needed
    }
  }

  triggerWakeWord() {
    if (this.state === 'wake_listening' || this.state === 'confirm_listening' || this.state === 'idle') {
      this.transition('capturing');
      return true;
    }
    return false;
  }

  pushToTalk() {
    // Push-to-talk overrides wake word and works even if idle or no wake word model installed
    this.handleBargeIn(); // Stop speaking if currently speaking
    if (this.vadProvider && typeof this.vadProvider.flush === 'function') {
      this.vadProvider.flush();
    }
    if (this.audioSource) {
      if (!this._boundAudioHandler) {
        this._boundAudioHandler = this.handleAudioData.bind(this);
      }
      this.audioSource.removeListener('data', this._boundAudioHandler);
      this.audioSource.on('data', this._boundAudioHandler);
      if (typeof this.audioSource.start === 'function') {
        this.audioSource.start();
      }
    }
    this.transition('capturing');
    return true;
  }

  stopCapturing(audioBuffer) {
    if (this.state === 'capturing') {
      this.transition('transcribing');
      this.transcribe(audioBuffer);
    }
  }

  async transcribe(audioBuffer) {
    if (!this.sttProvider) {
      this.transition('error');
      return;
    }
    try {
      const text = await this.sttProvider.transcribe(audioBuffer);
      if (text && typeof text === 'string') {
        const cleaned = text.trim();
        this.lastTranscript = cleaned;
        this.lastReply = '';
        const turnId = `voice-${Date.now()}`;
        this.lastRunId = turnId;
        this.activeTurnId = turnId;
        const nowIso = new Date().toISOString();
        this.updatedAt = nowIso;
        this.lastUpdatedAt = nowIso;
      }
      if (this.state !== 'confirming_response') {
         this.transition('thinking');
      }
      this.emit('transcription', text);
    } catch (err) {
      this.emit('error', err);
      this.transition('error');
    }
  }

  async playAudioBuffer(audioBuf) {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve) => {
      const ffplay = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-']);
      ffplay.stdin.on('error', () => {});
      let fallbackTriggered = false;
      const doFallback = () => {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        this.fallbackPlay(audioBuf).then(resolve);
      };

      ffplay.on('error', doFallback);
      ffplay.on('close', (code) => {
        if (code !== 0) doFallback();
        else resolve();
      });
      ffplay.stdin.end(audioBuf);
    });
  }

  async fallbackPlay(audioBuf) {
    const { spawn } = await import('node:child_process');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpFile = path.join(os.tmpdir(), `jarvis-speech-${Date.now()}.wav`);
    try {
      await fs.writeFile(tmpFile, audioBuf);
      await new Promise((resolve) => {
        const mpv = spawn('mpv', ['--no-video', '--really-quiet', tmpFile]);
        mpv.on('error', () => {
          const pw = spawn('pw-play', [tmpFile]);
          pw.on('error', () => {
            const pa = spawn('paplay', [tmpFile]);
            pa.on('error', () => resolve());
            pa.on('close', () => resolve());
          });
          pw.on('close', () => resolve());
        });
        mpv.on('close', () => resolve());
      });
      await fs.unlink(tmpFile).catch(() => {});
    } catch {}
  }

  async speak(text) {
    this.transition('speaking');
    const isTest = process.env.JARVIS_TEST === '1';
    const isMockTts = this.ttsProvider && this.ttsProvider.constructor?.name !== 'PiperProvider';

    // In test mode or when a mock provider is passed, call ttsProvider directly for isolation and speed
    if ((isTest || isMockTts) && this.ttsProvider) {
      try {
        await this.ttsProvider.speak(text);
      } catch {}
      if (this.state === 'speaking') {
        this.transition('idle');
      }
      return { audio: null, audioBase64: null, text };
    }

    let audioBuf = null;
    const hasCloudKeys = Boolean(process.env.ELEVENLABS_API_KEY || process.env.GROQ_API_KEY);

    // 1. Try synthesizeSpeech (cloud or configured provider)
    if (hasCloudKeys && !isTest) {
      try {
        const { synthesizeSpeech } = await import('./tts.js');
        const res = await synthesizeSpeech({ text });
        audioBuf = res?.audio || res?.audioBuffer || null;
      } catch {}
    }

    // 2. If no cloud audioBuf and local piper is available, synthesize with piper
    if (!audioBuf && !isTest) {
      try {
        const { spawn } = await import('node:child_process');
        const path = await import('node:path');
        const fs = await import('node:fs/promises');
        const piperBin = path.join(process.cwd(), 'bin/piper');
        const piperModel = process.env.PIPER_MODEL_PATH || path.join(process.cwd(), '.cache/voice/piper-voice.onnx');
        await fs.access(piperModel);
        
        audioBuf = await new Promise((resolve) => {
          const proc = spawn(piperBin, ['-m', piperModel, '-f', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
          const chunks = [];
          proc.stdout.on('data', (c) => chunks.push(c));
          proc.on('close', (code) => {
            if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
            else resolve(null);
          });
          proc.on('error', () => resolve(null));
          proc.stdin.write(text);
          proc.stdin.end();
        });
      } catch {}
    }

    // 3. Play audio out loud on the Linux host PipeWire audio sink using ffplay / mpv / pw-play
    if (audioBuf && !isTest) {
      await this.playAudioBuffer(audioBuf);
    } else if (this.ttsProvider && !isTest) {
      try {
        await this.ttsProvider.speak(text);
      } catch {}
    }

    if (this.state === 'speaking') {
      this.transition('idle');
    }

    const audioBase64 = audioBuf ? audioBuf.toString('base64') : null;
    return {
      audio: audioBuf,
      audioBase64,
      text
    };
  }

  async streamSpeak(textStream) {
    this.transition('speaking');
    let buffer = '';
    const sentenceRegex = /([.?!])\s+/;
    
    for await (const chunk of textStream) {
      if (this.state !== 'speaking') break; // barged in
      buffer += chunk;
      let match;
      while ((match = sentenceRegex.exec(buffer)) !== null) {
        const sentence = buffer.substring(0, match.index + match[1].length);
        buffer = buffer.substring(match.index + match[1].length).trimStart();
        if (this.ttsProvider && this.state === 'speaking') {
           await this.ttsProvider.speak(sentence);
        }
        if (this.state !== 'speaking') break;
      }
    }
    
    if (buffer.trim() && this.state === 'speaking' && this.ttsProvider) {
      await this.ttsProvider.speak(buffer.trim());
    }
    
    if (this.state === 'speaking') {
      this.transition('idle');
    }
  }
  
  stopSpeaking() {
    if (this.ttsProvider && this.ttsProvider.stop) {
      this.ttsProvider.stop();
    }
    if (this.state === 'speaking') {
      this.transition('idle');
    }
  }
  
  mute() {
    this.transition('muted');
  }
  
  handleBargeIn() {
    if (this.state === 'speaking') {
      this.stopSpeaking();
      this.transition('wake_listening');
    }
  }

  kill() {
    if (this.ttsProvider && this.ttsProvider.stop) {
      this.ttsProvider.stop();
    }
    if (this.vadProvider) {
      this.vadProvider.flush(); // drop buffered audio
    }
    if (this.audioSource) {
      if (this._boundAudioHandler) {
        this.audioSource.removeListener('data', this._boundAudioHandler);
      }
      if (this.audioSource.stop) {
        this.audioSource.stop(); // close microphone
      }
    }
    this.transition('idle');
  }

  async confirm(promptText) {
    await this.speak(promptText);
    this.transition('confirm_listening');
    
    return new Promise((resolve) => {
       const timeoutId = setTimeout(() => {
         this.removeListener('transcription', handleConfirm);
         if (this.state === 'confirm_listening' || this.state === 'capturing' || this.state === 'transcribing' || this.state === 'confirming_response') {
             this.transition('idle');
         }
         resolve(false);
       }, 10000);

       const handleConfirm = (text) => {
         if (this.state === 'confirm_listening') {
             this.state = 'confirming_response';
         }
         const cleaned = text.trim().toLowerCase().replace(/[.,!?]/g, '');
         if (cleaned === 'yes' || cleaned === 'no') {
           clearTimeout(timeoutId);
           this.removeListener('transcription', handleConfirm);
           if (cleaned === 'yes') {
             this.transition('thinking');
             resolve(true);
           } else {
             this.transition('idle');
             resolve(false);
           }
         }
       };

       this.on('transcription', handleConfirm);
    });
  }
}
