import test from 'node:test';
import assert from 'node:assert';
import { setLastVisualCapture, clearLastVisualCapture } from '../server/visionState.js';

test('A4 - TimeoutNaNWarning test', (t) => {
  let warned = false;
  const listener = (warning) => {
    if (warning.name === 'TimeoutNaNWarning') {
      warned = true;
    }
  };
  process.on('warning', listener);
  
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: NaN });
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: 'invalid' });
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: null });
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: {} });
  
  process.removeListener('warning', listener);
  assert.strictEqual(warned, false);
  
  clearLastVisualCapture();
});
