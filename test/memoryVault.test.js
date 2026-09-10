import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { initializeJarvisVault } from '../server/memoryGraph.js';

test('Obsidian initializer is idempotent and creates the canonical hierarchy',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'jarvis-vault-'));try{await initializeJarvisVault(root);await initializeJarvisVault(root);for(const folder of ['00-System/identity','10-People','40-Memories/Long-Term','60-Conversations','90-Archive','.obsidian'])assert.equal((await stat(path.join(root,folder))).isDirectory(),true);}finally{await rm(root,{recursive:true,force:true});}});
