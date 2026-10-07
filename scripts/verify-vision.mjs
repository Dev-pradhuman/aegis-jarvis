#!/usr/bin/env node
import { describeScreen } from '../server/screenUnderstanding.js';
import { describeCamera, lockCamera, unlockCamera } from '../server/cameraUnderstanding.js';
import { perceive } from '../server/perceptionProvider.js';
import { grantScreenConsent, grantCameraConsent } from '../server/visionState.js';
import { osPlatform } from '../server/platform/index.js';
import fs from 'node:fs/promises';

console.log("=== Vision Pipeline Live Verification Kit ===");
console.log("This script will:");
console.log("1. Check perception provider status.");
console.log("2. Attempt to capture screen (requires consent).");
console.log("3. Attempt to capture camera (requires consent).");
console.log("4. Verify camera release/arbitration.\n");

// Explicitly grant consent for this script to bypass UI
grantScreenConsent(true);
grantCameraConsent();

async function runVerification() {
  console.log("--- 1. Perception Provider Check ---");
  try {
    const fixture = Buffer.from('synthetic-fixture');
    const result = await perceive('What is this?', fixture);
    console.log(`✅ Provider responded: "${result.reply}" (Model: ${result.model})`);
  } catch (err) {
    console.error(`❌ Perception provider error: ${err.message}`);
    process.exitCode = 1;
  }

  console.log("\n--- 2. Screen Capture Check ---");
  try {
    // Platform.screen.capture currently might just return a dummy path or actual path depending on implementation
    const screenRes = await describeScreen({ prompt: 'Describe this screenshot', testMode: false });
    console.log(`✅ Screen captured successfully. Timestamp: ${screenRes.timestamp}`);
    console.log(`   Description: "${screenRes.description}"`);
  } catch (err) {
    console.error(`❌ Screen capture error: ${err.message}`);
    process.exitCode = 1;
  }

  console.log("\n--- 3. Camera Capture Check ---");
  try {
    const camRes = await describeCamera({ prompt: 'Describe this camera view', testMode: false });
    console.log(`✅ Camera captured successfully. Timestamp: ${camRes.timestamp}`);
    console.log(`   Description: "${camRes.description}"`);
  } catch (err) {
    console.error(`❌ Camera capture error: ${err.message}`);
    process.exitCode = 1;
  }

  console.log("\n--- 4. Camera Arbitration Check ---");
  try {
    console.log("Locking camera...");
    lockCamera();
    try {
      // Must re-grant per-use consent
      grantCameraConsent();
      await describeCamera({ prompt: 'Should fail', testMode: false });
      console.error("❌ Camera capture succeeded while locked (should have failed)!");
      process.exitCode = 1;
    } catch (innerErr) {
      if (innerErr.message.includes('locked')) {
        console.log(`✅ Camera correctly blocked while locked: "${innerErr.message}"`);
      } else {
        throw innerErr;
      }
    }
  } catch (err) {
    console.error(`❌ Arbitration test failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    console.log("Unlocking camera...");
    unlockCamera();
  }

  if (process.exitCode === 1) {
    console.log("\n❌ Verification FAILED.");
  } else {
    console.log("\n✅ All checks passed successfully.");
  }
}

runVerification().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
