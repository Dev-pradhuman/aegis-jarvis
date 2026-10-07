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
