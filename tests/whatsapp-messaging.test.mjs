import test from 'node:test';
import assert from 'node:assert/strict';

import { getTool, listTools } from '../server/registry.js';
import { unattendedTools } from '../server/toolPolicy.js';
import { toolFilterSettings } from '../server/toolFilter.js';
import { executeTool, implementedToolIds } from '../server/toolExecutor.js';
import { sendWhatsAppWebMessage } from '../server/browser/whatsapp.js';

test('AC1: whatsapp.send tool registration, schema, policy, and filter', () => {
  const tool = getTool('whatsapp.send');
  assert.ok(tool, 'whatsapp.send must be registered in registry.js');
  assert.equal(tool.id, 'whatsapp.send');
  assert.equal(tool.module, 'communication');
  assert.equal(tool.riskLevel, 'EXTERNAL_ACTION');
  assert.equal(tool.requiresApproval, false);
  assert.equal(tool.enabled, true);
  assert.deepEqual(tool.inputSchema.required, ['recipient']);

  const unattended = unattendedTools();
  assert.ok(unattended.some((t) => t.id === 'whatsapp.send'), 'whatsapp.send must be in unattendedTools()');

  const filterSettings = toolFilterSettings();
  assert.ok(filterSettings.coreTools.includes('whatsapp.send'), 'whatsapp.send must be in CORE_TOOLS');

  assert.ok(implementedToolIds.includes('whatsapp.send'), 'whatsapp.send must be in implementedToolIds');
});

test('AC2: sendWhatsAppWebMessage validates input', async () => {
  await assert.rejects(
    async () => sendWhatsAppWebMessage('', 'hello'),
    /A recipient name or number is required/
  );
  await assert.rejects(
    async () => sendWhatsAppWebMessage('Arjun', ''),
    /A message body is required/
  );
});

test('AC3: sendWhatsAppWebMessage performs search, selection, type, and dispatch on WhatsApp Web', async () => {
  const calls = [];
  const mockBm = {
    engine: {
      url: () => 'about:blank'
    },
    navigate: async (url, opts) => {
      calls.push({ action: 'navigate', url, opts });
      return { url };
    },
    waitFor: async (selector, timeout) => {
      calls.push({ action: 'waitFor', selector, timeout });
      return { found: true };
    },
    type: async (selector, text, opts) => {
      calls.push({ action: 'type', selector, text, opts });
      return { length: text.length };
    },
    snapshot: async () => {
      calls.push({ action: 'snapshot' });
      return {
        items: [
          { role: 'row', name: 'Arjun Pradhuman', selector: '[data-jarvis-ref="e33"]' }
        ]
      };
    },
    click: async (selector, opts) => {
      calls.push({ action: 'click', selector, opts });
      return { clicked: true };
    },
    press: async (key, selector, opts) => {
      calls.push({ action: 'press', key, selector, opts });
      return { key };
    }
  };

  const result = await sendWhatsAppWebMessage('Arjun Pradhuman', 'hello from test', {
    browserManager: mockBm
  });

  assert.equal(result.delivered, true);
  assert.equal(result.recipient, 'Arjun Pradhuman');
  assert.equal(result.message, 'hello from test');
  assert.equal(result.channel, 'whatsapp');

  // Verify navigation to web.whatsapp.com
  assert.ok(calls.some((c) => c.action === 'navigate' && c.url === 'https://web.whatsapp.com'));
  // Verify typing recipient
  assert.ok(calls.some((c) => c.action === 'type' && c.text === 'Arjun Pradhuman'));
  // Verify click on matching contact row
  assert.ok(calls.some((c) => c.action === 'click' && c.selector === '[data-jarvis-ref="e33"]'));
  // Verify typing message
  assert.ok(calls.some((c) => c.action === 'type' && c.text === 'hello from test'));
  // Verify clicking send or pressing enter
  assert.ok(calls.some((c) => (c.action === 'click' && c.selector.includes('send')) || c.action === 'press'));
});

test('AC4: executeTool("whatsapp.send") dispatches through canonical tool executor', async () => {
  const mockBm = {
    engine: { url: () => 'https://web.whatsapp.com' },
    navigate: async () => ({ url: 'https://web.whatsapp.com' }),
    waitFor: async () => ({ found: true }),
    type: async (_sel, text) => ({ length: text.length }),
    snapshot: async () => ({
      items: [{ role: 'row', name: 'Test Contact', selector: '[data-jarvis-ref="e1"]' }]
    }),
    click: async () => ({ clicked: true }),
    press: async () => ({ key: 'Enter' })
  };

  const result = await executeTool(
    'whatsapp.send',
    { recipient: 'Test Contact', message: 'Test message' },
    {
      state: {},
      approval: null,
      browserManager: mockBm,
      fetchImpl: async () => ({ ok: true, json: async () => ({}) })
    }
  );

  assert.equal(result.toolId, 'whatsapp.send');
  assert.equal(result.ok, true);
  assert.equal(result.data.delivered, true);
  assert.equal(result.data.recipient, 'Test Contact');
  assert.equal(result.data.message, 'Test message');
});
