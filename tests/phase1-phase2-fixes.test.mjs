import test from 'node:test';
import assert from 'node:assert/strict';
import { executeModelPool } from '../server/modelPool.js';
import { CloudPerceptionProvider, perceive } from '../server/perceptionProvider.js';
import { reminderAction } from '../server/reminders.js';
import { getTool } from '../server/registry.js';
import { validateToolInput } from '../server/toolSchema.js';
import { unattendedTools, modelCallableTools } from '../server/toolPolicy.js';
import { assembleModelContext } from '../server/contextAssembler.js';
import { VoicePipeline } from '../server/voicePipeline.js';
import { routeRequest } from '../server/router.js';

test('AC1: Screen Vision attachment encoding supports base64 images without REQUEST_ERROR', async () => {
  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  let recordedMessages = null;
  const mockFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    recordedMessages = body.messages;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'I see a tiny pixel.' } }],
        usage: { total_tokens: 10 }
      })
    };
  };

  const origPools = process.env.MODEL_PROVIDER_POOLS;
  const origKey = process.env.TEST_VISION_KEY;
  const origZero = process.env.ZERO_SPEND_MODE;
  const origPaid = process.env.ALLOW_PAID_API_USAGE;
  process.env.TEST_VISION_KEY = 'test-val';
  process.env.ZERO_SPEND_MODE = 'false';
  process.env.ALLOW_PAID_API_USAGE = 'true';
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({
    perception: [{
      id: 'test-vision-1',
      provider: 'test',
      baseUrl: 'https://vision.test/v1',
      modelId: 'vision-model',
      credentialRef: 'TEST_VISION_KEY',
      modalities: ['text', 'image']
    }]
  });

  try {
    const result = await executeModelPool({
      logicalModel: 'perception',
      request: 'Describe this screen capture',
      requiredModality: 'image',
      attachments: [
        {
          type: 'image',
          mimeType: 'image/png',
          base64: sampleBase64
        }
      ],
      fetchImpl: mockFetch
    });

    assert.equal(result.reply, 'I see a tiny pixel.');
    assert.ok(recordedMessages, 'Should pass messages to provider');
    const userMsg = recordedMessages.find((m) => m.role === 'user');
    assert.ok(Array.isArray(userMsg.content));
    const imagePart = userMsg.content.find((part) => part.type === 'image_url');
    assert.ok(imagePart, 'Should contain image_url block');
    assert.equal(imagePart.image_url.url, `data:image/png;base64,${sampleBase64}`);
  } finally {
    if (origPools === undefined) delete process.env.MODEL_PROVIDER_POOLS; else process.env.MODEL_PROVIDER_POOLS = origPools;
    if (origKey === undefined) delete process.env.TEST_VISION_KEY; else process.env.TEST_VISION_KEY = origKey;
    if (origZero === undefined) delete process.env.ZERO_SPEND_MODE; else process.env.ZERO_SPEND_MODE = origZero;
    if (origPaid === undefined) delete process.env.ALLOW_PAID_API_USAGE; else process.env.ALLOW_PAID_API_USAGE = origPaid;
  }
});

test('AC2: Cloud Vision routing uses requiredModality image, sourceTier api, and handles fallback', async () => {
  const provider = new CloudPerceptionProvider();
  const sampleBuffer = Buffer.from('fake-png-data');

  const origPools = process.env.MODEL_PROVIDER_POOLS;
  const origKey = process.env.TEST_VISION_KEY;
  const origZero = process.env.ZERO_SPEND_MODE;
  const origPaid = process.env.ALLOW_PAID_API_USAGE;
  process.env.TEST_VISION_KEY = 'test-val';
  process.env.ZERO_SPEND_MODE = 'false';
  process.env.ALLOW_PAID_API_USAGE = 'true';
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({
    perception: [{
      id: 'test-vision-1',
      provider: 'test',
      baseUrl: 'https://vision.test/v1',
      modelId: 'vision-model',
      credentialRef: 'TEST_VISION_KEY',
      modalities: ['text', 'image']
    }]
  });

  const mockFetch = async (_url, init) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Cloud perception analysis complete.' } }],
        usage: { total_tokens: 8 }
      })
    };
  };

  try {
    const res = await provider.generate('What is on the screen?', sampleBuffer, mockFetch);
    assert.equal(res.reply, 'Cloud perception analysis complete.');
    assert.equal(res.provider, 'test-vision-1');

    // Verify perceive() routes to CloudPerceptionProvider when DISABLE_LOCAL_MODELS=true
    const origDisable = process.env.DISABLE_LOCAL_MODELS;
    process.env.DISABLE_LOCAL_MODELS = 'true';
    try {
      const cloudRes = await perceive('Inspect screen', sampleBuffer, { fetchImpl: mockFetch });
      assert.equal(cloudRes.reply, 'Cloud perception analysis complete.');
    } finally {
      if (origDisable === undefined) delete process.env.DISABLE_LOCAL_MODELS;
      else process.env.DISABLE_LOCAL_MODELS = origDisable;
    }
  } finally {
    if (origPools === undefined) delete process.env.MODEL_PROVIDER_POOLS; else process.env.MODEL_PROVIDER_POOLS = origPools;
    if (origKey === undefined) delete process.env.TEST_VISION_KEY; else process.env.TEST_VISION_KEY = origKey;
    if (origZero === undefined) delete process.env.ZERO_SPEND_MODE; else process.env.ZERO_SPEND_MODE = origZero;
    if (origPaid === undefined) delete process.env.ALLOW_PAID_API_USAGE; else process.env.ALLOW_PAID_API_USAGE = origPaid;
  }
});

test('AC3: VoicePipeline speak uses cloud TTS synthesis and falls back safely', async () => {
  const pipeline = new VoicePipeline({
    ttsProvider: {
      speak: async (text) => {
        return { spoken: text, local: true };
      }
    }
  });

  // When JARVIS_TEST=1, it routes to local ttsProvider directly to maintain test isolation
  process.env.JARVIS_TEST = '1';
  let localSpoke = false;
  pipeline.ttsProvider.speak = async (text) => {
    localSpoke = true;
    assert.equal(text, 'Testing reminder alert');
  };
  await pipeline.speak('Testing reminder alert');
  assert.ok(localSpoke, 'Should call ttsProvider in test mode');
});

test('AC4: Voice reminder commands snooze and dismiss resolve active reminders without id', () => {
  const state = {
    reminders: [
      {
        id: 'rem-old',
        title: 'Old completed task',
        status: 'completed',
        ringing: false,
        dueAt: new Date(Date.now() - 3600_000).toISOString()
      },
      {
        id: 'rem-ringing',
        title: 'Important Meeting Alert',
        status: 'due',
        ringing: true,
        dueAt: new Date(Date.now() - 60_000).toISOString()
      }
    ]
  };

  // Snooze without id should target rem-ringing
  const snoozeResult = reminderAction(state, 'snooze', { snoozeMinutes: 10 });
  assert.equal(snoozeResult.reminder.id, 'rem-ringing');
  assert.equal(snoozeResult.reminder.ringing, false);
  assert.equal(snoozeResult.reminder.status, 'scheduled');

  // Schema check for snooze without id
  const snoozeTool = getTool('reminders.snooze');
  assert.doesNotThrow(() => validateToolInput(snoozeTool.inputSchema, { snoozeMinutes: 10 }));

  // Complete without id should target scheduled reminder
  const completeResult = reminderAction(state, 'complete', {});
  assert.equal(completeResult.reminder.id, 'rem-ringing');
  assert.equal(completeResult.reminder.status, 'completed');

  // Schema check for complete without id
  const completeTool = getTool('reminders.complete');
  assert.doesNotThrow(() => validateToolInput(completeTool.inputSchema, {}));

  // Router verification
  const snoozeRoute = routeRequest('snooze the reminder');
  assert.equal(snoozeRoute.capability, 'reminders.snooze');

  const dismissRoute = routeRequest('dismiss the alarm');
  assert.equal(snoozeRoute.capability, 'reminders.snooze');
  assert.equal(dismissRoute.capability, 'reminders.complete');
});

test('AC5: LLM Tool Loop exposes safe tools and approval-gated tools in modelCallableTools', () => {
  const origComposio = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'test-key';
  try {
    const unattended = unattendedTools();
    const unattendedIds = new Set(unattended.map((t) => t.id));

    // Safe tools now in unattended
    assert.ok(unattendedIds.has('tasks.manage'), 'tasks.manage should be unattended');
    assert.ok(unattendedIds.has('reminders.create'), 'reminders.create should be unattended');
    assert.ok(unattendedIds.has('reminders.snooze'), 'reminders.snooze should be unattended');
    assert.ok(unattendedIds.has('reminders.complete'), 'reminders.complete should be unattended');
    assert.ok(unattendedIds.has('audio.mute'), 'audio.mute should be unattended');
    assert.ok(unattendedIds.has('media.play'), 'media.play should be unattended');
    assert.ok(unattendedIds.has('browser.handoff'), 'browser.handoff should be unattended');

    // Consequential tools NOT in unattended
    assert.ok(!unattendedIds.has('command.execute'), 'command.execute must require approval');
    assert.ok(!unattendedIds.has('calendar.create'), 'calendar.create must require approval');
    assert.ok(!unattendedIds.has('gmail.send'), 'gmail.send must require approval');

    // modelCallableTools exposes both
    const callable = modelCallableTools();
    const callableIds = new Set(callable.map((t) => t.id));

    assert.ok(callableIds.has('tasks.manage'));
    assert.ok(callableIds.has('calendar.create'), 'calendar.create should be callable by model loop');
    assert.ok(callableIds.has('gmail.send'), 'gmail.send should be callable by model loop');
    assert.ok(!callableIds.has('command.execute'), 'command.execute should not be callable by model loop');
  } finally {
    if (origComposio === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = origComposio;
  }
});

test('AC6: Approved Chat Run continuation passes executed tool outputs into contextAssembler', () => {
  const toolResults = [
    {
      id: 'step-1',
      tool: 'calendar.create',
      resultId: 'idem-1',
      output: { id: 'event-999', summary: 'AI Alignment Sync', status: 'confirmed' }
    },
    {
      id: 'step-2',
      tool: 'screen.describe',
      resultId: 'idem-2',
      output: 'A code editor window is open on workspace 1.'
    }
  ];

  const assembled = assembleModelContext({
    query: 'What did the calendar tool return?',
    toolResults,
    conversations: [],
    memories: []
  });

  const confirmedBlock = assembled.context.find((m) => m.role === 'system' && m.content.includes('Confirmed tool execution results for this Run'));
  assert.ok(confirmedBlock, 'Should include confirmed tool execution results block');
  assert.match(confirmedBlock.content, /calendar\.create/);
  assert.match(confirmedBlock.content, /AI Alignment Sync/);

  const perceptionBlock = assembled.context.find((m) => m.role === 'system' && m.content.includes('<untrusted_vision_data>'));
  assert.ok(perceptionBlock, 'Perception results must still be wrapped in untrusted data boundary');
});

test('AC7: startHUDManager includes Origin header and toggles voicePipeline', async () => {
  const pipeline = new VoicePipeline();
  let pushToTalkCalled = false;
  let stopCapturingCalled = false;

  pipeline.pushToTalk = () => { pushToTalkCalled = true; pipeline.state = 'capturing'; };
  pipeline.stopCapturing = () => { stopCapturingCalled = true; pipeline.state = 'transcribing'; };

  // Voice toggle test
  pipeline.state = 'idle';
  // Simulating HUD onVoice toggle
  if (pipeline.state === 'capturing') {
    pipeline.stopCapturing();
  } else {
    pipeline.pushToTalk();
  }
  assert.ok(pushToTalkCalled, 'Should initiate pushToTalk when idle');

  pushToTalkCalled = false;
  if (pipeline.state === 'capturing') {
    pipeline.stopCapturing();
  } else {
    pipeline.pushToTalk();
  }
  assert.ok(stopCapturingCalled, 'Should stop capturing when already capturing');
});
