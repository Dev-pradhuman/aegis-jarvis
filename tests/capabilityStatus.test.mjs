import test from 'node:test';
import assert from 'node:assert';
import { capabilityStatus } from '../server/capabilityStatus.js';
import { listTools } from '../server/registry.js';

test('capabilityStatus references valid tool IDs', () => {
  const tools = new Set(listTools().map(t => t.id));
  const statuses = capabilityStatus();
  
  let checked = 0;
  for (const status of statuses) {
    if (status.toolId) {
      assert.ok(tools.has(status.toolId), `Tool ID ${status.toolId} referenced in capability ${status.id} is missing from registry`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'Should have checked at least one tool ID');
});
