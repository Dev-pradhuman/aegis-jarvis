#!/usr/bin/env python3

with open('server/index.js', 'r') as f:
    content = f.read()

imports = """
import { startHUDManager, toggleHUD } from './hudManager.js';
"""
content = content.replace("import http from 'node:http';", "import http from 'node:http';\n" + imports)

endpoint = """
    if (req.method === 'POST' && url.pathname === '/api/hud/toggle') {
      toggleHUD();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
"""
content = content.replace("    if (req.method === 'POST' && url.pathname === '/api/stop') {", endpoint)

init = """
startHUDManager(
  async (text) => {
    // Treat text as a new chat message
    try {
      await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: text })
      });
    } catch(e) {}
  },
  () => {
    // trigger voice listen logic here
  }
);
server.listen(port, '127.0.0.1', () => console.log(`JARVIS service listening on http://127.0.0.1:${port}`));
"""
content = content.replace("server.listen(port, '127.0.0.1', () => console.log(`JARVIS service listening on http://127.0.0.1:${port}`));", init)

with open('server/index.js', 'w') as f:
    f.write(content)
