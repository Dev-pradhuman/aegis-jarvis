import test from 'node:test';
import assert from 'node:assert';
import { voiceRoutes } from '../server/routes/voice.js';
import { VoicePipeline } from '../server/voicePipeline.js';

test('Voice Routes', async (t) => {
  const pipeline = new VoicePipeline({
    sttProvider: { transcribe: async () => new Promise(resolve => setTimeout(() => resolve('hello'), 10)) }
  });
  const routeHandler = voiceRoutes(pipeline);

  const mockReq = (method, url, body = null) => ({
    method,
    url,
    headers: { host: 'localhost:8787', origin: 'http://localhost:5173' },
    json: async () => body || {}
  });

  const mockRes = () => {
    const res = {
      headers: {},
      writeHead(status, headers) { res.status = status; Object.assign(res.headers, headers); },
      setHeader(k, v) { res.headers[k] = v; },
      end(data) { res.body = data; }
    };
    return res;
  };

  await t.test('GET /api/voice/status returns status', async () => {
    const res = mockRes();
    await routeHandler(mockReq('GET', '/api/voice/status'), res);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.state, 'idle');
  });

  await t.test('POST /api/voice/enable starts listening', async () => {
    const res = mockRes();
    await routeHandler(mockReq('POST', '/api/voice/enable'), res);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(pipeline.enabled, true);
  });

  await t.test('POST /api/voice/kill stops listening and drops audio', async () => {
    const res = mockRes();
    pipeline.transition('speaking');
    await routeHandler(mockReq('POST', '/api/voice/kill'), res);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(pipeline.state, 'idle');
  });

  await t.test('POST /api/voice/ptt controls push to talk and toggle', async () => {
    const res = mockRes();
    await routeHandler(mockReq('POST', '/api/voice/ptt', { action: 'start' }), res);
    assert.strictEqual(pipeline.state, 'capturing');

    const res2 = mockRes();
    await routeHandler(mockReq('POST', '/api/voice/ptt', { action: 'stop' }), res2);
    assert.strictEqual(pipeline.state, 'transcribing');

    // Toggle from idle/transcribing -> capturing
    pipeline.transition('idle');
    const res3 = mockRes();
    await routeHandler(mockReq('POST', '/api/voice/ptt', { action: 'toggle' }), res3);
    assert.strictEqual(pipeline.state, 'capturing');

    // Toggle from capturing -> transcribing
    const res4 = mockRes();
    await routeHandler(mockReq('POST', '/api/voice/ptt', { action: 'toggle' }), res4);
    assert.strictEqual(pipeline.state, 'transcribing');
  });
});
