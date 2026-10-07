import test from 'node:test';
import assert from 'node:assert';

test('Warmup Guard', async (t) => {
  const { warmUpLocalModels } = await import('../server/brainService.js');

  await t.test('aborts when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    let called = false;
    const dummyCatalog = {
      list: () => { called = true; return []; }
    };
    await warmUpLocalModels({ catalog: dummyCatalog });
    assert.strictEqual(called, false, 'Catalog should not be listed when guarded');
  });

  await t.test('aborts when CI is set', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CI = 'true';
    let called = false;
    const dummyCatalog = {
      list: () => { called = true; return []; }
    };
    await warmUpLocalModels({ catalog: dummyCatalog });
    assert.strictEqual(called, false, 'Catalog should not be listed when guarded by CI');
    delete process.env.CI;
  });

  await t.test('proceeds when not guarded', async () => {
    process.env.NODE_ENV = 'development';
    let called = false;
    const dummyCatalog = {
      list: () => { called = true; return []; }
    };
    await warmUpLocalModels({ catalog: dummyCatalog });
    assert.strictEqual(called, true, 'Catalog should be listed when not guarded');
  });
});
