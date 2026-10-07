import test from 'node:test';
import assert from 'node:assert';

test('SSE Streaming API', async (t) => {
  process.env.JARVIS_PORT = '8801';
  process.env.ZERO_SPEND_MODE = 'true';
  const { server } = await import('../server/index.js');
  
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8801/api/health');
      if (res.ok) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }

  await t.test('accepts text/event-stream and streams chunks', async () => {
    const response = await fetch('http://127.0.0.1:8801/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({ message: 'Hello, please stream this' })
    });
    
    const text = await response.text();
    if (response.headers.get('content-type') !== 'text/event-stream') {
      console.error('Failed response:', response.status, text);
    }
    assert.strictEqual(response.headers.get('content-type'), 'text/event-stream');
    assert.ok(text.includes('data: {"type":"start"}'), 'should emit start event');
    assert.ok(text.includes('data: {"type":"done"'), 'should emit done event');
  });

  server.close();
});
