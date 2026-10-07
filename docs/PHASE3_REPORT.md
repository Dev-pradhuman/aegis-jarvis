# Phase 3 Report: Hands-Free Voice

## Orchestration Mode
Native subagents were used for this phase (coordinator, coder, tester, reviewer). Ruflo was not used due to an orchestration fallback condition encountered in earlier phases.

## Test Count
The final passing test count is **242**. This strictly adhered to the hard rule of never lowering the passing-test count (started at 211, minimum threshold was 228).

## Work Package Summary
*   **P0 (Honesty Check):** Audited STT, TTS, Wake Word, and VAD capabilities. Documented in `docs/voice-status.md`.
*   **WP2 (VAD Integration):** Abstracted Energy-based VAD for endpointing speech.
*   **WP3 (TTS Provider):** Integrated Piper TTS for local, zero-spend voice synthesis.
*   **WP4 (Wake Word Engine):** Integrated an extensible Wake Word engine (openWakeWord support) with tests using fake inputs.
*   **WP5 (TTS & Stream Chunking):** Implemented TTS barge-in logic and streaming playback chunking.
*   **WP6 (Wake Word & PTT):** Added endpoints and state management for Wake Word and Push-to-Talk (PTT).
*   **WP7 (Real Audio I/O & Wiring):** Implemented real `arecord`/`aplay` system commands behind `audioIo.js`. Updated setup scripts (`voice-setup.sh`) and documented models safely in `docs/voice-models.md`.
*   **WP8 (Voice Safety Policy):** Enforced a 10-second confirmation timeout for state-changing tools invoked by voice. Implemented hardware kill switch (`/api/voice/kill`) to instantly drop capture and playback streams. Enforced strict transcript retention rules.
*   **WP9 (UI Mapping):** Added a persistent microphone indicator (`GlobalVoice`) in the React App that supports a `Shift` key binding for Push-to-Talk.
*   **WP10 (Voice Response Style):** Injected dynamic system prompt constraints to enforce concise, markdown-free outputs for queries initiated via voice.
*   **WP11 (Live Verification Kit):** Authored `scripts/verify-voice.mjs` to simulate the full state-machine transition (`capturing -> transcribing -> thinking -> speaking -> idle`) without triggering heavy real-world I/O in the automated test suite.
*   **WP12 (Review & Reporting):** Spawned an independent reviewer subagent to verify all constraints against Part B.

## Audit & Verification (Phase 2 & Phase 3)
*   **Phase 2 Audit (WP0):** Fully audited Phase 2 constraints (SSE streaming, state migration, security, latency) in `docs/PHASE2_AUDIT.md`.
*   **Phase 3 Independent Review:** An independent subagent verified that all Phase 3 Part B code met requirements. The detailed findings are documented in `docs/PHASE3_REVIEW_PART_B.md`.

## Capabilities Requiring `USER_LIVE_TEST_REQUIRED`
Any voice capabilities that rely on actual microphone capture, system speaker playback, or a real human speaking remain tagged as `USER_LIVE_TEST_REQUIRED`. The `WORKING_TESTED` tag was used strictly for components validated by fake inputs and simulated tool spawners (e.g., automated Wake Word tests and Audio IO process mocks).

## Push Policy Confirmation
Code was committed locally in granular steps, aligned with each work package. **No code was pushed to the remote repository.** The `phase3-voice` branch contains all local commits.
