# Voice Architecture Decision Record

## Context & Requirements
Phase 3 requires a hands-free voice feature that is local, zero-spend, safe, and honestly verified. 
- Wake word, Speech-to-Text (STT), and Text-to-Speech (TTS) must all be processed locally.
- Must support push-to-talk as a fallback.
- Linux first (PipeWire or PulseAudio), keeping the capture layer abstract for Windows later.
- Cannot rely on paid or cloud speech services.
- No audio stored or logged by default.

## Inventory of Existing Voice Code
- `src/components/WorkspaceViews.jsx`, `src/styles/`: Contain frontend configuration and styling for voice providers (ElevenLabs, Fish Audio, Browser Speech, Groq).
- `server/tts.js`: Existing server logic to synthesize speech or transcribe audio, but currently relies on external APIs (Groq, ElevenLabs, Fish Audio, or browser).
- `server/hud.py`: A simple Tkinter HUD that can emit a `voice_listen` event on double-click, but performs no actual audio processing.

## Options Considered

### Architecture 1: Browser Capture & Web Speech API
- **Capture:** `MediaRecorder` in the browser, streaming chunks via WebSocket to the backend.
- **Processing:** Web Speech API for STT and TTS in the browser, or local backend processing.
- **Pros:** No native OS audio dependencies. Works across OSs trivially.
- **Cons:** Web Speech recognition API is not consistently supported (e.g., Firefox lacks standard implementation without cloud integration). Streaming raw audio via WebSocket adds latency and complexity. Running a wake word model continuously in the browser Tab requires AudioContext and potentially high CPU usage in the renderer process.

### Architecture 2: Server-Side OS Capture (Selected)
- **Capture:** Native OS audio stack (PipeWire/PulseAudio via CLI tools like `arecord`/`sox` or lightweight Node bindings).
- **Processing:** Wake word, STT, and TTS engines run entirely on the backend server.
- **Pros:** 
  - Reliable execution regardless of frontend browser capabilities.
  - Complete control over privacy (no cloud fallback by accident).
  - Can run continuously without a browser window being active or focused.
- **Cons:** Requires OS-specific capture abstraction (e.g., handling Linux PipeWire vs Windows WASAPI).

## Component Selections (Local, Zero-Spend)
- **Wake Word:** A lightweight local ONNX wake word model.
- **STT (Speech-to-Text):** Whisper.cpp or a local ONNX-based whisper model (e.g., whisper-tiny). This ensures entirely local, zero-spend transcription.
- **TTS (Text-to-Speech):** Piper or Kokoro. Both are extremely lightweight, local TTS engines capable of running fast on CPU.

## Decision
We will proceed with **Architecture 2 (Server-Side OS Capture)**.
All voice processing will be handled natively by the backend to ensure zero-spend, local, and privacy-respecting voice capabilities without depending on unpredictable browser features. The pipeline will be constructed with modular provider interfaces (WP3) so that we can swap implementations and write tests using WAV fixtures.
- **VAD (Voice Activity Detection):** Start with an energy-based baseline for simplicity and zero dependencies, moving to a lightweight model (like Silero VAD) if noise robustness requires it.
