#!/usr/bin/env node
import { EventEmitter } from 'node:events';
import { VoicePipeline } from '../server/voicePipeline.js';
import readline from 'node:readline';

// Usage Instructions:
// Run this script via: node scripts/verify-voice.mjs
// Or: chmod +x scripts/verify-voice.mjs && ./scripts/verify-voice.mjs
// Follow the on-screen prompts to simulate spoken input.

console.log("=== Voice Pipeline Live Verification Kit ===");
console.log("Usage: This kit simulates audio pipeline events since real I/O is unavailable.");
console.log("Instructions:");
console.log("  1. Press 'w' (then Enter) to simulate a Wake Word ('hey jarvis').");
console.log("  2. Press 's' (then Enter) to simulate Silence (end of speech).");
console.log("  3. Press 'q' (then Enter) to quit.");
console.log("============================================\n");

class FakeAudioSource extends EventEmitter {
  emitData(chunk) {
    this.emit('data', chunk);
  }
}

class FakeWakeWordProvider {
  process(chunk) {
    return chunk === 'WAKE';
  }
}

class FakeVADProvider {
  process(chunk) {
    return chunk === 'SILENCE';
  }
  flush() {
    return Buffer.from('FAKE_AUDIO_BUFFER');
  }
}

class FakeSTTProvider {
  async transcribe(buffer) {
    console.log("\n[STT] Transcribing...");
    await new Promise(r => setTimeout(r, 600));
    return 'hello, how are you?';
  }
}

class FakeTTSProvider {
  async speak(text) {
    console.log(`\n[TTS] Speaking: "${text}"`);
    await new Promise(r => setTimeout(r, 1000));
    return true;
  }
}

const audioSource = new FakeAudioSource();
const pipeline = new VoicePipeline({
  audioSource,
  wakeWordProvider: new FakeWakeWordProvider(),
  vadProvider: new FakeVADProvider(),
  sttProvider: new FakeSTTProvider(),
  ttsProvider: new FakeTTSProvider()
});

const expectedFlow = ['capturing', 'transcribing', 'thinking', 'speaking', 'idle'];
let currentFlowIndex = 0;
let capturingStarted = false;

pipeline.on('stateChange', async (state) => {
  console.log(`[Pipeline] State changed to: ${state}`);
  
  if (state === 'capturing' && !capturingStarted) {
    capturingStarted = true;
    currentFlowIndex = 1; // Expected next is transcribing
    console.log("\n-> Now 'capturing'. Please press 's' and Enter to simulate end of speech (silence).");
  } else if (capturingStarted) {
    if (state === expectedFlow[currentFlowIndex]) {
      currentFlowIndex++;
      
      if (state === 'thinking') {
        // Simulate LLM response time
        console.log("\n[LLM] Thinking...");
        await new Promise(r => setTimeout(r, 500));
        await pipeline.speak('I am functioning perfectly.');
      }
      
      if (currentFlowIndex === expectedFlow.length) {
        console.log("\n✅ Success: Pipeline successfully progressed through expected states:");
        console.log("   capturing -> transcribing -> thinking -> speaking -> idle");
        process.exit(0);
      }
    } else {
      // Allow 'wake_listening' to not break our specific check flow if it happens outside of the expected sequence,
      // but wait, capturing -> transcribing -> thinking -> speaking -> idle shouldn't have intermediate states.
      console.error(`\n❌ Error: Pipeline state out of order. Expected '${expectedFlow[currentFlowIndex]}', got '${state}'`);
      process.exit(1);
    }
  }
});

// Set a timeout of 30 seconds
const timeoutId = setTimeout(() => {
  console.error('\n❌ Error: Verification timed out. Pipeline did not complete in 30 seconds.');
  process.exit(1);
}, 30000);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("Starting pipeline...");
pipeline.startListening();
console.log("\n-> Pipeline is listening. Press 'w' and Enter to simulate Wake Word detection...");

rl.on('line', (line) => {
  const input = line.trim().toLowerCase();
  if (input === 'w') {
    audioSource.emitData('WAKE');
  } else if (input === 's') {
    audioSource.emitData('SILENCE');
  } else if (input === 'q') {
    console.log("Exiting.");
    process.exit(1);
  } else {
    console.log("Unknown command. Use 'w', 's', or 'q'.");
  }
});
