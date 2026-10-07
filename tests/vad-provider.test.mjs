import test from 'node:test';
import assert from 'node:assert';
import { EnergyVADProvider } from '../server/vadProvider.js';

test('Energy VAD Provider', async (t) => {
  await t.test('detects end of speech after silence', () => {
    const vad = new EnergyVADProvider({ silenceDurationMs: 10, energyThreshold: 1000 });
    
    // Create loud speech chunk
    const speechChunk = Buffer.alloc(100);
    for (let i = 0; i < 100; i += 2) {
      speechChunk.writeInt16LE(5000, i);
    }
    
    // Create silent chunk
    const silenceChunk = Buffer.alloc(100);
    
    assert.strictEqual(vad.process(speechChunk), false); // speaking
    
    // immediately silent, but hasn't passed duration
    assert.strictEqual(vad.process(silenceChunk), false); 
    
    // wait for silence duration
    const start = Date.now();
    while (Date.now() - start < 15) { }
    
    // next silent chunk triggers end of speech
    assert.strictEqual(vad.process(silenceChunk), true); 
    
    const flushed = vad.flush();
    assert.strictEqual(flushed.length, 300);
  });
});
