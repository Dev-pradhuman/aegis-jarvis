import test from 'node:test';
import assert from 'node:assert';

test('HTTP Route Table Characterization', async (t) => {
  process.env.JARVIS_PORT = '8800';
  process.env.ZERO_SPEND_MODE = 'true';
  const { server } = await import('../server/index.js');
  
  // Wait for server to start
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8800/api/health');
      if (res.ok) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }

  const routes = [
    {
        "method": "GET",
        "path": "/api/auth/status"
    },
    {
        "method": "POST",
        "path": "/api/auth/login"
    },
    {
        "method": "GET",
        "path": "/api/projects"
    },
    {
        "method": "GET",
        "path": "/api/mcp/servers"
    },
    {
        "method": "GET",
        "path": "/api/device/status"
    },
    {
        "method": "GET",
        "path": "/api/agents"
    },
    {
        "method": "GET",
        "path": "/api/research/status"
    },
    {
        "method": "POST",
        "path": "/api/research/plan"
    },
    {
        "method": "GET",
        "path": "/api/media/jobs"
    },
    {
        "method": "GET",
        "path": "/api/messaging/status"
    },
    {
        "method": "POST",
        "path": "/api/device/pair"
    },
    {
        "method": "POST",
        "path": "/api/device/events"
    },
    {
        "method": "POST",
        "path": "/api/device/revoke"
    },
    {
        "method": "GET",
        "path": "/api/generated/123"
    },
    {
        "method": "GET",
        "path": "/api/media/jobs/123/download"
    },
    {
        "method": "GET",
        "path": "/api/media/jobs/123"
    },
    {
        "method": "GET",
        "path": "/api/config"
    },
    {
        "method": "PATCH",
        "path": "/api/config"
    },
    {
        "method": "GET",
        "path": "/api/brain"
    },
    {
        "method": "POST",
        "path": "/api/brain/test-all"
    },
    {
        "method": "POST",
        "path": "/api/brain/presets/123/connect"
    },
    {
        "method": "GET",
        "path": "/api/brain/sources"
    },
    {
        "method": "POST",
        "path": "/api/brain/sources"
    },
    {
        "method": "GET",
        "path": "/api/voice/status"
    },
    {
        "method": "GET",
        "path": "/api/voice/tts"
    },
    {
        "method": "POST",
        "path": "/api/voice/tts"
    },
    {
        "method": "POST",
        "path": "/api/voice/transcribe"
    },
    {
        "method": "GET",
        "path": "/api/health"
    },
    {
        "method": "GET",
        "path": "/api/system/metrics"
    },
    {
        "method": "GET",
        "path": "/api/browser/status"
    },
    {
        "method": "GET",
        "path": "/api/runs"
    },
    {
        "method": "GET",
        "path": "/api/runs/123"
    },
    {
        "method": "POST",
        "path": "/api/runs/123/cancel"
    },
    {
        "method": "GET",
        "path": "/api/telemetry"
    },
    {
        "method": "GET",
        "path": "/api/provider"
    },
    {
        "method": "GET",
        "path": "/api/model-routing"
    },
    {
        "method": "PATCH",
        "path": "/api/model-routing"
    },
    {
        "method": "GET",
        "path": "/api/provider/models"
    },
    {
        "method": "PATCH",
        "path": "/api/provider"
    },
    {
        "method": "GET",
        "path": "/api/connections"
    },
    {
        "method": "GET",
        "path": "/api/diagnostics"
    },
    {
        "method": "GET",
        "path": "/api/integrations"
    },
    {
        "method": "GET",
        "path": "/api/composio/status"
    },
    {
        "method": "PATCH",
        "path": "/api/composio/config"
    },
    {
        "method": "GET",
        "path": "/api/composio/accounts"
    },
    {
        "method": "GET",
        "path": "/api/composio/tools"
    },
    {
        "method": "POST",
        "path": "/api/composio/connect"
    },
    {
        "method": "POST",
        "path": "/api/composio/execute"
    },
    {
        "method": "GET",
        "path": "/api/memory"
    },
    {
        "method": "GET",
        "path": "/api/memory/search"
    },
    {
        "method": "POST",
        "path": "/api/memory"
    },
    {
        "method": "GET",
        "path": "/api/documents"
    },
    {
        "method": "POST",
        "path": "/api/documents"
    },
    {
        "method": "GET",
        "path": "/api/permissions"
    },
    {
        "method": "GET",
        "path": "/api/adapters"
    },
    {
        "method": "GET",
        "path": "/api/calendar/events"
    },
    {
        "method": "POST",
        "path": "/api/calendar/events"
    },
    {
        "method": "POST",
        "path": "/api/messages/send"
    },
    {
        "method": "POST",
        "path": "/api/hardware/command"
    },
    {
        "method": "POST",
        "path": "/api/mcp"
    },
    {
        "method": "POST",
        "path": "/api/memory/index"
    },
    {
        "method": "GET",
        "path": "/api/memory/vector-search"
    },
    {
        "method": "POST",
        "path": "/api/research/search"
    },
    {
        "method": "POST",
        "path": "/api/events"
    },
    {
        "method": "GET",
        "path": "/api/capabilities"
    },
    {
        "method": "GET",
        "path": "/api/capabilities/status"
    },
    {
        "method": "GET",
        "path": "/api/tools"
    },
    {
        "method": "GET",
        "path": "/api/workflows"
    },
    {
        "method": "POST",
        "path": "/api/workflows"
    },
    {
        "method": "PATCH",
        "path": "/api/workflows/123"
    },
    {
        "method": "POST",
        "path": "/api/workflows/123/run"
    },
    {
        "method": "GET",
        "path": "/api/scheduler"
    },
    {
        "method": "POST",
        "path": "/api/scheduler/tick"
    },
    {
        "method": "GET",
        "path": "/api/reminders"
    },
    {
        "method": "POST",
        "path": "/api/tools/execute"
    },
    {
        "method": "GET",
        "path": "/api/tasks"
    },
    {
        "method": "POST",
        "path": "/api/tasks"
    },
    {
        "method": "PATCH",
        "path": "/api/tasks/123"
    },
    {
        "method": "GET",
        "path": "/api/approvals"
    },
    {
        "method": "GET",
        "path": "/api/approval-policy"
    },
    {
        "method": "PATCH",
        "path": "/api/approval-policy"
    },
    {
        "method": "POST",
        "path": "/api/approval-policy/activate-full"
    },
    {
        "method": "POST",
        "path": "/api/approvals/123"
    },
    {
        "method": "GET",
        "path": "/api/activity"
    },
    {
        "method": "GET",
        "path": "/api/chats"
    },
    {
        "method": "POST",
        "path": "/api/hud/toggle"
    },
    {
        "method": "POST",
        "path": "/api/agents"
    },
    {
        "method": "POST",
        "path": "/api/goals"
    },
    {
        "method": "POST",
        "path": "/api/stop"
    },
    {
        "method": "POST",
        "path": "/api/chat"
    }
];

  for (const route of routes) {
    const res = await fetch(`http://127.0.0.1:8800${route.path}`, {
      method: route.method,
      headers: { 'Content-Type': 'application/json' },
      body: ['POST', 'PATCH', 'PUT'].includes(route.method) ? JSON.stringify({}) : undefined
    });
    
    let text = '';
    try { text = await res.text(); } catch(e) {}
    
    // As long as it's not the generic 404 "Not found", the route is mapped.
    const isGeneric404 = res.status === 404 && text.includes('"error":"Not found"');
    assert.strictEqual(isGeneric404, false, `Route ${route.method} ${route.path} should be mapped but returned generic 404`);
  }
  
  // Test that an unknown route DOES return generic 404
  const res404 = await fetch('http://127.0.0.1:8800/api/unknown-xyz');
  const text404 = await res404.text();
  assert.strictEqual(res404.status, 404);
  assert.ok(text404.includes('"error":"Not found"'));
  
  // Cleanup
  server.close();
  // Also force exit after a short timeout if there are lingering handles
  setTimeout(() => process.exit(0), 100).unref();
});
