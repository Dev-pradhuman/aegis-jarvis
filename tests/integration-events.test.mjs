import assert from 'node:assert/strict';
import test from 'node:test';
import { researchSearch } from '../server/systemModules.js';

test('research adapter reports an honest configuration state', async () => {
  const previous = process.env.SEARCH_PROVIDER_URL;
  delete process.env.SEARCH_PROVIDER_URL;
  const result = await researchSearch('test query');
  assert.equal(result.configured, false);
  assert.deepEqual(result.sources, []);
  if (previous) process.env.SEARCH_PROVIDER_URL = previous;
});
