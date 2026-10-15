import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getCaelestiaTheme, FALLBACK_THEME } from '../server/themeBridge.js';
import systemRoutes from '../server/routes/system.js';

test('Caelestia Theme Bridge - Fallback on missing or invalid file', async () => {
  const nonExistent = path.join(os.tmpdir(), `nonexistent-theme-${Date.now()}.json`);
  const theme = await getCaelestiaTheme(nonExistent);
  assert.strictEqual(theme.name, 'caelestia-fallback');
  assert.strictEqual(theme.source, 'fallback');
  assert.strictEqual(theme.primary, '#9bd0cc');
  assert.ok(theme.glow.startsWith('rgba('));
});

test('Caelestia Theme Bridge - Parses scheme.json correctly with hex normalization', async () => {
  const tmpPath = path.join(os.tmpdir(), `test-scheme-${Date.now()}.json`);
  const mockScheme = {
    name: 'test-palette',
    mode: 'dark',
    colours: {
      background: '112233',
      surface: '223344',
      surfaceContainer: '334455',
      primary: 'ff5500',
      text: 'ffffff'
    }
  };
  await fs.writeFile(tmpPath, JSON.stringify(mockScheme), 'utf8');

  try {
    const theme = await getCaelestiaTheme(tmpPath);
    assert.strictEqual(theme.name, 'test-palette');
    assert.strictEqual(theme.background, '#112233');
    assert.strictEqual(theme.surface, '#223344');
    assert.strictEqual(theme.primary, '#ff5500');
    assert.strictEqual(theme.text, '#ffffff');
    assert.strictEqual(theme.glow, 'rgba(255, 85, 0, 0.45)');
    assert.strictEqual(theme.source, 'caelestia-scheme-json');
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
});

test('systemRoutes - GET /api/theme/caelestia returns theme palette', async () => {
  let responseStatus = 0;
  let responseData = null;

  const mockReq = { method: 'GET' };
  const mockRes = {};
  const mockUrl = new URL('http://127.0.0.1:8787/api/theme/caelestia');
  const mockState = {};
  const mockCtx = {
    json: (res, status, data) => {
      responseStatus = status;
      responseData = data;
      return true;
    }
  };

  const handled = await systemRoutes(mockReq, mockRes, mockUrl, mockState, mockCtx);
  assert.strictEqual(handled, true);
  assert.strictEqual(responseStatus, 200);
  assert.ok(responseData.primary);
  assert.ok(responseData.glow);
  assert.ok(responseData.background);
});

test('systemRoutes - POST /api/island/hide returns ok', async () => {
  let responseStatus = 0;
  let responseData = null;

  const mockReq = { method: 'POST' };
  const mockRes = {};
  const mockUrl = new URL('http://127.0.0.1:8787/api/island/hide');
  const mockState = {};
  const mockCtx = {
    json: (res, status, data) => {
      responseStatus = status;
      responseData = data;
      return true;
    }
  };

  const handled = await systemRoutes(mockReq, mockRes, mockUrl, mockState, mockCtx);
  assert.strictEqual(handled, true);
  assert.strictEqual(responseStatus, 200);
  assert.deepStrictEqual(responseData, { ok: true });
});
