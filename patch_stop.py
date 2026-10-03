#!/usr/bin/env python3

with open('server/index.js', 'r') as f:
    content = f.read()

stop_endpoint = """
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      const state = await getState();
      for (const run of state.runs || []) {
        if (run.status === 'running' || run.status === 'waiting_for_approval') {
          transitionRun(run, 'cancelled');
        }
      }
      try {
        const { emergencyStop } = await import('./toolExecutor.js');
        emergencyStop();
      } catch (e) {
        // Ignore
      }
      await updateState((draft) => { Object.assign(draft, state); return draft; });
      return json(res, 200, { ok: true, message: 'All pending automation stopped' });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
"""

content = content.replace("    if (req.method === 'POST' && url.pathname === '/api/chat') {", stop_endpoint)

with open('server/index.js', 'w') as f:
    f.write(content)
