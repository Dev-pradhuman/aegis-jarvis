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
    } else if (this.state === 'speaking') {
      // Ignore audio or optionally perform barge-in detection if needed
    }
  }

  triggerWakeWord() {
    if (this.state === 'wake_listening' || this.state === 'idle') {
      this.transition('capturing');
      return true;
    }
    return false;
  }

  pushToTalk() {
    // Push-to-talk overrides wake word and works even if idle or no wake word model installed
    this.handleBargeIn(); // Stop speaking if currently speaking
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
         if (this.state === 'speaking') {
             this.transition('idle');
         }
      } catch (err) {
         this.emit('error', err);
         this.transition('error');
      }
    } else {
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
      const match = sentenceRegex.exec(buffer);
      if (match) {
        const sentence = buffer.substring(0, match.index + match[1].length);
        buffer = buffer.substring(match.index + match[1].length).trimStart();
        if (this.ttsProvider && this.state === 'speaking') {
           await this.ttsProvider.speak(sentence);
        }
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
    if (this.state === 'speaking') {
      if (this.ttsProvider && this.ttsProvider.stop) {
        this.ttsProvider.stop();
      }
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
}
