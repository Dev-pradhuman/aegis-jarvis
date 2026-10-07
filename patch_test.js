const fs = require('fs');
let content = fs.readFileSync('tests/contextAssembler.test.mjs', 'utf8');
content = content.replace('Math.max(500, maxChars - reservedChars)', 'Math.max(0, maxChars - reservedChars)');
fs.writeFileSync('server/contextAssembler.js', fs.readFileSync('server/contextAssembler.js', 'utf8').replace('Math.max(500, maxChars - reservedChars)', 'Math.max(0, maxChars - reservedChars)'));
