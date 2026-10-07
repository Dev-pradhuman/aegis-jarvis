import test from 'node:test';
import assert from 'node:assert';
import { writeFile, readFile, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../server/data');

test('Store Migration', async (t) => {
  const { getState, updateState } = await import('../server/store.js');

  await t.test('migrates old model aliases and creates a backup', async () => {
    const oldState = {
      modelRouting: {
        manualModel: 'muse-spark-1.2'
      },
      runs: [
        { id: '1', logicalModel: 'nemotron-3-nano-omni' },
        { id: '2', logicalModel: 'muse-spark-1.2' }
      ]
    };
    const stateFile = path.join(testDataDir, 'state.json');
    await writeFile(stateFile, JSON.stringify(oldState), 'utf8');

    // getState() triggers load() internally
    const snapshot = await getState();

    assert.strictEqual(snapshot.modelRouting.manualModel, 'agent_brain');
    assert.strictEqual(snapshot.runs[0].logicalModel, 'perception');
    assert.strictEqual(snapshot.runs[1].logicalModel, 'agent_brain');

    const files = await readdir(testDataDir);
    const backups = files.filter(f => f.startsWith('state.backup-'));
    assert.ok(backups.length > 0, 'Backup file should be created');

    // cleanup
    for (const file of backups) {
      await unlink(path.join(testDataDir, file)).catch(() => {});
    }
    await updateState((draft) => { draft.modelRouting = {}; draft.runs = []; return draft; });
  });
});
