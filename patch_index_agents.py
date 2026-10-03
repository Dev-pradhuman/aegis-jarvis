#!/usr/bin/env python3

with open('server/index.js', 'r') as f:
    content = f.read()

imports = """
import { createGoal, spawnAgent, updateAgentMemory, completeAgentTask } from './agentManager.js';
"""
content = content.replace("import { startHUDManager, toggleHUD } from './hudManager.js';", "import { startHUDManager, toggleHUD } from './hudManager.js';\n" + imports)

endpoints = """
    if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: state.agents || [], goals: state.goals || [] });
    if (req.method === 'POST' && url.pathname === '/api/agents') {
      const input = await body(req);
      const agent = spawnAgent(state, input.role, input.goalId);
      await updateState((draft) => { Object.assign(draft, state); return draft; });
      return json(res, 200, { agent });
    }
    if (req.method === 'POST' && url.pathname === '/api/goals') {
      const input = await body(req);
      const goal = createGoal(state, input.title, input.description);
      await updateState((draft) => { Object.assign(draft, state); return draft; });
      return json(res, 200, { goal });
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
"""
content = content.replace("    if (req.method === 'POST' && url.pathname === '/api/stop') {", endpoints)

with open('server/index.js', 'w') as f:
    f.write(content)
