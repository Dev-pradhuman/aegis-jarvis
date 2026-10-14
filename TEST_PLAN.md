# JARVIS End-to-End QA Test Plan & Feature Checklist

**Project Path:** `/home/pradhuman/projects/aegis-jarvis`  
**Host Platform:** Linux x64 (`Hyprland`, Wayland session)  
**Execution Runtime:** Node.js v26.11.1, Python 3.14.8, Ollama (127.0.0.1:11434)  
**Test Scratch Directory:** `/tmp/jarvis-test`  

---

## 1. Environment & Credential Status

| Component / Key | Status | Notes |
| :--- | :--- | :--- |
| **Node.js** | Ready (`v26.11.1`) | Core server and frontend build runtime |
| **Python** | Ready (`v3.14.8`) | HUD manager & portal automation |
| **Ollama Local LLM** | Ready (`127.0.0.1:11434`) | Offline safeguard model (`qwen3.5:4b`) |
| **PulseAudio / PipeWire (`pactl`)** | Ready (`/usr/bin/pactl`) | Volume & mute control |
| **MPRIS Playerctl (`playerctl`)** | Ready (`/usr/bin/playerctl`) | Media player control |
| **Wayland Clipboard (`wl-copy`)** | Ready (`/usr/bin/wl-copy`) | Desktop clipboard management |
| **GROQ_API_KEY** (Pool) | Configured (5 keys) | STT (Whisper Large v3 Turbo) + Thinking cascade |
| **OPENROUTER_API_KEY** | Configured | Tier-2 Cloud thinking cascade |
| **OPENCODE_ZEN_API_KEY** | Configured | OpenCode inference endpoint |
| **ELEVENLABS_API_KEY** | Configured | Speech synthesis for EN & HI (`eleven_multilingual_v2`) |
| **FISH_AUDIO_API_KEY** | Configured | Speech synthesis (note: requires developer credits) |
| **GEMINI_API_KEY** | Not Configured | Hosted image/video generation gated |
| **COMPOSIO_API_KEY** | Not Configured | External OAuth apps gated |
| **SEARCH_PROVIDER_URL** | Not Configured | External search adapter gated |
| **MESSAGING_TOKEN / SLACK** | Not Configured | External messaging gated |
| **CALENDAR_API_URL** | Not Configured | External calendar gated |
| **HARDWARE_ENDPOINT** | Not Configured | External hardware bridge gated |

---

## 2. Feature Checklist: HTTP API Endpoints

### Core Service & Health
- [x] `GET /api/health` - Basic service health, uptime, and identity (VERIFIED)
- [x] `GET /api/system/metrics` - CPU, RAM, and load metrics (VERIFIED)
- [x] `GET /api/telemetry` - Latency, tokens, cost, and routing statistics (VERIFIED)
- [x] `GET /api/diagnostics` - Integration status & system diagnostics (VERIFIED)
- [x] `GET /api/capabilities` - List registered capability modules (VERIFIED)
- [x] `GET /api/capabilities/status` - Live capability operational readiness (VERIFIED)
- [x] `GET /api/connections` - Configured provider connection status (VERIFIED)
- [x] `GET /api/permissions` - Action permission policies (VERIFIED)
- [x] `GET /api/config` - Public non-secret environment config with masked secrets (VERIFIED)
- [x] `PATCH /api/config` - Dynamic credential and settings update (VERIFIED)

### Chat & Orchestration
- [x] `POST /api/chat` (Normal Conversation) - Multi-tier thinking cascade with Groq 120b (VERIFIED)
- [x] `POST /api/chat` (Deterministic Tool Route) - Direct command execution (VERIFIED)
- [x] `POST /api/chat` (Task Creation Command) - "create task: ..." parsing (VERIFIED)
- [x] `POST /api/chat` (Reminder Command) - "remind me in ..." parsing (VERIFIED)
- [x] `GET /api/runs` - List active and historical task runs (VERIFIED)
- [x] `GET /api/runs/:id` - Detailed status of a specific execution run (VERIFIED)
- [x] `POST /api/runs/:id/cancel` - Cancel a running execution (VERIFIED)
- [x] `POST /api/runs/:id/resume` - Resume an execution waiting on input/approval (VERIFIED)

### Tools Execution & Approvals
- [x] `GET /api/tools` - List all registered tools with schemas (VERIFIED)
- [x] `POST /api/tools/execute` (Read-only tool) - Direct execution without approval (VERIFIED)
- [x] `POST /api/tools/execute` (Consequential tool) - Creates pending approval gate (VERIFIED)
- [x] `GET /api/approvals` - List pending and resolved approvals (VERIFIED)
- [x] `POST /api/approvals/:id` (Approve) - Approve and resume exact action (VERIFIED)
- [x] `POST /api/approvals/:id` (Reject) - Reject and abort action (VERIFIED)

### Productivity (Tasks & Reminders)
- [x] `GET /api/tasks` - List persisted tasks (VERIFIED)
- [x] `POST /api/tasks` - Create a new persisted task (VERIFIED)
- [x] `PATCH /api/tasks/:id` - Update task status/title (VERIFIED)
- [x] `GET /api/reminders` - List scheduled local reminders (VERIFIED)
- [x] `GET /api/scheduler` - Scheduler status, tick interval, and last tick (VERIFIED)
- [x] `POST /api/scheduler/tick` - Manual scheduler trigger (VERIFIED)

### Voice & Speech
- [x] `GET /api/voice/status` - Voice listening pipeline status (VERIFIED)
- [x] `POST /api/voice/enable` - Start listening loop (VERIFIED)
- [x] `POST /api/voice/disable` - Stop listening loop (VERIFIED)
- [x] `POST /api/voice/mute` - Mute voice pipeline (VERIFIED)
- [x] `GET /api/voice/tts` - TTS cascade status and voice configurations (VERIFIED)
- [x] `POST /api/voice/tts` (English) - Synthesize English audio via cascade (VERIFIED)
- [x] `POST /api/voice/tts` (Hindi) - Synthesize Hindi audio via cascade (VERIFIED)
- [x] `POST /api/voice/transcribe` - Transcribe audio bytes via Groq Whisper (VERIFIED)

### Memory & Workspace Documents
- [x] `GET /api/memory` - List persisted memories (VERIFIED)
- [x] `POST /api/memory` - Store new memory record (VERIFIED)
- [x] `GET /api/memory/search` - Search memories by text/relevance (VERIFIED)
- [x] `GET /api/documents` - List ingested workspace documents (VERIFIED)
- [x] `POST /api/documents` - Ingest document content into memory (VERIFIED)

### Managed Browser
- [x] `GET /api/browser/status` - Active browser engine (Playwright Chromium) (VERIFIED)
- [x] `POST /api/tools/execute` (`browser.navigate`) - Navigate to test page (VERIFIED)
- [x] `POST /api/tools/execute` (`browser.read`) - Extract page text & links (VERIFIED)
- [x] `POST /api/tools/execute` (`browser.screenshot`) - Capture visual page snapshot (VERIFIED)
- [x] `POST /api/tools/execute` (`browser.close`) - Gracefully shut down browser (VERIFIED)

### Brain Sources & Model Routing
- [x] `GET /api/brain/sources` - List configured brain sources (VERIFIED)
- [x] `GET /api/brain/presets` - List supported provider presets (VERIFIED)
- [x] `GET /api/brain/health` - Health check across all active sources (VERIFIED)
- [x] `GET /api/model-routing` - Current routing workflow and settings (VERIFIED)
- [x] `PATCH /api/model-routing` - Update routing workflow (e.g. cascade) (VERIFIED)

---

## 3. Feature Checklist: Canonical Tools (`server/registry.js`)

### Development & Workspace Files
- [x] `project.inspect` - Read project directory metadata (VERIFIED)
- [x] `projects.status` - Git branch and package status (VERIFIED)
- [x] `files.read` (Valid file) - Read workspace file content (VERIFIED)
- [x] `files.read` (Escape path `../../etc/passwd`) - Security block test (VERIFIED)
- [x] `files.read` (Protected path `credentials.env`) - Security block test (VERIFIED)

### Productivity Tools
- [x] `tasks.list` - Fetch task records (VERIFIED)
- [x] `tasks.manage` - Create and transition task states (VERIFIED)
- [x] `reminders.list` - Fetch reminder records (VERIFIED)
- [x] `reminders.create` - Schedule a new reminder (VERIFIED)
- [x] `reminders.update` - Modify scheduled reminder (VERIFIED)
- [x] `reminders.snooze` - Reschedule reminder (VERIFIED)
- [x] `reminders.complete` - Mark reminder done (VERIFIED)
- [x] `reminders.cancel` - Remove reminder (VERIFIED)

### System & Desktop Controls
- [x] `runtime.telemetry` - Query live system statistics (VERIFIED)
- [x] `diagnostics` - Full health report (VERIFIED)
- [x] `apps.list` - Enumerate installed desktop applications (VERIFIED)
- [x] `computer.capabilities` - Query OS provider capabilities (VERIFIED)
- [x] `audio.get_volume` - Query current audio output level (VERIFIED)
- [x] `audio.set_volume` - Safely change volume and restore (VERIFIED)
- [x] `audio.mute` / `audio.unmute` - Toggle mute state (VERIFIED)
- [x] `clipboard.read` - Read current clipboard (VERIFIED)
- [x] `clipboard.write` - Write test payload to clipboard (VERIFIED)
- [x] `media.status` - Query MPRIS player status (VERIFIED)
- [x] `routine.morning_briefing` - Generate synthesized briefing (VERIFIED)

### External Gated Tools (Security & Graceful Degradation)
- [x] `command.execute` (Safe command) - Runs with approval (VERIFIED)
- [x] `command.execute` (Shell injection test) - Shell operator rejection test (VERIFIED)
- [x] `messages.send` - Gated approval check without token (VERIFIED)
- [x] `calendar.create` - Gated provider check (VERIFIED)
- [x] `media.generate` - Gated provider check without Gemini key (VERIFIED)
- [x] `composio.execute` - Gated provider check without Composio key (VERIFIED)

---

## 4. Feature Checklist: Voice & Audio Pipeline
- [x] Whisper Large v3 Turbo transcription (VERIFIED)
- [x] Whisper Large v3 fallback simulation (VERIFIED)
- [x] Multi-key rotation on Groq 429 rate limit (VERIFIED)
- [x] English TTS cascade: Fish Audio ➔ ElevenLabs ➔ Text-only (VERIFIED)
- [x] Hindi TTS cascade: ElevenLabs ➔ Fish Audio ➔ Text-only (VERIFIED)
- [x] Voice pipeline enable / disable / mute state machines (VERIFIED)
- [x] Audio playback binary integrity (MP3 headers and sample rates) (VERIFIED)

---

## 5. Feature Checklist: Cognition Cascade & Multi-Model Routing
- [x] Groq Thinking cascade (120b ➔ Llama 4 Scout ➔ 20b) (VERIFIED)
- [x] OpenRouter Cloud fallback (VERIFIED)
- [x] OpenCode Inference integration (VERIFIED)
- [x] Offline fallback to Local Ollama (`qwen3.5:4b`) (VERIFIED)
- [x] Headless browser fallback tier (VERIFIED)
- [x] Multi-turn context preservation and memory retention (VERIFIED)

---

## 6. Feature Checklist: Edge Cases & Resilience
- [x] Empty request / whitespace-only input (VERIFIED)
- [x] Excessively large payload rejection (DoS protection - 413) (VERIFIED)
- [x] Malformed JSON handling (VERIFIED)
- [x] Rapid concurrent request stress test (10 burst in 16-20ms) (VERIFIED)
- [x] Memory leak & resource burn audit (VERIFIED)
