# Voice System Honesty Report (Part A Baseline)

| Component | Real binary/model installed? | Ever run for real? | Fakes outside tests? | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STT (Whisper.cpp)** | No (missing from `bin/whisper` & `server/data/`) | never run for real | No, fails cleanly when missing | `WORKING_TESTED` |
| **TTS (Piper)** | No (missing from `bin/piper` & `server/data/`) | never run for real | No, fails cleanly when missing | `WORKING_TESTED` |
| **Wake Word** | No | never run for real | **Yes** (string heuristic used in prod provider fallback) | `WORKING_TESTED` (needs fixing in WP7) |
| **VAD** | No | never run for real | None currently implemented in prod, only mock injected in tests | `NOT_IMPLEMENTED` |

## Corrective Actions (WP7)
- The fake string heuristic inside `WakeWordProvider` must be removed from production configuration and kept strictly in tests.
- Real engines must be defined and properly installed via `scripts/voice-setup.sh`.
