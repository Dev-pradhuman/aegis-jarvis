import { EventEmitter } from 'node:events';

export class VoicePipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = 'idle'; // idle, wake_listening, capturing, transcribing, thinking, speaking, muted, error
    
    // Providers
    this.audioSource = options.audioSource || null;
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
        this.audioSource.on('data', this.handleAudioData.bind(this));
      }
    }
  }
  
  handleAudioData(chunk) {
    if (this.state === 'wake_listening' && this.wakeWordProvider) {
      const detected = this.wakeWordProvider.process(chunk);
      if (detected) {
        this.triggerWakeWord();
      }
    } else if (this.state === 'capturing' && this.vadProvider) {
      const endOfSpeech = this.vadProvider.process(chunk);
      if (endOfSpeech) {
        this.stopCapturing(this.vadProvider.flush());
      }
    }
  }

  triggerWakeWord() {
    if (this.state === 'wake_listening' || this.state === 'idle') {
      this.transition('capturing');
      return true;
    }
    return false;
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
      this.transition('thinking');
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
         this.transition('idle');
      } catch (err) {
         this.emit('error', err);
         this.transition('error');
      }
    } else {
      this.transition('idle');
    }
  }
  
  mute() {
    this.transition('muted');
  }
}
