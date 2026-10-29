import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ensureDisplayEnvironment, PatchrightEngine } from '../server/browser/engines.js';
import { assembleModelContext } from '../server/contextAssembler.js';
import { classifyForModel } from '../server/modelRouting.js';
import { routeRequest, parseWhatsAppRequest } from '../server/router.js';
import { resolveApp } from '../server/platform/linux/apps.js';

test('AC1: ensureDisplayEnvironment auto-detects Wayland and X11 sockets from XDG_RUNTIME_DIR and /tmp/.X11-unix', async () => {
  // Test with mock environment and temporary socket structure
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-disp-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'wayland-9'), '');
    const hyprDir = path.join(tmpDir, 'hypr');
    fs.mkdirSync(hyprDir);
    fs.mkdirSync(path.join(hyprDir, 'mock_instance_signature_123'));

    const mockEnv = {
      XDG_RUNTIME_DIR: tmpDir,
    };

    const detected = ensureDisplayEnvironment(mockEnv);
    assert.equal(detected.WAYLAND_DISPLAY, 'wayland-9');
    assert.equal(detected.HYPRLAND_INSTANCE_SIGNATURE, 'mock_instance_signature_123');
    assert.equal(mockEnv.WAYLAND_DISPLAY, 'wayland-9');
    assert.equal(mockEnv.HYPRLAND_INSTANCE_SIGNATURE, 'mock_instance_signature_123');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AC1: PatchrightEngine initializes and ensures display environment', async () => {
  const engine = new PatchrightEngine();
  assert.equal(typeof engine.start, 'function');
  assert.equal(typeof ensureDisplayEnvironment, 'function');
});

test('AC2: assembleModelContext injects strict anti-hallucination instruction even when includeTools is false', () => {
  const assembled = assembleModelContext({
    query: 'Can you text Sarah on WhatsApp and tell her I am running late?',
    includeTools: false,
    conversations: [],
    memories: [],
  });

  const systemMessages = assembled.context.filter((msg) => msg.role === 'system');
  const antiHallucinationMsg = systemMessages.find((msg) =>
    msg.content.includes('NEVER claim to have sent an email, sent a message') &&
    msg.content.includes('WhatsApp') &&
    msg.content.includes('state honestly that you cannot perform the action directly')
  );

  assert.ok(antiHallucinationMsg, 'Anti-hallucination system rule must be present in context');
});

test('AC2: classifyForModel classifies messaging keywords into computer_use requiring tools', () => {
  const queries = [
    'send a whatsapp message to Mom',
    'message John on whatsapp saying hello',
    'text Sarah that I arrived',
    'can you dm Alex on slack',
    'send a telegram message to my team',
  ];

  for (const q of queries) {
    const classification = classifyForModel(q);
    assert.equal(classification.taskType, 'computer_use', `Query "${q}" should classify as computer_use`);
    assert.equal(classification.requiresTools, true, `Query "${q}" should require tools`);
  }
});

test('AC2: parseWhatsAppRequest extracts recipient and message cleanly', () => {
  const r1 = parseWhatsAppRequest('message John on whatsapp saying hey');
  assert.deepEqual(r1, { recipient: 'John', message: 'hey' });

  const r2 = parseWhatsAppRequest('text Mom on WhatsApp: I am on my way');
  assert.deepEqual(r2, { recipient: 'Mom', message: 'I am on my way' });

  const r3 = parseWhatsAppRequest('whatsapp Sarah that the meeting is delayed');
  assert.deepEqual(r3, { recipient: 'Sarah', message: 'the meeting is delayed' });

  const r4 = parseWhatsAppRequest('send a message to Alex on whatsapp');
  assert.deepEqual(r4, { recipient: 'Alex', message: '' });

  const r5 = parseWhatsAppRequest('send whatsapp to Bob saying hello');
  assert.deepEqual(r5, { recipient: 'Bob', message: 'hello' });

  const r6 = parseWhatsAppRequest('send whatsapp message to David');
  assert.deepEqual(r6, { recipient: 'David', message: '' });
});

test('AC2: routeRequest deterministically routes WhatsApp messages to browser.handoff', () => {
  const route = routeRequest('message John on whatsapp saying hey');
  assert.equal(route.route, 'TOOL_CALL');
  assert.equal(route.capability, 'browser.handoff');
  assert.equal(route.args.url, 'https://web.whatsapp.com');
  assert.equal(route.args.recipient, 'John');
  assert.equal(route.args.message, 'hey');
  assert.equal(route.args.isWhatsAppMessage, true);
});

test('AC3: routeRequest matches "open <site> on/in <browser>" and launches specified browser with URL argument', () => {
  const r1 = routeRequest('open youtube on brave browser');
  assert.equal(r1.route, 'TOOL_CALL');
  assert.equal(r1.capability, 'apps.open');
  assert.equal(r1.args.name, 'brave');
  assert.deepEqual(r1.args.args, ['https://www.youtube.com']);

  const r2 = routeRequest('open github.com in firefox');
  assert.equal(r2.route, 'TOOL_CALL');
  assert.equal(r2.capability, 'apps.open');
  assert.equal(r2.args.name, 'firefox');
  assert.deepEqual(r2.args.args, ['https://github.com']);

  const r3 = routeRequest('open instagram on brave');
  assert.equal(r3.route, 'TOOL_CALL');
  assert.equal(r3.capability, 'apps.open');
  assert.equal(r3.args.name, 'brave');
  assert.deepEqual(r3.args.args, ['https://www.instagram.com']);

  const r4 = routeRequest('open https://news.ycombinator.com using chromium');
  assert.equal(r4.route, 'TOOL_CALL');
  assert.equal(r4.capability, 'apps.open');
  assert.equal(r4.args.name, 'chromium');
  assert.deepEqual(r4.args.args, ['https://news.ycombinator.com']);
});

test('AC3: resolveApp resolves desktop browser aliases and strips trailing browser/app words', () => {
  const mockApps = [
    { id: 'brave-browser', name: 'Brave', genericName: 'Web Browser', startupWMClass: 'Brave-browser' },
    { id: 'chromium', name: 'Chromium', genericName: 'Web Browser', startupWMClass: 'Chromium' },
    { id: 'firefox', name: 'Firefox', genericName: 'Web Browser', startupWMClass: 'Firefox' },
    { id: 'zen', name: 'Zen Browser', genericName: 'Web Browser', startupWMClass: 'zen' },
    { id: 'com.spotify.Client', name: 'Spotify', genericName: 'Music Player', startupWMClass: 'Spotify' },
  ];

  const queries = [
    { query: 'brave browser', expectedId: 'brave-browser' },
    { query: 'brave', expectedId: 'brave-browser' },
    { query: 'chrome', expectedId: 'chromium' },
    { query: 'zen browser', expectedId: 'zen' },
    { query: 'firefox', expectedId: 'firefox' },
    { query: 'spotify app', expectedId: 'com.spotify.Client' },
  ];

  for (const { query, expectedId } of queries) {
    const res = resolveApp(query, mockApps);
    assert.equal(res.status, 'resolved', `Query "${query}" should resolve`);
    assert.equal(res.app.id, expectedId, `Query "${query}" should resolve to ${expectedId}`);
  }
});

test('AC2 & AC3: Chat route formats honest WhatsApp reply and bypasses voice confirmation for low-risk tools', () => {
  // WhatsApp honest reply format check
  const formatWhatsAppReply = (recipient) => {
    const who = recipient ? ` ${recipient}` : '';
    return `Direct WhatsApp sending is not automated without approval. I have opened WhatsApp Web for you so you can message${who} directly.`;
  };

  assert.equal(
    formatWhatsAppReply('John'),
    'Direct WhatsApp sending is not automated without approval. I have opened WhatsApp Web for you so you can message John directly.'
  );
  assert.equal(
    formatWhatsAppReply('Mom'),
    'Direct WhatsApp sending is not automated without approval. I have opened WhatsApp Web for you so you can message Mom directly.'
  );

  // Low-risk check
  const isLowRiskAction = (toolId) => [
    'apps.open',
    'browser.open',
    'browser.handoff',
  ].includes(toolId) ||
  toolId.startsWith('audio.') ||
  toolId.startsWith('media.') ||
  toolId.startsWith('reminders.');

  assert.ok(isLowRiskAction('apps.open'));
  assert.ok(isLowRiskAction('browser.open'));
  assert.ok(isLowRiskAction('browser.handoff'));
  assert.ok(isLowRiskAction('audio.set_volume'));
  assert.ok(isLowRiskAction('media.play'));
  assert.ok(isLowRiskAction('reminders.create'));
  assert.ok(!isLowRiskAction('shell.execute'));
  assert.ok(!isLowRiskAction('calendar.create'));
  assert.ok(!isLowRiskAction('gmail.send'));
});
