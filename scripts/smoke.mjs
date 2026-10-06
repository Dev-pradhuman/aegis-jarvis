import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

async function run() {
  const tempDir = await mkdtemp(join(tmpdir(), 'jarvis-smoke-'));
  const port = 30000 + Math.floor(Math.random() * 10000);
  console.log(`Starting server on port ${port} with data dir ${tempDir}`);

  const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, JARVIS_PORT: port.toString(), JARVIS_DATA_DIR: tempDir },
    stdio: 'inherit'
  });

  let serverStarted = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) {
        serverStarted = true;
        break;
      }
    } catch (e) {
      // ignore
    }
    await setTimeout(100);
  }

  if (!serverStarted) {
    console.error('Server failed to start');
    server.kill();
    process.exit(1);
  }

  let failed = false;
  const requireSuccess = async (name, promise) => {
    try {
      console.log(`[TEST] ${name}...`);
      await promise;
      console.log(`[PASS] ${name}`);
    } catch (e) {
      console.error(`[FAIL] ${name}: ${e.message}`);
      failed = true;
    }
  };

  await requireSuccess('/api/health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.service !== 'jarvis') throw new Error('Wrong service name');
  });

  await requireSuccess('/api/capabilities/status', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/capabilities/status`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  await requireSuccess('/api/tools', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/tools`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  await requireSuccess('task create/list', async () => {
    const postRes = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Smoke task' })
    });
    if (!postRes.ok) throw new Error(`Create task failed: ${postRes.status}`);
    
    const listRes = await fetch(`http://127.0.0.1:${port}/api/tasks`);
    if (!listRes.ok) throw new Error(`List tasks failed: ${listRes.status}`);
    const list = await listRes.json();
    if (!list.some(t => t.description === 'Smoke task')) throw new Error('Task not in list');
  });

  await requireSuccess('reminder create/list', async () => {
    const postRes = await fetch(`http://127.0.0.1:${port}/api/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Smoke reminder', cron: '0 * * * *' })
    });
    if (!postRes.ok) throw new Error(`Create reminder failed: ${postRes.status}`);
    
    const listRes = await fetch(`http://127.0.0.1:${port}/api/reminders`);
    if (!listRes.ok) throw new Error(`List reminders failed: ${listRes.status}`);
    const list = await listRes.json();
    if (!list.some(r => r.message === 'Smoke reminder')) throw new Error('Reminder not in list');
  });

  await requireSuccess('approval flow for node --version', async () => {
    const postRes = await fetch(`http://127.0.0.1:${port}/api/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId: 'command.execute', input: { command: 'node --version' } })
    });
    
    if (postRes.status === 202) {
      const data = await postRes.json();
      const approvalId = data.approval?.id;
      if (!approvalId) throw new Error('Missing approval id in 202 response');
      
      const approveRes = await fetch(`http://127.0.0.1:${port}/api/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'approved' })
      });
      if (!approveRes.ok) throw new Error(`Approve failed: ${approveRes.status}`);
      const approveData = await approveRes.json();
      if (!approveData.result?.ok) {
        throw new Error(`Tool execution failed after approval: ${JSON.stringify(approveData.result)}`);
      }
    } else if (postRes.status === 200) {
      const data = await postRes.json();
      if (!data.ok) throw new Error(`Tool execution failed directly: ${JSON.stringify(data)}`);
    } else {
      throw new Error(`Unexpected status ${postRes.status}`);
    }
  });

  server.kill();
  if (failed) {
    process.exit(1);
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
