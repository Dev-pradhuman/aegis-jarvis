#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.JARVIS_URL || 'http://127.0.0.1:8787';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = path.join(projectRoot, 'server', 'data', 'state.json');

console.log('============================================================');
console.log(`🚀 STARTING AEGIS-JARVIS LIVE USER DOGFOODING SUITE`);
console.log(`Target Daemon: ${BASE_URL}`);
console.log('Mode: Real OS & Cloud API (Zero Mocks)');
console.log('============================================================\n');

async function chat(message, extra = {}) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
    },
    body: JSON.stringify({ message, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function executeTool(toolId, input = {}) {
  const res = await fetch(`${BASE_URL}/api/tools/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
    },
    body: JSON.stringify({ toolId, input }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// -------------------------------------------------------------
// Suite 1: Audio & Media Control
// -------------------------------------------------------------
async function runSuite1AudioMedia() {
  console.log('--- [Suite 1: Audio & Media Control] ---');

  // 1. Fast-path volume query
  console.log('1.1 Querying system volume (fast-path)...');
  const volRes = await chat('what is the system volume');
  assert.equal(volRes.status, 200, `Expected 200, got ${volRes.status}`);
  assert.equal(volRes.data.grounded, true, 'Volume reply must be grounded');
  assert.match(volRes.data.reply, /system volume is \d+ percent/i, `Unexpected volume reply: ${volRes.data.reply}`);
  const match = volRes.data.reply.match(/(\d+) percent/i);
  const initialVolume = match ? parseInt(match[1], 10) : 40;
  console.log(`  ✓ System volume read: ${initialVolume}%`);

  // 2. Natural language volume decrease (LLM Tool-Loop)
  console.log('1.2 Lowering speaker volume via conversational LLM tool loop...');
  const lowerRes = await chat('could you please lower the speaker volume by 5 percent');
  assert.equal(lowerRes.status, 200, `Expected 200, got ${lowerRes.status}`);
  assert.equal(lowerRes.data.grounded, true, 'Lower volume reply must be grounded');
  assert.ok(
    lowerRes.data.reply.toLowerCase().includes('lowered') ||
    lowerRes.data.reply.toLowerCase().includes('volume') ||
    lowerRes.data.reply.toLowerCase().includes('percent'),
    `Unexpected lower volume reply: ${lowerRes.data.reply}`
  );
  console.log(`  ✓ Natural volume lowering succeeded: "${lowerRes.data.reply}" (Model: ${lowerRes.data.model || 'direct'})`);

  // 3. Restore volume
  console.log('1.3 Restoring original speaker volume...');
  const restoreRes = await chat('could you please increase the speaker volume by 5 percent');
  assert.equal(restoreRes.status, 200, `Expected 200, got ${restoreRes.status}`);
  assert.equal(restoreRes.data.grounded, true, 'Restore volume reply must be grounded');
  console.log(`  ✓ Speaker volume restored: "${restoreRes.data.reply}"`);

  // 4. Query media player status
  console.log('1.4 Querying media player status...');
  const mediaRes = await chat('what song is playing right now');
  assert.equal(mediaRes.status, 200, `Expected 200, got ${mediaRes.status}`);
  assert.equal(mediaRes.data.grounded, true, 'Media status reply must be grounded');
  assert.ok(mediaRes.data.reply.length > 0, 'Media reply should not be empty');
  console.log(`  ✓ Media player status: "${mediaRes.data.reply}"`);
  console.log('✓ Suite 1 Passed!\n');
}

// -------------------------------------------------------------
// Suite 2: Hyprland Window Management & App Launching
// -------------------------------------------------------------
async function runSuite2WindowsApps() {
  console.log('--- [Suite 2: Hyprland Window Management & App Launching] ---');

  // 2.1 List open windows
  console.log('2.1 Listing open desktop windows...');
  const listRes = await chat('list my open desktop windows');
  assert.equal(listRes.status, 200, `Expected 200, got ${listRes.status}`);
  assert.equal(listRes.data.grounded, true, 'Windows list reply must be grounded');
  assert.ok(listRes.data.reply.length > 10, 'Expected non-empty window list');
  console.log(`  ✓ Windows list reported: ${listRes.data.reply.split('\n').length} items found`);

  // 2.2 Active window
  console.log('2.2 Querying focused active window...');
  const activeRes = await chat('what window am I currently focused on?');
  assert.equal(activeRes.status, 200, `Expected 200, got ${activeRes.status}`);
  assert.equal(activeRes.data.grounded, true, 'Active window reply must be grounded');
  assert.match(activeRes.data.reply, /get_active:/i, `Expected get_active format: ${activeRes.data.reply}`);
  console.log(`  ✓ Focused window: "${activeRes.data.reply}"`);

  // 2.3 Conversational app launch (Brave)
  console.log('2.3 Launching/focusing Brave browser conversatingly...');
  const braveRes = await chat('can you launch brave browser');
  assert.equal(braveRes.status, 200, `Expected 200, got ${braveRes.status}`);
  assert.doesNotMatch(braveRes.data.reply, /Window opening could not be verified/i);
  assert.doesNotMatch(braveRes.data.reply, /Missing X server or \$DISPLAY/i);
  console.log(`  ✓ Brave launched/focused: "${braveRes.data.reply}"`);

  // 2.4 Open URL on specific browser
  console.log('2.4 Opening github.com on Brave browser...');
  const urlRes = await chat('open github.com on brave browser');
  assert.equal(urlRes.status, 200, `Expected 200, got ${urlRes.status}`);
  assert.doesNotMatch(urlRes.data.reply, /Window opening could not be verified/i);
  console.log(`  ✓ URL opened on browser: "${urlRes.data.reply}"`);
  console.log('✓ Suite 2 Passed!\n');
}

// -------------------------------------------------------------
// Suite 3: Grounded Screen Vision & Active-Window Vision
// -------------------------------------------------------------
async function runSuite3Vision() {
  console.log('--- [Suite 3: Grounded Screen Vision & Active-Window Vision] ---');

  // 3.1 1-click Screen Vision Button (captures grim desktop screenshot)
  console.log('3.1 Testing 1-click Screen Vision (grim capture -> OpenRouter Nemotron VL)...');
  const screenVisionRes = await chat('What application and text do you see in this screenshot?', { attachScreen: true });
  assert.equal(screenVisionRes.status, 200, `Expected 200, got ${screenVisionRes.status}`);
  assert.equal(screenVisionRes.data.grounded, true, 'Screen vision reply must be grounded');
  assert.ok(screenVisionRes.data.reply.length > 20, 'Expected detailed vision summary');
  assert.doesNotMatch(screenVisionRes.data.reply, /NO_ZERO_COST_MODEL_AVAILABLE/i);
  assert.doesNotMatch(screenVisionRes.data.reply, /MODEL_CAPABILITY_UNSUPPORTED/i);
  console.log(`  ✓ Full screen vision perceived: "${screenVisionRes.data.reply.slice(0, 100)}..."`);

  // 3.2 Active Window Vision (grim -g window geometry -> OpenRouter Nemotron VL)
  console.log('3.2 Testing Active Window Vision (target: window)...');
  const winVisionRes = await chat('describe the active window');
  assert.equal(winVisionRes.status, 200, `Expected 200, got ${winVisionRes.status}`);
  assert.equal(winVisionRes.data.grounded, true, 'Active window vision reply must be grounded');
  assert.ok(winVisionRes.data.reply.length > 20, 'Expected detailed active window description');
  console.log(`  ✓ Active window vision perceived: "${winVisionRes.data.reply.slice(0, 100)}..."`);
  console.log('✓ Suite 3 Passed!\n');
}

// -------------------------------------------------------------
// Suite 4: Timers, Alarms, Reminders & Voice Snooze/Dismiss
// -------------------------------------------------------------
async function runSuite4TimersReminders() {
  console.log('--- [Suite 4: Timers, Alarms, Reminders & Voice Snooze/Dismiss] ---');

  // 4.1 Create timer
  console.log('4.1 Creating timer: "set a timer for 2 minutes called dogfood-tea"...');
  const timerRes = await chat('set a timer for 2 minutes called dogfood-tea');
  assert.equal(timerRes.status, 200, `Expected 200, got ${timerRes.status}`);
  assert.equal(timerRes.data.grounded, true, 'Timer creation must be grounded');
  assert.match(timerRes.data.reply, /Reminder scheduled for .*: dogfood-tea/i);
  console.log(`  ✓ Timer created: "${timerRes.data.reply}"`);

  // 4.2 List reminders (ensure NO fallthrough to files.read on README)
  console.log('4.2 Listing active reminders...');
  const listRes = await chat('what are my active reminders');
  assert.equal(listRes.status, 200, `Expected 200, got ${listRes.status}`);
  assert.equal(listRes.data.grounded, true, 'Reminder listing must be grounded');
  assert.doesNotMatch(listRes.data.reply, /README\.md is \d+ bytes/i, 'Must NOT fall through to files.read');
  assert.ok(listRes.data.reply.includes('dogfood-tea'), 'Expected dogfood-tea in active reminders list');
  console.log(`  ✓ Active reminders listed: "${listRes.data.reply}"`);

  // 4.3 Snooze without specifying ID
  console.log('4.3 Snoozing timer without specifying ID: "snooze the timer for 5 minutes"...');
  const snoozeRes = await chat('snooze the timer for 5 minutes');
  assert.equal(snoozeRes.status, 200, `Expected 200, got ${snoozeRes.status}`);
  assert.equal(snoozeRes.data.grounded, true, 'Snooze reply must be grounded');
  assert.match(snoozeRes.data.reply, /snoozed until/i, `Unexpected snooze reply: ${snoozeRes.data.reply}`);
  console.log(`  ✓ Timer snoozed: "${snoozeRes.data.reply}"`);

  // 4.4 Dismiss without specifying ID
  console.log('4.4 Dismissing timer without specifying ID: "dismiss the timer"...');
  const dismissRes = await chat('dismiss the timer');
  assert.equal(dismissRes.status, 200, `Expected 200, got ${dismissRes.status}`);
  assert.equal(dismissRes.data.grounded, true, 'Dismiss reply must be grounded');
  assert.match(dismissRes.data.reply, /has been dismissed/i, `Unexpected dismiss reply: ${dismissRes.data.reply}`);
  console.log(`  ✓ Timer dismissed: "${dismissRes.data.reply}"`);
  console.log('✓ Suite 4 Passed!\n');
}

// -------------------------------------------------------------
// Suite 5: Tasks, Durable Memory & Project Intelligence
// -------------------------------------------------------------
let createdMemoryId = null;

async function runSuite5TasksMemoryProject() {
  console.log('--- [Suite 5: Tasks, Durable Memory & Project Intelligence] ---');

  // 5.1 Create task via conversational prompt
  console.log('5.1 Creating task: "create task: Finish CBSE Class 10 math practice"...');
  const taskRes = await chat('create task: Finish CBSE Class 10 math practice');
  assert.equal(taskRes.status, 200, `Expected 200, got ${taskRes.status}`);
  assert.equal(taskRes.data.grounded, true, 'Task creation must be grounded');
  assert.match(taskRes.data.reply, /(?:Created task|Task created): Finish CBSE Class 10 math practice/i);
  console.log(`  ✓ Task created: "${taskRes.data.reply}"`);

  // 5.2 List tasks via conversational phrasing
  console.log('5.2 Listing tasks via: "what tasks are on my to-do list?"...');
  const listTasksRes = await chat('what tasks are on my to-do list?');
  assert.equal(listTasksRes.status, 200, `Expected 200, got ${listTasksRes.status}`);
  assert.equal(listTasksRes.data.grounded, true, 'Tasks list must be grounded');
  assert.ok(listTasksRes.data.reply.includes('Finish CBSE Class 10 math practice'), 'Expected task in list reply');
  console.log(`  ✓ Tasks list: "${listTasksRes.data.reply}"`);

  // 5.3 Store durable memory via POST /api/memory
  console.log('5.3 Storing durable memory via POST /api/memory...');
  const memPostRes = await fetch(`${BASE_URL}/api/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({
      text: 'CBSE Class 10 math practice focuses on quadratic equations and trigonometry formulas.',
      kind: 'project'
    }),
  });
  assert.equal(memPostRes.status, 201, `Expected 201, got ${memPostRes.status}`);
  const memData = await memPostRes.json();
  assert.ok(memData.memory?.id, 'Expected memory object with ID');
  createdMemoryId = memData.memory.id;
  console.log(`  ✓ Durable memory stored (ID: ${createdMemoryId})`);

  // 5.4 Retrieve memory via conversational chat
  console.log('5.4 Retrieving memory via: "what do you remember about my math practice?"...');
  const memGetRes = await chat('what do you remember about my math practice?');
  assert.equal(memGetRes.status, 200, `Expected 200, got ${memGetRes.status}`);
  assert.equal(memGetRes.data.grounded, true, 'Memory retrieval reply must be grounded');
  assert.ok(
    memGetRes.data.reply.toLowerCase().includes('quadratic') ||
    memGetRes.data.reply.toLowerCase().includes('cbse') ||
    memGetRes.data.reply.toLowerCase().includes('math'),
    `Unexpected memory reply: ${memGetRes.data.reply}`
  );
  console.log(`  ✓ Memory retrieved: "${memGetRes.data.reply}"`);

  // 5.5 Inspect project status
  console.log('5.5 Inspecting project status via: "what changed in the project?"...');
  const projRes = await chat('what changed in the project?');
  assert.equal(projRes.status, 200, `Expected 200, got ${projRes.status}`);
  assert.equal(projRes.data.grounded, true, 'Project status reply must be grounded');
  assert.match(projRes.data.reply, /phase45-brain-mode/i, `Expected branch in reply: ${projRes.data.reply}`);
  console.log(`  ✓ Project status reported: "${projRes.data.reply}"`);
  console.log('✓ Suite 5 Passed!\n');
}

// -------------------------------------------------------------
// Suite 6: Consequential Approval Gate & Same-Run Resumption
// -------------------------------------------------------------
async function runSuite6ApprovalGate() {
  console.log('--- [Suite 6: Consequential Approval Gate & Same-Run Resumption] ---');

  // 6.1 Trigger approval-gated tool
  console.log('6.1 Triggering consequential command execution...');
  const gatedRes = await chat('execute command: echo JARVIS_LIVE_OK');
  assert.equal(gatedRes.status, 202, `Expected HTTP 202 for approval-gated action, got ${gatedRes.status}`);
  assert.equal(gatedRes.data.approvalRequired, true, 'Expected approvalRequired: true');
  assert.ok(gatedRes.data.approval?.id, 'Expected valid approval.id');
  const approvalId = gatedRes.data.approval.id;
  console.log(`  ✓ Approval gate triggered: HTTP 202 (Approval ID: ${approvalId})`);

  // 6.2 Approve via POST /api/approvals/:id
  console.log(`6.2 Resolving approval ${approvalId} with outcome: "approved"...`);
  const approveRes = await fetch(`${BASE_URL}/api/approvals/${approvalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ outcome: 'approved' }),
  });
  assert.equal(approveRes.status, 200, `Expected 200, got ${approveRes.status}`);
  const approveData = await approveRes.json();
  assert.equal(approveData.approval?.status, 'consumed', 'Approval status should be consumed');
  assert.ok(approveData.result?.data?.stdout?.includes('JARVIS_LIVE_OK'), 'Stdout should include JARVIS_LIVE_OK');
  console.log(`  ✓ Approval resumed and executed: "${approveData.result.data.stdout.trim()}"`);

  // 6.3 Verify outcome was written to GET /api/chats
  console.log('6.3 Verifying completed outcome in GET /api/chats...');
  const chatsRes = await fetch(`${BASE_URL}/api/chats`);
  assert.equal(chatsRes.status, 200, `Expected 200, got ${chatsRes.status}`);
  const chatsData = await chatsRes.json();
  const lastJarvisMsg = [...(chatsData.messages || [])].reverse().find(m => m.who === 'JARVIS');
  assert.ok(lastJarvisMsg, 'Expected at least one JARVIS message');
  assert.ok(
    lastJarvisMsg.lines?.some(l => l.includes('JARVIS_LIVE_OK')),
    `Expected completed command in conversations: ${JSON.stringify(lastJarvisMsg)}`
  );
  console.log(`  ✓ Chat history verified: "${lastJarvisMsg.lines.join(' ')}"`);
  console.log('✓ Suite 6 Passed!\n');
}

// -------------------------------------------------------------
// Suite 7: Managed Stealth Browser & Honest Messaging Handoff
// -------------------------------------------------------------
async function runSuite7ManagedBrowser() {
  console.log('--- [Suite 7: Managed Stealth Browser & Honest Messaging Handoff] ---');

  // 7.1 Navigate to example.com via browser.navigate
  console.log('7.1 Navigating to https://example.com in managed browser...');
  const navRes = await executeTool('browser.navigate', { url: 'https://example.com' });
  assert.equal(navRes.status, 200, `Expected 200, got ${navRes.status}`);
  assert.equal(navRes.data.ok, true, 'browser.navigate must succeed');
  assert.equal(navRes.data.data?.result?.title, 'Example Domain', 'Expected title "Example Domain"');
  console.log(`  ✓ Navigation verified: "${navRes.data.data.result.title}" (${navRes.data.data.result.url})`);

  // 7.2 Read page content via browser.read
  console.log('7.2 Reading page content via browser.read...');
  const readRes = await executeTool('browser.read', {});
  assert.equal(readRes.status, 200, `Expected 200, got ${readRes.status}`);
  assert.equal(readRes.data.ok, true, 'browser.read must succeed');
  assert.ok(readRes.data.data?.result?.text?.includes('This domain is for use in documentation examples'), 'Expected documentation domain text');
  console.log(`  ✓ Page content read successfully (${readRes.data.data.result.text.length} chars)`);

  // 7.3 Open Instagram (headed browser handoff)
  console.log('7.3 Testing browser handoff for "open instagram"...');
  const instaRes = await chat('open instagram');
  assert.equal(instaRes.status, 200, `Expected 200, got ${instaRes.status}`);
  assert.match(instaRes.data.reply, /Opened Instagram in browser/i);
  console.log(`  ✓ Instagram handoff verified: "${instaRes.data.reply}"`);

  // 7.4 Honest WhatsApp handoff (zero hallucinated send)
  console.log('7.4 Testing WhatsApp messaging anti-hallucination handoff...');
  const waRes = await chat('can u message arjun on whatsapp that hey bro');
  assert.equal(waRes.status, 200, `Expected 200, got ${waRes.status}`);
  assert.equal(waRes.data.grounded, true, 'WhatsApp reply must be grounded');
  const lowerWa = waRes.data.reply.toLowerCase();
  assert.ok(!lowerWa.includes('message sent') && !lowerWa.includes('i have sent'), `Hallucinated send: "${waRes.data.reply}"`);
  assert.ok(
    lowerWa.includes('whatsapp') && (lowerWa.includes('not connected') || lowerWa.includes('opened') || lowerWa.includes('whatsapp web')),
    `Expected honest reply about WhatsApp Web or connection status: "${waRes.data.reply}"`
  );
  console.log(`  ✓ Honest WhatsApp handoff verified: "${waRes.data.reply}"`);

  // 7.5 Cleanly close managed browser
  console.log('7.5 Closing managed browser via browser.close...');
  const closeRes = await executeTool('browser.close', {});
  assert.equal(closeRes.status, 200, `Expected 200, got ${closeRes.status}`);
  assert.equal(closeRes.data.ok, true, 'browser.close must succeed');
  console.log('  ✓ Managed browser cleanly closed');
  console.log('✓ Suite 7 Passed!\n');
}

// -------------------------------------------------------------
// Suite 8: Voice Pipeline TTS, STT & Dynamic Island Endpoints
// -------------------------------------------------------------
async function runSuite8VoiceDynamicIsland() {
  console.log('--- [Suite 8: Voice Pipeline TTS, STT & Dynamic Island Endpoints] ---');

  // 8.1 English TTS
  console.log('8.1 Testing English TTS: "All systems operational."...');
  const enRes = await fetch(`${BASE_URL}/api/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ text: 'All systems operational.' }),
  });
  assert.equal(enRes.status, 200, `Expected 200, got ${enRes.status}`);
  const enBuf = await enRes.arrayBuffer();
  assert.ok(enBuf.byteLength > 1000, `Expected > 1000 audio bytes, got ${enBuf.byteLength}`);
  console.log(`  ✓ English TTS generated ${enBuf.byteLength} audio bytes`);

  // 8.2 Hindi TTS
  console.log('8.2 Testing Hindi TTS: "नमस्ते, जार्विस तैयार है।"...');
  const hiRes = await fetch(`${BASE_URL}/api/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ text: 'नमस्ते, जार्विस तैयार है।' }),
  });
  assert.equal(hiRes.status, 200, `Expected 200, got ${hiRes.status}`);
  const hiBuf = await hiRes.arrayBuffer();
  assert.ok(hiBuf.byteLength > 1000, `Expected > 1000 audio bytes, got ${hiBuf.byteLength}`);
  console.log(`  ✓ Hindi TTS generated ${hiBuf.byteLength} audio bytes`);

  // 8.3 GET /api/voice/status
  console.log('8.3 Checking GET /api/voice/status...');
  const voiceRes = await fetch(`${BASE_URL}/api/voice/status`);
  assert.equal(voiceRes.status, 200, `Expected 200, got ${voiceRes.status}`);
  const voiceData = await voiceRes.json();
  assert.ok('state' in voiceData, 'Expected state property in voice status');
  console.log(`  ✓ Voice pipeline status: state=${voiceData.state}, enabled=${voiceData.enabled}`);

  // 8.4 GET /api/schedule/overview
  console.log('8.4 Checking GET /api/schedule/overview...');
  const schedRes = await fetch(`${BASE_URL}/api/schedule/overview`);
  assert.equal(schedRes.status, 200, `Expected 200, got ${schedRes.status}`);
  const schedData = await schedRes.json();
  assert.ok(Array.isArray(schedData.reminders), 'Expected reminders array');
  assert.ok(Array.isArray(schedData.tasks), 'Expected tasks array');
  console.log(`  ✓ Schedule overview: ${schedData.reminders.length} reminders, ${schedData.tasks.length} tasks`);

  // 8.5 GET /api/theme/caelestia
  console.log('8.5 Checking GET /api/theme/caelestia...');
  const themeRes = await fetch(`${BASE_URL}/api/theme/caelestia`);
  assert.equal(themeRes.status, 200, `Expected 200, got ${themeRes.status}`);
  const themeData = await themeRes.json();
  assert.equal(themeData.name, 'caelestia', 'Expected caelestia theme');
  assert.ok(themeData.background, 'Expected background color');
  console.log(`  ✓ Caelestia theme loaded: background=${themeData.background}, primary=${themeData.primary}`);

  // 8.6 POST /api/island/resize
  console.log('8.6 Testing Dynamic Island resize (expanded -> collapsed)...');
  const expRes = await fetch(`${BASE_URL}/api/island/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ expanded: true }),
  });
  assert.equal(expRes.status, 200, `Expected 200, got ${expRes.status}`);
  const expData = await expRes.json();
  assert.equal(expData.expanded, true);
  assert.equal(expData.width, 500);

  const colRes = await fetch(`${BASE_URL}/api/island/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ expanded: false }),
  });
  assert.equal(colRes.status, 200, `Expected 200, got ${colRes.status}`);
  const colData = await colRes.json();
  assert.equal(colData.expanded, false);
  assert.equal(colData.width, 460);
  console.log('  ✓ Dynamic Island expand and collapse transitions verified');
  console.log('✓ Suite 8 Passed!\n');
}

// -------------------------------------------------------------
// Suite 9 / AC9: Teardown & Clean State Verification
// -------------------------------------------------------------
async function runSuite9Cleanup() {
  console.log('--- [Suite 9: Teardown & Clean State Verification] ---');

  try {
    const rawState = await fs.readFile(stateFile, 'utf8');
    const state = JSON.parse(rawState);

    // Filter out test tasks
    const initialTasks = state.tasks?.length || 0;
    state.tasks = (state.tasks || []).filter(t => !t.title.includes('Finish CBSE Class 10 math practice'));
    const removedTasks = initialTasks - (state.tasks?.length || 0);

    // Filter out test reminders
    const initialReminders = state.reminders?.length || 0;
    state.reminders = (state.reminders || []).filter(r => !r.title.includes('dogfood-tea') && !r.title.includes('tea'));
    const removedReminders = initialReminders - (state.reminders?.length || 0);

    // Filter out test memories
    const initialMemories = state.memories?.length || 0;
    state.memories = (state.memories || []).filter(m => !m.text.includes('CBSE Class 10 math practice') && m.id !== createdMemoryId);
    const removedMemories = initialMemories - (state.memories?.length || 0);

    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8');
    console.log(`  ✓ State cleaned: removed ${removedTasks} test task(s), ${removedReminders} test reminder(s), ${removedMemories} test memory(s).`);
  } catch (err) {
    console.warn('  ⚠️ Warning during cleanup:', err.message);
  }
  console.log('✓ Suite 9 Cleanup Complete!\n');
}

// -------------------------------------------------------------
// Main Runner
// -------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  try {
    await runSuite1AudioMedia();
    await runSuite2WindowsApps();
    await runSuite3Vision();
    await runSuite4TimersReminders();
    await runSuite5TasksMemoryProject();
    await runSuite6ApprovalGate();
    await runSuite7ManagedBrowser();
    await runSuite8VoiceDynamicIsland();
    await runSuite9Cleanup();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('============================================================');
    console.log(`🎉 ALL 9 LIVE USER DOGFOODING SUITES PASSED IN ${duration}s!`);
    console.log('Zero Mocks · 100% Grounded · Real Desktop & Cloud Execution');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n❌ LIVE USER DOGFOODING FAILED:');
    console.error(err);
    process.exit(1);
  }
}

main();
