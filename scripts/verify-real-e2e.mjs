#!/usr/bin/env node
import assert from 'node:assert/strict';

const BASE_URL = process.env.JARVIS_URL || 'http://127.0.0.1:8787';

console.log(`[verify-real-e2e] Running live zero-mock verification against daemon at ${BASE_URL}...`);

async function testHealthAndCapabilities() {
  console.log('[1/5] Checking GET /api/health and GET /api/capabilities/status...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.equal(healthRes.status, 200, `Health endpoint returned status ${healthRes.status}`);
  const healthData = await healthRes.json();
  assert.equal(healthData.ok, true, 'Health payload ok field must be true');
  assert.equal(healthData.service, 'jarvis', 'Service must be jarvis');
  console.log(`  ✓ GET /api/health: HTTP 200 (uptime: ${healthData.uptimeSeconds}s)`);

  const capRes = await fetch(`${BASE_URL}/api/capabilities/status`);
  assert.equal(capRes.status, 200, `Capabilities status returned status ${capRes.status}`);
  const capData = await capRes.json();
  assert.ok(Array.isArray(capData.status), 'Capabilities status must be an array');
  assert.ok(capData.status.length > 10, 'Expected > 10 capability entries');
  console.log(`  ✓ GET /api/capabilities/status: HTTP 200 (${capData.status.length} capabilities reported)`);
}

async function chatRequest(message) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
    },
    body: JSON.stringify({ message }),
  });
  return res;
}

async function testAntiHallucinationWhatsApp() {
  console.log('[2/5] Testing anti-hallucination guardrail on WhatsApp request...');
  const res = await chatRequest('can u message arjun on whatsapp that hey bro hows it');
  assert.equal(res.status, 200, `Chat returned status ${res.status}`);
  const data = await res.json();
  assert.ok(data.reply, 'Expected non-empty reply');
  assert.equal(data.grounded, true, 'Expected grounded reply');

  // Verify that it does NOT claim to have sent the message
  const lowerReply = data.reply.toLowerCase();
  const hallucinatedSuccess = lowerReply.includes('message sent') ||
                              lowerReply.includes('i have sent') ||
                              lowerReply.includes('sent your message') ||
                              lowerReply.includes('sent the message');
  assert.ok(!hallucinatedSuccess, `Daemon hallucinated message sending: "${data.reply}"`);

  // Verify that it explains direct WhatsApp is not connected and opened WhatsApp Web
  const explainsWeb = lowerReply.includes('whatsapp') &&
                      (lowerReply.includes('not connected') || lowerReply.includes('opened') || lowerReply.includes('whatsapp web'));
  assert.ok(explainsWeb, `Expected honest reply about WhatsApp Web or connection status: "${data.reply}"`);
  console.log(`  ✓ WhatsApp message anti-hallucination verified: "${data.reply}"`);
}

async function testSystemVolume() {
  console.log('[3/5] Testing read of real PipeWire/PulseAudio system volume...');
  const res = await chatRequest('what is the system volume');
  assert.equal(res.status, 200, `Chat returned status ${res.status}`);
  const data = await res.json();
  assert.ok(data.reply, 'Expected non-empty reply');
  assert.equal(data.grounded, true, 'Expected grounded reply');
  assert.match(data.reply, /system volume is \d+ percent/i, `Expected volume percent in reply: "${data.reply}"`);
  assert.equal(data.route?.capability, 'audio.get_volume');
  console.log(`  ✓ Real system volume verified: "${data.reply}"`);
}

async function testActiveWindow() {
  console.log('[4/5] Testing read of real Hyprland active window...');
  const res = await chatRequest('what is the active window');
  assert.equal(res.status, 200, `Chat returned status ${res.status}`);
  const data = await res.json();
  assert.ok(data.reply, 'Expected non-empty reply');
  assert.equal(data.grounded, true, 'Expected grounded reply');
  assert.match(data.reply, /get_active:/i, `Expected active window reply: "${data.reply}"`);
  assert.equal(data.route?.capability, 'windows.get_active');
  console.log(`  ✓ Real active window verified: "${data.reply}"`);
}

async function testAppAndBrowserOpen() {
  console.log('[5/5] Testing app opening and headed browser launch on Hyprland...');
  // Test opening Brave browser
  const braveRes = await chatRequest('can you open brave browser');
  assert.equal(braveRes.status, 200, `Brave launch returned status ${braveRes.status}`);
  const braveData = await braveRes.json();
  assert.ok(braveData.reply, 'Expected reply for Brave launch');
  assert.doesNotMatch(braveData.reply, /Missing X server or \$DISPLAY/i);
  assert.doesNotMatch(braveData.reply, /Window opening could not be verified/i);
  assert.match(braveData.reply, /Brave is (open|focused)/i);
  console.log(`  ✓ Brave app launch verified on Hyprland: "${braveData.reply}"`);

  // Test opening Instagram website (headed browser handoff)
  const instaRes = await chatRequest('open instagram');
  assert.equal(instaRes.status, 200, `Instagram launch returned status ${instaRes.status}`);
  const instaData = await instaRes.json();
  assert.ok(instaData.reply, 'Expected reply for Instagram launch');
  assert.doesNotMatch(instaData.reply, /Missing X server or \$DISPLAY/i);
  assert.doesNotMatch(instaData.reply, /Window opening could not be verified/i);
  assert.match(instaData.reply, /Opened Instagram in browser/i);
  console.log(`  ✓ Headed Instagram launch verified on Hyprland: "${instaData.reply}"`);
}

async function main() {
  try {
    await testHealthAndCapabilities();
    await testAntiHallucinationWhatsApp();
    await testSystemVolume();
    await testActiveWindow();
    await testAppAndBrowserOpen();
    console.log('\n============================================================');
    console.log('🎉 ALL 5 LIVE ZERO-MOCK END-TO-END VERIFICATION CHECKS PASSED!');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n❌ LIVE VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

main();
