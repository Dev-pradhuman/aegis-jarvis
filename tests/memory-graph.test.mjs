import assert from 'node:assert/strict';
import { mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { memoryGraph, readVaultNote, scanMemoryGraph, searchVaultNotes, startMemoryGraphWatcher, stopMemoryGraphWatcher } from '../server/memoryGraph.js';

async function waitFor(predicate) { const deadline = Date.now() + 3000; while (Date.now() < deadline) { const value = predicate(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error('Timed out waiting for graph watcher'); }

test('Obsidian notes and wiki links produce a provenance-preserving graph', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jarvis-vault-')); const previous = process.env.OBSIDIAN_VAULT_PATH; process.env.OBSIDIAN_VAULT_PATH = root;
  try {
    await writeFile(path.join(root, 'Alpha.md'), '---\ntags: [project, jarvis]\ntype: project\n---\nAlpha links to [[Beta]].');
    await writeFile(path.join(root, 'Beta.md'), '# Beta\nGrounded memory text.');
    const graph = await scanMemoryGraph(root);
    assert.equal(graph.status, 'ready'); assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
    assert.equal(graph.nodes.find((node) => node.title === 'Alpha').memoryType, 'project');
    assert.equal(searchVaultNotes('grounded')[0].sourcePath, 'Beta.md');
    assert.match((await readVaultNote('Alpha.md')).content, /\[\[Beta\]\]/);
    await assert.rejects(() => readVaultNote('../outside.md'), (error) => error.code === 'PERMISSION_DENIED');
  } finally { stopMemoryGraphWatcher(); if (previous === undefined) delete process.env.OBSIDIAN_VAULT_PATH; else process.env.OBSIDIAN_VAULT_PATH = previous; await rm(root, { recursive: true, force: true }); }
});

test('missing and empty vaults never receive fake graph nodes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jarvis-empty-vault-'));
  try { const empty = await scanMemoryGraph(root); assert.equal(empty.status, 'empty'); assert.deepEqual(empty.nodes, []); const missing = await scanMemoryGraph(path.join(root, 'missing')); assert.equal(missing.status, 'missing'); assert.deepEqual(missing.nodes, []); } finally { await rm(root, { recursive: true, force: true }); }
});

test('vault watcher incrementally reflects create, links, rename, unlink, and deletion', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jarvis-watch-vault-'));
  try { await startMemoryGraphWatcher(root); const firstRevision = memoryGraph().revision; await writeFile(path.join(root, 'One.md'), 'Links [[Two]]'); await writeFile(path.join(root, 'Two.md'), 'Second'); await waitFor(() => memoryGraph().nodes.length === 2 && memoryGraph().edges.length === 1); assert.ok(memoryGraph().revision > firstRevision); await rename(path.join(root, 'Two.md'), path.join(root, 'Renamed.md')); await writeFile(path.join(root, 'One.md'), 'No link now'); await waitFor(() => memoryGraph().nodes.some((node) => node.title === 'Renamed') && memoryGraph().edges.length === 0); await unlink(path.join(root, 'Renamed.md')); await waitFor(() => memoryGraph().nodes.length === 1); }
  finally { stopMemoryGraphWatcher(); await rm(root, { recursive: true, force: true }); }
});
