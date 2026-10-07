const fs = require('fs');
const content = fs.readFileSync('server/contextAssembler.js', 'utf8');

let newContent = content.replace(
  /export function assembleModelContext\(\{ query, conversations = \[\], memories = \[\], includeTools = false, tools = listTools\(\) \} = \{\}\) \{/,
  "export function assembleModelContext({ query = '', toolResults = [], conversations = [], memories = [], includeTools = false, tools = listTools() } = {}) {"
);

newContent = newContent.replace(
  /let remaining = maxChars;/,
  "const toolResultsChars = toolResults.reduce((sum, tr) => sum + String(tr.resultId || tr).length, 0);\n  const reservedChars = String(query || '').length + toolResultsChars;\n  let remaining = Math.max(500, maxChars - reservedChars);"
);

newContent = newContent.replace(
  /selectedToolIds: includeTools \? filtered\.tools\.map\(\(tool\) => tool\.id\) : \[\],/,
  "selectedToolIds: includeTools ? filtered.tools.map((tool) => tool.id) : [],\n      reservedChars,"
);

fs.writeFileSync('server/contextAssembler.js', newContent);
