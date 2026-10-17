import test from 'node:test';
import assert from 'node:assert/strict';
import { serveStatic } from '../server/staticServer.js';
import { routeRequest } from '../server/router.js';

test('serveStatic ignores non-GET and non-HEAD requests', async () => {
  const req = { method: 'POST' };
  const res = { writeHead() {}, end() {} };
  const url = new URL('http://127.0.0.1:8787/');
  const handled = await serveStatic(req, res, url);
  assert.equal(handled, false);
});

test('serveStatic bypasses all /api/ endpoints to let API routers handle them', async () => {
  const req = { method: 'GET' };
  const res = { writeHead() {}, end() {} };
  const handled1 = await serveStatic(req, res, new URL('http://127.0.0.1:8787/api/health'));
  const handled2 = await serveStatic(req, res, new URL('http://127.0.0.1:8787/api/chat'));
  const handled3 = await serveStatic(req, res, new URL('http://127.0.0.1:8787/api/unknown-test'));
  assert.equal(handled1, false);
  assert.equal(handled2, false);
  assert.equal(handled3, false);
});

test('serveStatic prevents path traversal attacks', async () => {
  let statusCode = 0;
  let responseData = '';
  const req = { method: 'GET', url: '/../../../../etc/passwd' };
  const res = {
    writeHead(code) { statusCode = code; },
    write(chunk) { responseData += chunk; return true; },
    end(chunk) { if (chunk) responseData += chunk; }
  };
  const url = { pathname: '/../../../../etc/passwd' };
  const handled = await serveStatic(req, res, url);
  assert.equal(handled, true);
  assert.equal(statusCode, 403);
  assert.match(responseData, /Forbidden/);
});

test('serveStatic returns 404 for missing files in /assets/', async () => {
  let statusCode = 0;
  const req = { method: 'GET' };
  const res = {
    writeHead(code) { statusCode = code; },
    write() { return true; },
    end() {}
  };
  const url = new URL('http://127.0.0.1:8787/assets/nonexistent-bundle.js');
  const handled = await serveStatic(req, res, url);
  assert.equal(handled, true);
  assert.equal(statusCode, 404);
});

test('serveStatic serves index.html for root / and SPA routes like ?mode=island', async () => {
  let statusCode = 0;
  let headers = {};
  const req = { method: 'GET' };
  const res = {
    writeHead(code, h) { statusCode = code; headers = h; },
    write() { return true; },
    end() {}
  };

  // Root request
  const handledRoot = await serveStatic(req, res, new URL('http://127.0.0.1:8787/'));
  assert.equal(handledRoot, true);
  assert.equal(statusCode, 200);
  assert.equal(headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(headers['cache-control'], 'no-cache');

  // Island mode SPA request
  const handledIsland = await serveStatic(req, res, new URL('http://127.0.0.1:8787/?mode=island'));
  assert.equal(handledIsland, true);
  assert.equal(statusCode, 200);
  assert.equal(headers['content-type'], 'text/html; charset=utf-8');
});

test('serveStatic handles HEAD requests with headers and no body stream', async () => {
  let statusCode = 0;
  let headers = {};
  let ended = false;
  const req = { method: 'HEAD' };
  const res = {
    writeHead(code, h) { statusCode = code; headers = h; },
    end() { ended = true; }
  };
  const handled = await serveStatic(req, res, new URL('http://127.0.0.1:8787/'));
  assert.equal(handled, true);
  assert.equal(statusCode, 200);
  assert.equal(headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(ended, true);
});

test('routeRequest routes natural language resume phrases to browser.resume', () => {
  const r1 = routeRequest('resume browser');
  assert.equal(r1.route, 'TOOL_CALL');
  assert.equal(r1.capability, 'browser.resume');

  const r2 = routeRequest('jarvis, continue the browser');
  assert.equal(r2.route, 'TOOL_CALL');
  assert.equal(r2.capability, 'browser.resume');

  const r3 = routeRequest('I solved the captcha');
  assert.equal(r3.route, 'TOOL_CALL');
  assert.equal(r3.capability, 'browser.resume');

  const r4 = routeRequest('challenge solved');
  assert.equal(r4.route, 'TOOL_CALL');
  assert.equal(r4.capability, 'browser.resume');

  const r5 = routeRequest('i have signed in');
  assert.equal(r5.route, 'TOOL_CALL');
  assert.equal(r5.capability, 'browser.resume');
});
