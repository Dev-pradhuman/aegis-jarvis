# Voice Subsystem Setup

To enable hands-free local voice in JARVIS, you must download the models and ensure the engine binaries are available.

## Quick Install
Run the automated setup script to download the models:
```bash
./scripts/voice-setup.sh
```

## Manual Setup
If you prefer, you can download the models manually. See `docs/voice-models.md` for sources and checksums.

## Binaries Needed
The setup script creates stub files in `bin/` if the binaries are missing. For actual transcription and synthesis, you must:
1. Compile `whisper.cpp` and place the `main` executable at `bin/whisper`.
2. Download Piper TTS release for your OS and place `piper` at `bin/piper`.

The system uses `arecord` / `pw-record` and `aplay` / `pw-play` for audio capture and playback. Ensure these standard Linux audio tools are installed via your package manager.

## Push-to-Talk (PTT) Configuration
- **Default Key Combo:** `Ctrl+Space` (hold down to talk, release to transcribe).
- **IME / Input-Method Switching Conflict Warning:** On many Linux (ibus/fcitx), macOS, and Windows desktop configurations, `Ctrl+Space` is assigned to system-wide Input Method Editor (IME) switching.
- **Customizing Key Combo:** You can customize the shortcut by setting `localStorage.setItem('jarvis_ptt_key', 'Alt+Space')` (or `Shift+Space`, `F8`) in the browser console.

## Wake Word Status
- Local wake word engine (openWakeWord) is currently marked **`NOT_IMPLEMENTED`** in production runtime.
- Push-to-talk is the primary, safe interaction mode. Any heuristic wake word mocks are restricted to tests and never selected by production configuration.
