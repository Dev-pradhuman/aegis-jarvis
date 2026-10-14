import test from 'node:test';
import assert from 'node:assert';

test('Voice Acknowledgement', async (t) => {
  process.env.JARVIS_PORT = '8802';
  process.env.ZERO_SPEND_MODE = 'true';
  process.env.VOICE_ACK_DELAY_MS = '0';
  const { server } = await import('../server/index.js');
  
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8802/api/health');
      if (res.ok) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }

  const originalFetch = globalThis.fetch;

  await t.test('fires when source=voice and tools are required', async () => {
    globalThis.fetch = async (url, options) => {
      // Simulate a slow LLM call
      if (url.includes('/api/chat') === false) {
         await new Promise(r => setTimeout(r, 20));
      }
      return originalFetch(url, options);
    };

    const response = await originalFetch('http://127.0.0.1:8802/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({ message: 'use tools to find the time', source: 'voice' })
    });
    
    const text = await response.text(); console.log(text);
    globalThis.fetch = originalFetch;
    assert.ok(text.includes('Let me look into that...'), 'Should contain voice acknowledgement');
  });

  await t.test('does not fire when source is not voice', async () => {
    globalThis.fetch = async (url, options) => {
      if (url.includes('/api/chat') === false) {
         await new Promise(r => setTimeout(r, 20));
      }
      return originalFetch(url, options);
    };

    const response = await originalFetch('http://127.0.0.1:8802/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({ message: 'what time is it', source: 'chat' })
    });
    
    const text = await response.text();
    globalThis.fetch = originalFetch;
    assert.strictEqual(text.includes('Let me look into that...'), false, 'Should not contain voice acknowledgement for chat');
  });

  const { browserManager } = await import('../server/browser/index.js');
  await browserManager.close().catch(() => {});
  server.closeAllConnections?.();
  server.close();
});
