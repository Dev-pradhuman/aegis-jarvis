import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVoiceOsAction, nextDictation, normalizeShortcut, publishDictation, publishVoiceOsEvent, updateVoiceOsSettings, voiceOsEvents, voiceOsSettings } from '../server/voiceOs.js';
import fs from 'node:fs';
import { routeRequest } from '../server/router.js';

test('Voice OS settings persist notification source selection without unknown apps', () => {
  const state = {};
  updateVoiceOsSettings(state, { topIsland: false, notifications: { enabled: true, allApps: false, apps: ['gmail', 'whatsapp', 'unknown'] } });
  const settings = voiceOsSettings(state);
  assert.equal(settings.topIsland, false);
  assert.equal(settings.notifications.enabled, true);
  assert.deepEqual(settings.notifications.apps, ['gmail', 'whatsapp']);
});

test('Voice OS shortcuts persist only supported global key choices', () => {
  const state = {};
  updateVoiceOsSettings(state, { pushToTalkKey: 'ctrl+space', dictationKey: 'Shift+F14' });
  assert.equal(voiceOsSettings(state).pushToTalkKey, 'Ctrl+Space');
  assert.equal(voiceOsSettings(state).dictationKey, 'Shift+F14');
  updateVoiceOsSettings(state, { pushToTalkKey: 'A' });
  assert.equal(voiceOsSettings(state).pushToTalkKey, 'A');
  assert.throws(() => updateVoiceOsSettings(state, { dictationKey: 'Ctrl+Delete' }), (error) => error.code === 'REQUEST_ERROR');
  assert.equal(normalizeShortcut('windows+alt'), 'Alt+Win');
  assert.equal(normalizeShortcut('ctrl+alt'), 'Ctrl+Alt');
  assert.equal(normalizeShortcut('ctrl+alt+j'), 'Ctrl+Alt+J');
  assert.throws(() => normalizeShortcut('Ctrl+Fn', 'push-to-talk'), (error) => error.code === 'REQUEST_ERROR' && /Fn cannot be used/.test(error.message));
  assert.throws(() => normalizeShortcut('Ctrl', 'push-to-talk'), (error) => error.code === 'REQUEST_ERROR' && /Ctrl alone/.test(error.message));
  assert.throws(() => updateVoiceOsSettings(state, { dictationKey: 'CapsLock' }), (error) => error.code === 'REQUEST_ERROR');
  assert.throws(() => updateVoiceOsSettings(state, { dictationKey: 'Ctrl+K+L' }), (error) => error.code === 'REQUEST_ERROR');
});

test('legacy Caps Lock shortcuts migrate to safe defaults', () => {
  const settings = voiceOsSettings({ voiceOs: { settings: { pushToTalkKey: 'CapsLock', dictationKey: 'Shift+CapsLock' } } });
  assert.equal(settings.pushToTalkKey, 'Alt');
  assert.equal(settings.dictationKey, 'Ctrl+Shift');
});

test('Windows bridge observes shortcuts without swallowing keyboard events', () => {
  const source = fs.readFileSync(new URL('../windows/voice-os-bridge.ps1', import.meta.url), 'utf8');
  const hook = source.slice(source.indexOf('private static IntPtr Hook'), source.indexOf('private static bool IsDown'));
  assert.match(hook, /CallNextHookEx/);
  assert.doesNotMatch(hook, /return \(IntPtr\)1/);
  assert.match(source, /case "Win": return VK_JARVIS_WIN/);
  assert.doesNotMatch(source, /case "CapsLock"/);
});

test('development launcher starts Electron and lets its backend own the bridge', () => {
  const source = fs.readFileSync(new URL('../Start Voice OS.bat', import.meta.url), 'utf8');
  assert.match(source, /JARVIS_RENDERER_URL=http:\/\/127\.0\.0\.1:5173/);
  assert.match(source, /npm\.cmd run desktop/);
  assert.doesNotMatch(source, /-File "%~dp0windows\\voice-os-bridge\.ps1"/);
  assert.doesNotMatch(source, /msedge\.exe|chrome\.exe/);
});

test('Voice OS events are ordered and resumable by sequence', () => {
  const first = publishVoiceOsEvent({ type: 'hotkey.ptt.start' });
  const second = publishVoiceOsEvent({ type: 'incoming_call', app: 'whatsapp', contact: 'Arjun', callId: 'call-1' });
  assert.deepEqual(voiceOsEvents(first.id).map((event) => event.id), [second.id]);
});

test('cross-app dictation queue resumes without replaying typed text', () => {
  const item = publishDictation('नमस्ते from JARVIS');
  assert.equal(nextDictation(item.id - 1).text, 'नमस्ते from JARVIS');
  assert.equal(nextDictation(item.id), null);
});

test('configured control bridge must confirm a call action', async () => {
  const previous = process.env.VOICE_OS_CONTROL_URL; process.env.VOICE_OS_CONTROL_URL = 'http://controller.local';
  try {
    const result = await executeVoiceOsAction({ type: 'call.answer', app: 'whatsapp', callId: 'call-1' }, async (url, init) => {
      assert.equal(url, 'http://controller.local/actions');
      assert.equal(JSON.parse(init.body).type, 'call.answer');
      return { ok: true, status: 200, json: async () => ({ success: true, state: 'answered', provider: 'whatsapp-web' }) };
    });
    assert.equal(result.success, true); assert.equal(result.state, 'answered');
  } finally { if (previous === undefined) delete process.env.VOICE_OS_CONTROL_URL; else process.env.VOICE_OS_CONTROL_URL = previous; }
});

test('call answering fails honestly without a control bridge', async () => {
  const previous = process.env.VOICE_OS_CONTROL_URL; delete process.env.VOICE_OS_CONTROL_URL;
  try { await assert.rejects(() => executeVoiceOsAction({ type: 'call.answer', app: 'whatsapp' }), (error) => error.code === 'CAPABILITY_UNAVAILABLE'); }
  finally { if (previous !== undefined) process.env.VOICE_OS_CONTROL_URL = previous; }
});

test('call and explicit contact-message commands stay deterministic', () => {
  assert.equal(routeRequest('answer the call').capability, 'communications.call.answer');
  assert.deepEqual(routeRequest('call +91 99999 11111').args, { target: '+91 99999 11111' });
  const message = routeRequest('message Arjun on whatsapp: I will be there at 6');
  assert.equal(message.route, 'TOOL_CALL');
  assert.equal(message.capability, 'communication.send');
  assert.deepEqual(message.communicationIntent, { contact: 'Arjun', platform: 'whatsapp', message: 'I will be there at 6' });
});

test('Windows app launches and Instagram inbox checks bypass the model', () => {
  assert.deepEqual(routeRequest('open notepad'), { route: 'TOOL_CALL', capability: 'system.app.open', args: { app: 'notepad' }, confidence: 1 });
  assert.equal(routeRequest('Jarvis, can you open Notepad?').capability, 'system.app.open');
  assert.equal(routeRequest('Travis open YouTube.').capability, 'browser.external.open');
  assert.equal(routeRequest('Gæði upp en Instagram.', { source: 'voice' }).capability, 'browser.external.open');
  assert.equal(routeRequest('पन योट्यूब ना', { source: 'voice' }).capability, 'browser.external.open');
  assert.equal(routeRequest('What is Instagram?', { source: 'voice' }).route, 'MODEL');
  const instagram = routeRequest('any new messages on insta?');
  assert.equal(instagram.capability, 'instagram.messages.latest');
  assert.equal(instagram.confidence, 0.99);
});

test('explicit YouTube playback never becomes YouTube Music', () => {
  const youtube=routeRequest('can you play seven nation army on youtube');
  assert.equal(youtube.capability,'youtube.play');assert.equal(youtube.args.service,'youtube');
  const music=routeRequest('play seven nation army on youtube music');
  assert.equal(music.capability,'youtube_music.play');assert.equal(music.args.service,'youtube_music');
});

test('unread Gmail requests use the deterministic grounded search path',()=>{const route=routeRequest('any new mail for me?');assert.equal(route.capability,'gmail.search');assert.deepEqual(route.args,{query:'is:unread',limit:10});});
