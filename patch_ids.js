import fs from 'node:fs';

const files = [
  'server/modelRouting.js',
  'server/morningBriefing.js',
  'server/store.js',
  'server/modelRouterService.js',
  'server/providerClient.js',
  'server/modelPool.js',
  'server/modelDelegation.js',
  'server/routes/brain.js',
  'server/brainSources.js',
  'tests/brain-sources.test.mjs',
  'tests/model-router-service.test.mjs',
  'tests/brain-workflow.test.mjs',
  'tests/providerClient.test.mjs',
  'tests/model-tool-loop.test.mjs',
  'tests/model-routing.test.mjs'
];

const aliases = {
  'muse-spark-1.2': 'agent_brain',
  'nemotron-3-nano-omni': 'perception',
  'glm-5.2': 'fallback'
};

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [oldId, newId] of Object.entries(aliases)) {
    content = content.replaceAll(oldId, newId);
  }
  fs.writeFileSync(file, content);
}
