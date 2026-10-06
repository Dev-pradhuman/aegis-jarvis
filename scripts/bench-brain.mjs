import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { selectLogicalModel } from '../server/modelRouting.js';
import { assembleModelContext } from '../server/contextAssembler.js';
import { executeModelToolLoop } from '../server/modelToolLoop.js';
import { executeBrainWorkflow } from '../server/brainWorkflow.js';
import { executeModelPool } from '../server/modelPool.js';

const ITERATIONS = 100;

function calculateStats(times) {
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const min = times[0];
  const max = times[times.length - 1];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return { min, max, avg, p50, p95 };
}

async function runMockedBench() {
  console.log(`Running mocked benchmarks for ${ITERATIONS} iterations...`);
  
  const routingTimes = [];
  const contextTimes = [];
  const toolLoopTimes = [];
  
  for (let i = 0; i < ITERATIONS; i++) {
    // 1. Measure Routing
    const routeStart = performance.now();
    const route = selectLogicalModel('Hello world, what is the weather?', {}, { hasMedia: false });
    routingTimes.push(performance.now() - routeStart);
    
    // 2. Measure Context Assembly
    const ctxStart = performance.now();
    const ctx = assembleModelContext({ query: 'Hello world, what is the weather?', conversations: [], memories: [], includeTools: true });
    contextTimes.push(performance.now() - ctxStart);
    
    // 3. Measure Tool Loop Overhead
    // Mock the inner model execution to just return a tool call, then a final reply
    const mockModelPool = async (opts) => {
      // Simulate 1 tool call then finish
      if (!opts.messagesOverride.find(m => m.role === 'tool')) {
        return {
          reply: null,
          toolCalls: [{ id: `call-${i}`, function: { name: 'core__clock', arguments: '{}' } }]
        };
      }
      return {
        reply: 'The time is now.',
        toolCalls: [],
        tokens: 10, inputTokens: 5, outputTokens: 5, cost: 0
      };
    };
    
    const mockInvoke = async (state, { toolId }) => {
      return { status: 200, body: { ok: true, data: 'mock tool result' } };
    };

    const loopStart = performance.now();
    await executeModelToolLoop({
      request: 'Hello world',
      context: [],
      state: {}
    }, { model: mockModelPool, invoke: mockInvoke });
    toolLoopTimes.push(performance.now() - loopStart);
  }
  
  return {
    routing: calculateStats(routingTimes),
    contextAssembly: calculateStats(contextTimes),
    toolLoop: calculateStats(toolLoopTimes)
  };
}

async function runLiveBench() {
  console.log('Running live benchmarks... checking Ollama...');
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    if (!res.ok) throw new Error('Ollama not ready');
  } catch(e) {
    console.log('Local Ollama is not reachable, skipping live benchmark.');
    return null;
  }
  
  const LIVE_ITERATIONS = 5;
  const ttfbTimes = [];
  const totalTimes = [];
  
  // Create a minimal state and model configuration
  const state = {
    modelRouting: {
      rules: [
        { priority: 1, routing: { logicalModel: 'phi4:latest', requiresTools: false } }
      ]
    }
  };

  for(let i=0; i<LIVE_ITERATIONS; i++) {
     const start = performance.now();
     let ttfb = 0;
     try {
       // We can directly use executeModelPool with streaming to get TTFB
       await executeModelPool({
          request: "Tell me a very short joke.",
          context: [],
          state,
          messagesOverride: [{ role: 'user', content: 'Tell me a short joke.' }],
          // Mock streaming just for bench
          onToken: (t) => {
             if (ttfb === 0) ttfb = performance.now() - start;
          },
          toolSpecs: []
       });
       const total = performance.now() - start;
       if (ttfb === 0) ttfb = total; // fallback if no stream
       ttfbTimes.push(ttfb);
       totalTimes.push(total);
     } catch (err) {
       console.error("Live test failed:", err.message);
     }
  }
  
  if (ttfbTimes.length === 0) return null;
  
  return {
    ttfb: calculateStats(ttfbTimes),
    total: calculateStats(totalTimes)
  };
}

async function main() {
  const isLive = process.argv.includes('--live');
  const results = {
    date: new Date().toISOString(),
    mocked: await runMockedBench(),
    live: isLive ? await runLiveBench() : null
  };
  
  const evidenceFile = `docs/evidence/bench-${new Date().toISOString().split('T')[0]}.json`;
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  fs.writeFileSync(evidenceFile, JSON.stringify(results, null, 2));
  
  console.log(`\nResults written to ${evidenceFile}`);
  console.log('\nMocked Benchmark Stats (ms):');
  console.log(JSON.stringify(results.mocked, null, 2));
  if (results.live) {
    console.log('\nLive Benchmark Stats (ms):');
    console.log(JSON.stringify(results.live, null, 2));
  }
}

main().catch(console.error);
