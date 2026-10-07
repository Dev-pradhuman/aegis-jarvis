const fs = require('fs');
let content = fs.readFileSync('server/brainService.js', 'utf8');

const cacheLogic = `const probeCache = new Map();

export async function testBrainSource(sourceId, credentialId = null, { catalog = brainCatalog, fetchImpl = fetch, bypassCache = false } = {}) {
  const cacheKey = \`\${sourceId}:\${credentialId || 'none'}\`;
  const now = Date.now();
  if (!bypassCache && probeCache.has(cacheKey)) {
    const cached = probeCache.get(cacheKey);
    if (now - cached.timestamp < 300_000) { // 5 minutes TTL
      return cached.result;
    }
  }

  const runTest = async () => {`;

content = content.replace(
  "export async function testBrainSource(sourceId, credentialId = null, { catalog = brainCatalog, fetchImpl = fetch } = {}) {",
  cacheLogic
);

// We need to wrap the body of testBrainSource in `runTest` and then save to cache.
// Since it has multiple returns, we can just replace `return { status: ... }`?
// No, the safest way is to rename the original function to `_testBrainSource` and have `testBrainSource` wrap it.
