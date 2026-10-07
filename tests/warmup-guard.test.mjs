import test from 'node:test';
import assert from 'node:assert';

test('Warmup Guard', async (t) => {
  const { warmUpLocalModels } = await import('../server/brainService.js');

  await t.test('aborts when JARVIS_TEST=1', async () => {
    process.env.JARVIS_TEST = '1';
    let called = false;
    const dummyCatalog = {
      list: () => { called = true; return []; }
    };
    await warmUpLocalModels({ catalog: dummyCatalog });
    assert.strictEqual(called, false, 'Catalog should not be listed when guarded');
    delete process.env.JARVIS_TEST;
  });

  await t.test('proceeds when not guarded', async () => {
    let called = false;
    const dummyCatalog = {
      list: () => { called = true; return []; }
    };
    await warmUpLocalModels({ catalog: dummyCatalog });
    assert.strictEqual(called, true, 'Catalog should be listed when not guarded');
  });
});
