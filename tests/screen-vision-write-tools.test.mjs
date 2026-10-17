import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest } from '../server/router.js';
import { invokeToolRequest } from '../server/toolRuntime.js';
import { resolveApprovalRequest } from '../server/approvalContinuation.js';
import { createLinuxScreen } from '../server/platform/linux/screen.js';
import { getTool } from '../server/registry.js';

test('Screen and Window Vision Intent Routing', () => {
  // Desktop screen queries
  const desktopQueries = [
    'what is on my screen right now',
    'look at my screen and tell me what is wrong',
    'explain this error on my screen',
    'summarize my screen right now',
    'inspect my screen'
  ];

  for (const q of desktopQueries) {
    const route = routeRequest(q);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q}" should route to TOOL_CALL`);
    assert.equal(route.capability, 'screen.describe', `Query "${q}" should map to screen.describe`);
    assert.ok(route.confidence >= 0.9, `Query "${q}" should have confidence >= 0.9`);
    assert.equal(route.args.target, 'desktop', `Query "${q}" should target desktop`);
  }

  // Active window queries
  const windowQueries = [
    'summarize the active window',
    'what is on the active window',
    'look at the active window',
    'describe the active window',
    'explain the current window'
  ];

  for (const q of windowQueries) {
    const route = routeRequest(q);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q}" should route to TOOL_CALL`);
    assert.equal(route.capability, 'screen.describe', `Query "${q}" should map to screen.describe`);
    assert.ok(route.confidence >= 0.9, `Query "${q}" should have confidence >= 0.9`);
    assert.equal(route.args.target, 'window', `Query "${q}" should target window`);
  }
});

test('Calendar and Gmail Write Intent Routing', () => {
  const cal1 = routeRequest('create a calendar event Team Sync at 2026-10-25T14:00:00Z');
  assert.equal(cal1.route, 'TOOL_CALL');
  assert.equal(cal1.capability, 'calendar.create');
  assert.equal(cal1.args.summary, 'Team Sync');
  assert.equal(cal1.args.startTime, '2026-10-25T14:00:00.000Z');

  const cal2 = routeRequest('schedule a meeting Q4 Planning on tomorrow at 3pm');
  assert.equal(cal2.route, 'TOOL_CALL');
  assert.equal(cal2.capability, 'calendar.create');
  assert.equal(cal2.args.summary, 'Q4 Planning');

  const mail1 = routeRequest('send email to alice@example.com with subject Project Status and body Here is the update');
  assert.equal(mail1.route, 'TOOL_CALL');
  assert.equal(mail1.capability, 'gmail.send');
  assert.equal(mail1.args.to, 'alice@example.com');
  assert.equal(mail1.args.subject, 'Project Status');
  assert.equal(mail1.args.body, 'Here is the update');

  const mail2 = routeRequest('email bob@corp.org: please review the pull request');
  assert.equal(mail2.route, 'TOOL_CALL');
  assert.equal(mail2.capability, 'gmail.send');
  assert.equal(mail2.args.to, 'bob@corp.org');
  assert.equal(mail2.args.body, 'please review the pull request');
});

test('Calendar and Gmail Approval Gating & Summaries', async () => {
  const origComposio = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'test-composio-key';

  try {
    const calTool = getTool('calendar.create');
    assert.ok(calTool, 'calendar.create tool must exist in registry');
    assert.equal(calTool.requiresApproval, true, 'calendar.create must require approval');

    const gmailTool = getTool('gmail.send');
    assert.ok(gmailTool, 'gmail.send tool must exist in registry');
    assert.equal(gmailTool.requiresApproval, true, 'gmail.send must require approval');

    let state = {
      approvals: [],
      activity: [],
      conversations: [],
      approvalPolicy: { mode: 'ASK' }
    };
    const persist = async (mutate) => { state = mutate(state); return state; };
    const read = async () => state;

    // 1. calendar.create approval request
    const calReq = await invokeToolRequest(state, {
      toolId: 'calendar.create',
      input: { summary: 'Design Review', startTime: '2026-10-20T10:00:00Z' }
    }, { persist });
    assert.equal(calReq.status, 202);
    assert.ok(calReq.body.approvalRequired);
    assert.ok(calReq.body.approval.sub.includes('Design Review'));
    assert.ok(calReq.body.approval.sub.includes('2026-10-20T10:00:00Z'));

    // 2. gmail.send approval request
    const mailReq = await invokeToolRequest(state, {
      toolId: 'gmail.send',
      input: { to: 'colleague@example.com', subject: 'Launch Plan', body: 'Ready for launch' }
    }, { persist });
    assert.equal(mailReq.status, 202);
    assert.ok(mailReq.body.approvalRequired);
    assert.ok(mailReq.body.approval.sub.includes('colleague@example.com'));
    assert.ok(mailReq.body.approval.sub.includes('Launch Plan'));

    // 3. Reject approval
    const rejectRes = await resolveApprovalRequest(mailReq.body.approval.id, 'rejected', {
      persist,
      read
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.approval.status, 'rejected');
  } finally {
    if (origComposio !== undefined) process.env.COMPOSIO_API_KEY = origComposio;
    else delete process.env.COMPOSIO_API_KEY;
  }
});

test('Linux Screen Wayland & Active Window Grim invocation', async () => {
  const mockCalls = [];
  const fakeRun = async (cmd, args) => {
    mockCalls.push({ cmd, args });
    return { stdout: '' };
  };

  const savedSig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
  process.env.HYPRLAND_INSTANCE_SIGNATURE = 'fake-hypr-sig';

  try {
    // Test custom run passes through portal fallback when not defaultRun
    const screen = createLinuxScreen({ run: fakeRun });
    // When custom run is passed, it behaves as portal test provider and rejects non-desktop targets
    await assert.rejects(
      async () => { await screen.capture({ target: 'window' }); },
      (err) => err.code === 'SCREEN_TARGET_UNSUPPORTED'
    );
  } finally {
    if (savedSig !== undefined) process.env.HYPRLAND_INSTANCE_SIGNATURE = savedSig;
    else delete process.env.HYPRLAND_INSTANCE_SIGNATURE;
  }
});
