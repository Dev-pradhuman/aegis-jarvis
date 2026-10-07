# WP0 Phase 3 Close-out Audit

## a) Flaky Tests & STT Mock Investigation
- **Command Run:** `for i in {1..10}; do echo "Run $i"; npm test || break; done`
- **Result:** Successfully ran 10 times (242 tests passed). No flaky tests observed.
- **Investigation of `tests/voice-routes.test.mjs`:** The mock STT provider artificially delays resolution using a `setTimeout` of 10ms (`sttProvider: { transcribe: async () => new Promise(resolve => setTimeout(() => resolve('hello'), 10)) }`). This guarantees that the voice pipeline stays in the `transcribing` state long enough for the asynchronous test assertions (e.g., `assert.strictEqual(pipeline.state, 'transcribing')`) to execute synchronously before the STT promise resolves and transitions the state to `thinking`. No test assertions were weakened or removed; strict state transition tracking is preserved.

## b) Honesty Check: Real Engine Installs
Based on `docs/voice-status.md` and `docs/PHASE3_REPORT.md`:
- **STT (Whisper.cpp):** Real binary is not installed; it has never run for real.
- **TTS (Piper):** Real binary is not installed; it has never run for real.
- **Wake Word:** Real engine is not installed; it has never run for real. A fake string heuristic is being used in the production configuration fallback.
- **VAD:** Real engine is not installed; it has never run for real. Only a mock is injected in tests.
- **Task Logs Check:** Checked the artifact `.system_generated/tasks/` directory. No failed background tasks from previous execution were found.

## c) Voice Approval Policy
- **Code References for High-Risk Tools:** In `server/toolExecutor.js`, high-risk tools like `computer.keypress`, `computer.type`, `command.execute`, and file-mutation tools (`composio.execute` when not READ_ONLY) mandate `requireExactApproval(toolId, input, context.approval, context.runId)`. This logic strictly requires an approval token (`approvalId`) generated through explicit UI confirmation. Thus, voice cannot autonomously bypass these requirements.
- **Spoken Confirmation for Low-Risk Tools:** In `server/routes/chat.js`, tools marked with `sideEffects` trigger spoken confirmation: `await ctx.voicePipeline.confirm("Are you sure you want to execute ${tool.name}?")`. As seen in `server/voicePipeline.js` (line 162), `confirm()` correctly requires the user to speak an exact phrase (`"yes"` or `"no"`) and imposes a strict 10-second timeout (`setTimeout(..., 10000)`).

## d) Push-to-Talk (PTT) Key Binding
Checked `src/components/GlobalVoice.jsx`.
- **Dedicated Key Combo:** It uses a global key listener for the `Shift` key (`e.key === 'Shift'`).
- **Key-Repeat Protection:** The listener prevents event spam by checking `!e.repeat` and tracking an `isShiftDown` boolean state.
- **Input Focus Protection:** PTT correctly ignores input when the user is typing by checking: `if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;`.

## e) Existence Checks (Exact Output)
- **Command Run:** `ls -la docs/VOICE_CHECKLIST.md scripts/verify-voice.mjs docs/voice-setup.md docs/voice-models.md 2>&1 || true; grep '"verify:voice"' package.json 2>&1 || true`
- **Output:**
```
-rw-r--r-- 1 pradhuman pradhuman 2744 Oct  7 08:29 docs/VOICE_CHECKLIST.md
-rw-r--r-- 1 pradhuman pradhuman  541 Oct  7 08:07 docs/voice-models.md
-rw-r--r-- 1 pradhuman pradhuman  851 Oct  7 08:06 docs/voice-setup.md
-rwxr-xr-x 1 pradhuman pradhuman 4116 Oct  7 08:23 scripts/verify-voice.mjs
    "verify:voice": "node scripts/verify-voice.mjs"
```

## f) Hardware Kill Switch Test
The kill switch termination behavior is verified in `tests/voice-safety.test.mjs` with the following test snippet:
```javascript
  await t.test('kill() instantly drops capture stream and stops TTS', () => {
    const audioSource = new FakeAudioSource();
    const ttsProvider = new FakeTTSProvider();
    const vadProvider = new FakeVADProvider();
    
    const pipeline = new VoicePipeline({ audioSource, ttsProvider, vadProvider });
    pipeline.state = 'wake_listening'; // some active state
    
    pipeline.kill();
    
    assert.strictEqual(pipeline.state, 'idle');
    assert.strictEqual(ttsProvider.stopped, true);
    assert.strictEqual(audioSource.stopped, true);
  });
```
