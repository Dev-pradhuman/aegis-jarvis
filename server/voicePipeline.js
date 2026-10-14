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
      if (this.state !== 'confirming_response') {
         this.transition('thinking');
      }
      this.emit('transcription', text);
    } catch (err) {
      this.emit('error', err);
      this.transition('error');
    }
  }

  async speak(text) {
    this.transition('speaking');
    if (this.ttsProvider) {
      try {
         await this.ttsProvider.speak(text);
         if (this.state === 'speaking') {
             this.transition('idle');
         }
         return;
      } catch (err) {
         // Log and attempt cloud fallback
      }
    }
    try {
      const { synthesizeSpeech } = await import('./tts.js');
      const res = await synthesizeSpeech({ text });
      if (res && res.audioBuffer && this.audioPlayback) {
        const { Readable } = await import('node:stream');
        await this.audioPlayback.playStream(Readable.from(res.audioBuffer));
      }
    } catch {
      // Fallback failed or text-only
    }
    if (this.state === 'speaking') {
      this.transition('idle');
    }
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
