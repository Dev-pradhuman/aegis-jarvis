import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const graphPath = new URL('../public/jarvis_knowledge_graph.html', import.meta.url);

test('the draggable core stays connected and returns to its anchor', async () => {
  const source = await readFile(graphPath, 'utf8');

  assert.match(source, /anchorX:0, anchorY:0/);
  assert.match(source, /core\.vx \+= \(core\.anchorX - core\.x\) \* CORE_ANCHOR_PULL/);
  assert.match(source, /core\.vy \+= \(core\.anchorY - core\.y\) \* CORE_ANCHOR_PULL/);

  assert.match(source, /ctx\.arc\(core\.x,core\.y,pulseR,/);
  assert.match(source, /ctx\.arc\(core\.x,core\.y,pulseR2,/);
  assert.match(source, /createRadialGradient\(core\.x,core\.y,0,core\.x,core\.y,16\)/);
  assert.match(source, /ctx\.arc\(core\.x,core\.y,4\.5,/);
});
