# Voice Live Verification Checklist

This checklist is for manually verifying the Voice Pipeline end-to-end. Since real audio capture and playback cannot be safely run in automated CI environments without dedicated hardware, this verification must be executed by a human user with a microphone and speakers.

## Prerequisites
1. Ensure you have run `npm run verify:voice`.
2. Ensure your microphone is correctly set as the default system input.
3. Ensure your speakers are turned on and the volume is audible.
4. **Push-to-Talk (Primary Path):** Default shortcut is `Ctrl+Space`.
   - **Warning:** `Ctrl+Space` conflicts with input-method editor (IME) switching on many Linux/Windows desktops. If so, configure `localStorage.setItem('jarvis_ptt_key', 'Alt+Space')`.
5. **Wake Word Status:** Real wake word engine is currently `NOT_IMPLEMENTED`. Tests 1-3 apply when an opt-in wake model is loaded; otherwise Push-to-Talk is the verified path.

## Test 1: Basic Wake Word Detection
- **Setup**: Start the pipeline in idle mode.
- **Action**: Speak the wake word ("Hey Jarvis") at a normal conversational volume.
- **Expected Result**: The UI microphone indicator should immediately turn **red** (capturing), and you may hear a brief confirmation tone.
- **Status**: [ ] Pass / [ ] Fail

## Test 2: Noise Immunity
- **Setup**: Play background music, a podcast, or a video with spoken words in the same room at a moderate volume.
- **Action**: Wait 20 minutes without speaking the wake word.
- **Expected Result**: The system should NOT falsely trigger. The UI indicator must remain idle.
- **Status**: [ ] Pass / [ ] Fail

## Test 3: Echo Cancellation / Barge-in
- **Setup**: Ask Jarvis a question that prompts a long spoken response (e.g., "Tell me a long story about space").
- **Action**: While Jarvis is speaking the response, say the wake word again loudly ("Hey Jarvis").
- **Expected Result**: The TTS playback should instantly stop (barge-in), and the system should begin capturing your next command.
- **Status**: [ ] Pass / [ ] Fail

## Test 4: Hardware Kill Switch
- **Setup**: Speak the wake word to enter `capturing` state.
- **Action**: Immediately trigger the `/api/voice/kill` endpoint (via the UI mute/kill button or a manual API call).
- **Expected Result**: The capture stream should drop instantly, the UI should return to idle, and any in-progress TTS should abruptly halt.
- **Status**: [ ] Pass / [ ] Fail

## Test 5: End-to-End Latency Check
- **Setup**: Start the pipeline in idle mode.
- **Action**: Speak the wake word, then ask "What time is it?".
- **Expected Result**: 
  - The pipeline should transition: `idle -> wake_listening -> capturing -> transcribing -> thinking -> speaking -> idle`.
  - The time from when you stop speaking to when the first audio plays back (p50/p95 latency) should be printed or observed to be reasonably fast (ideally < 2 seconds).
- **Status**: [ ] Pass / [ ] Fail

---
**Evidence Logging:**
After completing these tests, log the results, date, and any observed latencies in `docs/evidence/` (e.g., `docs/evidence/voice-live-test-YYYY-MM-DD.json`) to justify upgrading any `WORKING_TESTED` features to `WORKING_LIVE`.
