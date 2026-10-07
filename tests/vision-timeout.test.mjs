import test from 'node:test';
import assert from 'node:assert';
import { setLastVisualCapture, clearLastVisualCapture } from '../server/visionState.js';

test('A4 - Timeout Warnings test', async (t) => {
  let warnings = [];
  const listener = (warning) => {
    warnings.push(warning.name);
  };
  process.on('warning', listener);
  
  // Test invalid timestamps
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: NaN });
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: 'invalid' });
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: null });
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: {} });
  
  // Test missing timestamp
  setLastVisualCapture({ buffer: Buffer.from('test') });

  // Test huge timestamp
  setLastVisualCapture({ buffer: Buffer.from('test'), timestamp: Date.now() + 100000000000 });
  
  // wait a tick for warnings to be emitted
  await new Promise(resolve => setTimeout(resolve, 100));

  process.removeListener('warning', listener);
  assert.strictEqual(warnings.includes('TimeoutNaNWarning'), false, 'Should not emit TimeoutNaNWarning');
  assert.strictEqual(warnings.includes('TimeoutOverflowWarning'), false, 'Should not emit TimeoutOverflowWarning');
  
  clearLastVisualCapture();
});
