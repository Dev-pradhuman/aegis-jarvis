import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinuxWindows, resolveWindow } from '../server/platform/linux/windows.js';
import { appWindowMatches, executeTool } from '../server/toolExecutor.js';
import { invokeToolRequest } from '../server/toolRuntime.js';
import { routeRequest } from '../server/router.js';
import { getTool } from '../server/registry.js';

const a = { windowId: 'a', appId: 'firefox', processId: 100, title: 'Disposable Firefox', focused: true, minimized: false, maximized: false };
const b = { windowId: 'b', appId: 'terminal', processId: 200, title: 'Disposable Terminal', focused: false, minimized: false, maximized: false };

function fixture() {
  const state = { approvals: [], activity: [], toolExecutions: [] };
  let active = a;
  const calls = [];
  const windows = {
    supported: true,
    list: async () => [a, b],
    getActive: async () => active,
    find: async (target) => resolveWindow([a, b], target),
    focus: async (target) => { active = resolveWindow([a, b], target); calls.push(['focus', active.windowId]); return active; },
  };
  const input = {
    startSession: async () => { calls.push(['session']); },
    type: async (text) => { calls.push(['type', text]); return { sent: text.length }; },
    keypress: async (keys) => { calls.push(['keypress', keys]); return { sent: 1 }; },
  };
  const platform = { windows, input, apps: { list: async () => [{ id: 'firefox', name: 'Firefox' }], open: async () => ({ status: 'launched' }) } };
  const persist = async (mutate) => mutate(state);
  return { state, platform, persist, calls, setActive: (window) => { active = window; } };
}

test('window identity resolution refuses ambiguous names and changed process identity', () => {
  assert.equal(resolveWindow([a, b], { appId: 'firefox' }).windowId, 'a');
  assert.throws(() => resolveWindow([a], { windowId: 'a', appId: 'terminal' }), { code: 'WINDOW_NOT_FOUND' });
  assert.throws(() => resolveWindow([a], { windowId: 'a', processId: 999 }), { code: 'WINDOW_NOT_FOUND' });
  assert.throws(() => resolveWindow([a, { ...a, windowId: 'c' }], { name: 'Firefox' }), { code: 'AMBIGUOUS_TARGET' });
});

test('KWin provider normalizes list and verifies focus through active-window readback', async () => {
  const calls = [];
  const run = async (_program, args) => {
    const command = JSON.parse(args[1]); calls.push(command.action);
    if (command.action === 'list') return { stdout: JSON.stringify({ ok: true, windows: [a, b] }) };
    if (command.action === 'active') return { stdout: JSON.stringify({ ok: true, window: a }) };
    return { stdout: JSON.stringify({ ok: true, window: a }) };
  };
  const windows = createLinuxWindows({ desktopEnvironment: 'KDE', displayServer: 'wayland', run });
  assert.equal((await windows.list()).length, 2);
  assert.equal((await windows.getActive()).windowId, 'a');
  assert.equal((await windows.focus({ windowId: 'a' })).windowId, 'a');
  assert.deepEqual(calls, ['list', 'active', 'list', 'focus', 'active']);
});

test('app launch reuses an existing exact app window and verifies focus', async () => {
  const f = fixture();
  let launches = 0;
  f.platform.apps.open = async () => { launches++; return { status: 'launched' }; };
  const result = await executeTool('apps.open', { name: 'Firefox' }, { platform: f.platform });
  assert.equal(result.data.status, 'focused');
  assert.equal(result.data.window.windowId, 'a');
  assert.equal(launches, 0);
  assert.deepEqual(f.calls, [['focus', 'a']]);
  assert.equal(appWindowMatches({ id: 'firefox_firefox', name: 'Firefox' }, { appId: 'firefox-default', title: 'New tab' }), true);
  assert.equal(appWindowMatches({ id: 'chatgpt', name: 'ChatGPT' }, { appId: 'zen', title: 'ChatGPT — Zen' }), false);
});

test('app launch waits for its new window and returns exact resolved identity', async () => {
  const f = fixture();
  let listed = 0;
  let launched = false;
  f.platform.windows.list = async () => { listed++; return launched ? [b, a] : [b]; };
  f.platform.apps.open = async () => { launched = true; return { status: 'launched' }; };
  const result = await executeTool('apps.open', { name: 'Firefox' }, { platform: f.platform });
  assert.equal(result.data.status, 'launched');
  assert.equal(result.data.window.windowId, 'a');
  assert.ok(listed >= 2);
});

test('launch errors remain structured and do not claim a window', async () => {
  const f = fixture();
  f.platform.windows.list = async () => [b];
  f.platform.apps.open = async () => { throw new Error('launcher unavailable'); };
  await assert.rejects(executeTool('apps.open', { name: 'Firefox' }, { platform: f.platform }), { code: 'APP_LAUNCH_FAILED' });
});

test('target-bound approval is exact, one-use, and aborts when focus changes', async () => {
  const oldFlag = process.env.JARVIS_DESKTOP_INPUT;
  const oldToken = process.env.JARVIS_AUTH_TOKEN;
  process.env.JARVIS_DESKTOP_INPUT = '1'; process.env.JARVIS_AUTH_TOKEN = 'test';
  try {
    if (!getTool('computer.type').enabled) return;
    const f = fixture();
    const dependencies = { platform: f.platform, persist: f.persist, execute: executeTool };
    const pending = await invokeToolRequest(f.state, { toolId: 'computer.type', input: { text: 'hello', target: { appId: 'firefox' } }, idempotencyKey: 'type-a' }, dependencies);
    assert.equal(pending.status, 202);
    assert.match(pending.body.approval.sub, /firefox \(a\)/);
    assert.deepEqual(pending.body.approval.pendingRequest, undefined);
    const approved = pending.body.approval;
    approved.status = 'approved';
    const wrongWindow = await invokeToolRequest(f.state, { toolId: 'computer.type', input: { text: 'hello', target: { windowId: 'b' } }, idempotencyKey: 'type-b', approvalId: approved.id }, dependencies);
    assert.equal(wrongWindow.status, 403);
    assert.equal(f.calls.some((call) => call[0] === 'type'), false);
    f.setActive(b);
    await assert.rejects(invokeToolRequest(f.state, { toolId: 'computer.type', input: { text: 'hello', target: { windowId: 'a' } }, idempotencyKey: 'type-a', approvalId: approved.id }, dependencies), { code: 'TARGET_FOCUS_CHANGED' });
    assert.equal(f.calls.some((call) => call[0] === 'type'), false);
    assert.equal(approved.status, 'consumed');
    const reused = await invokeToolRequest(f.state, { toolId: 'computer.type', input: { text: 'hello', target: { windowId: 'a' } }, idempotencyKey: 'type-a', approvalId: approved.id }, dependencies);
    assert.equal(reused.status, 409);
    assert.equal(reused.body.code, 'ACTION_OUTCOME_UNKNOWN');
  } finally {
    if (oldFlag === undefined) delete process.env.JARVIS_DESKTOP_INPUT; else process.env.JARVIS_DESKTOP_INPUT = oldFlag;
    if (oldToken === undefined) delete process.env.JARVIS_AUTH_TOKEN; else process.env.JARVIS_AUTH_TOKEN = oldToken;
  }
});

test('keypress requires a new exact approval and verified active target', async () => {
  const oldFlag = process.env.JARVIS_DESKTOP_INPUT;
  const oldToken = process.env.JARVIS_AUTH_TOKEN;
  process.env.JARVIS_DESKTOP_INPUT = '1'; process.env.JARVIS_AUTH_TOKEN = 'test';
  try {
    if (!getTool('computer.keypress').enabled) return;
    const f = fixture();
    const deps = { platform: f.platform, persist: f.persist, execute: executeTool };
    const pending = await invokeToolRequest(f.state, { toolId: 'computer.keypress', input: { keys: 'Enter' }, idempotencyKey: 'enter-1', resumeOnApproval: true }, deps);
    pending.body.approval.status = 'approved';
    const result = await invokeToolRequest(f.state, { ...pending.body.approval.pendingRequest, approvalId: pending.body.approval.id }, deps);
    assert.equal(result.status, 200);
    assert.deepEqual(f.calls.at(-1), ['keypress', 'Enter']);
    assert.equal(pending.body.approval.status, 'consumed');
  } finally {
    if (oldFlag === undefined) delete process.env.JARVIS_DESKTOP_INPUT; else process.env.JARVIS_DESKTOP_INPUT = oldFlag;
    if (oldToken === undefined) delete process.env.JARVIS_AUTH_TOKEN; else process.env.JARVIS_AUTH_TOKEN = oldToken;
  }
});

test('close approval binds the exact window ID and cannot close a different window', async () => {
  const oldFlag = process.env.JARVIS_DESKTOP_INPUT;
  const oldToken = process.env.JARVIS_AUTH_TOKEN;
  process.env.JARVIS_DESKTOP_INPUT = '1'; process.env.JARVIS_AUTH_TOKEN = 'test';
  try {
    if (!getTool('windows.close').enabled) return;
    const f = fixture();
    let closed = null;
    f.platform.windows.close = async (target) => { closed = target.windowId; return { windowId: target.windowId, closed: true }; };
    const deps = { platform: f.platform, persist: f.persist, execute: executeTool };
    const pending = await invokeToolRequest(f.state, { toolId: 'windows.close', input: { target: { windowId: 'a' } }, idempotencyKey: 'close-a', resumeOnApproval: true }, deps);
    assert.equal(pending.status, 202);
    pending.body.approval.status = 'approved';
    const wrong = await invokeToolRequest(f.state, { toolId: 'windows.close', input: { target: { windowId: 'b' } }, idempotencyKey: 'close-b', approvalId: pending.body.approval.id }, deps);
    assert.equal(wrong.status, 403);
    assert.equal(closed, null);
    const result = await invokeToolRequest(f.state, { ...pending.body.approval.pendingRequest, approvalId: pending.body.approval.id }, deps);
    assert.equal(result.status, 200);
    assert.equal(closed, 'a');
  } finally {
    if (oldFlag === undefined) delete process.env.JARVIS_DESKTOP_INPUT; else process.env.JARVIS_DESKTOP_INPUT = oldFlag;
    if (oldToken === undefined) delete process.env.JARVIS_AUTH_TOKEN; else process.env.JARVIS_AUTH_TOKEN = oldToken;
  }
});

test('deterministic chat routes explicit window actions without a model', () => {
  assert.deepEqual(routeRequest('Type hello into Firefox').args, { text: 'hello', target: { name: 'Firefox' } });
  assert.equal(routeRequest('Press Enter in ChatGPT').capability, 'computer.keypress');
  assert.equal(routeRequest('Focus VS Code').capability, 'windows.focus');
  assert.equal(routeRequest('Minimize Spotify').capability, 'windows.minimize');
  assert.equal(routeRequest('What is the active window?').capability, 'windows.get_active');
});
