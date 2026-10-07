#!/usr/bin/env bash
set -e

# JARVIS Voice Subsystem Setup
# Downloads missing models and sets up binaries for local voice processing.
# All downloads are well under the 500MB limit.

DATA_DIR=".cache/voice"
BIN_DIR="bin"
mkdir -p "$DATA_DIR"
mkdir -p "$BIN_DIR"

WHISPER_MODEL="$DATA_DIR/whisper-tiny.en.bin"
PIPER_MODEL="$DATA_DIR/piper-voice.onnx"
WAKE_MODEL="$DATA_DIR/hey_jarvis.onnx"

echo "Checking STT (Whisper)..."
if [ ! -f "$WHISPER_MODEL" ]; then
    echo "Downloading Whisper tiny.en model (~75MB)..."
    curl -L -o "$WHISPER_MODEL" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
else
    echo "Whisper model found."
fi

echo "Checking TTS (Piper)..."
if [ ! -f "$PIPER_MODEL" ]; then
    echo "Downloading Piper voice model (~20MB)..."
    # Using a generic public domain Piper model (en_US-lessac-low)
    curl -L -o "$PIPER_MODEL" "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx"
    curl -L -o "$PIPER_MODEL.json" "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json"
else
    echo "Piper model found."
fi

echo "Checking Wake Word (openWakeWord)..."
if [ ! -f "$WAKE_MODEL" ]; then
    echo "Downloading openWakeWord hey_jarvis model (<5MB)..."
    # Note: Using standard openWakeWord model path. License is Apache 2.0.
    curl -L -o "$WAKE_MODEL" "https://github.com/dscripka/openWakeWord/raw/main/openwakeword/resources/models/hey_jarvis_v0.1.onnx"
else
    echo "Wake word model found."
fi

# Ensure bin directory has placeholder executable scripts for the engines if they don't exist
# In a real system, the user would compile whisper.cpp and download piper binaries.
if [ ! -f "$BIN_DIR/whisper" ]; then
    echo "Creating stub for whisper (please compile whisper.cpp and place binary here)"
    echo '#!/bin/sh' > "$BIN_DIR/whisper"
    echo 'echo "STUB WHISPER RUNNING"' >> "$BIN_DIR/whisper"
    chmod +x "$BIN_DIR/whisper"
fi

if [ ! -f "$BIN_DIR/piper" ]; then
    echo "Creating stub for piper (please download piper executable and place here)"
    echo '#!/bin/sh' > "$BIN_DIR/piper"
    echo 'cat > /dev/null' >> "$BIN_DIR/piper"
    chmod +x "$BIN_DIR/piper"
fi

echo "Voice setup complete."
