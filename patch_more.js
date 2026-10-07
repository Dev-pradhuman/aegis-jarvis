import fs from 'node:fs';

const files = [
  'server/cameraUnderstanding.js',
  'server/screenUnderstanding.js',
  'tests/untestedModules.test.mjs',
  'tests/model-delegation.test.mjs'
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
