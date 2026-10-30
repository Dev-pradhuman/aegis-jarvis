# JARVIS Galaxy

The console is a Vite React client for one assistant identity: JARVIS. The local service in `server/` provides the durable execution boundary for tasks, approvals, activity, capability discovery, and chat command handling.

For the factual audit report and live tool capability matrix, see [docs/REAL_AUDIT_STATUS.md](docs/REAL_AUDIT_STATUS.md). For historical development milestones, see [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

## Arch Linux + Hyprland Verified System Status

The codebase is hardened and verified end-to-end on Arch Linux with Hyprland (`v0.56.2`) under systemd user service (`aegis-jarvis.service`):

- **100% Passing Test Suite**: 367 / 367 unit and contract tests passing (`npm test`).
- **Dynamic Desktop Environment Auto-Discovery**: Runtime resolution in `server/platform/linux/env.js` dynamically detects `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `DISPLAY`, and `HYPRLAND_INSTANCE_SIGNATURE` at call time, preventing environment disconnects when `systemd --user` starts prior to Hyprland.
- **Hyprland Native Application Launching**: `apps.open` resolves desktop aliases (`brave`, `zen`, `chromium`) and dispatches via Hyprland (`hyprctl dispatch exec` with Lua fallback), verifying real window creation and focus.
- **Wayland Headed Browser Automation**: Browser engines pass `--ozone-platform-hint=auto` and Wayland flags, eliminating `Missing X server or $DISPLAY` crashes.
- **Action Grounding & Anti-Hallucination**: Non-negotiable system grounding guardrails and expanded action-keyword classifier routing guarantee that requests to send messages, open apps, or mutate system state never run without tools or falsely claim success.

### Zero-Mock Live Verification Harness

Verify the real running service against live system interfaces without mocks:

```sh
node scripts/verify-real-e2e.mjs
```

The harness runs 5 live checks against `http://127.0.0.1:8787`:
1. `GET /api/health` & `GET /api/capabilities/status` return HTTP 200.
2. WhatsApp action requests do NOT hallucinate direct message sending; direct WhatsApp is reported honestly and WhatsApp Web is opened via `browser.handoff`.
3. Reads live PipeWire/PulseAudio system volume.
4. Reads real active window from Hyprland via `hyprctl activewindow -j`.
5. Opens Brave browser and Instagram headed without display errors or unverified window warnings.


## Run locally

From this directory:

```sh
npm install
npm run dev          # starts the JARVIS service, waits for /api/health, then starts Vite
```

Open `http://127.0.0.1:5173`. Ctrl+C stops both owned processes. If a healthy JARVIS service is already running on `JARVIS_PORT` (default `8787`), the dev command reuses it. For separate terminals, use `npm run dev:server` and `npm run dev:client`. The client shows the real service state and backs off failed polling while offline.

## Galaxy frontend

The **Galaxy interface is the default** at `/`. The previous command console, including its original Overview and Brain workspace, remains available at `/legacy`; use **Return to Galaxy** in the legacy console to switch back. The Galaxy sidebar also contains a Legacy console link when expanded.

Galaxy uses the repository's bundled Three.js engine to render a 3D nucleus and three particle depth layers. Drag empty sky to orbit continuously; right drag, middle drag, or Shift+drag pans; wheel or trackpad scroll dollies in 3D. The top-right expand button enters browser fullscreen and hides the HUD after a short pause. Move to the left or bottom edge to reveal it. Esc exits, F toggles fullscreen, and H eases the camera home when the Galaxy canvas owns keyboard focus. In immersive mode, W/A/S/D and Q/E move through bounded space. Touch drag orbits; two-finger pan and pinch zoom are supported. UI controls and windows sit above the scene, so dragging windows or scrolling their contents does not move the camera.

The left rail expands with the toggle near its top. Selecting a module opens a floating window with focus, drag, resize, minimize, restore, maximize, and close controls. Home closes all windows. Chat uses the existing conversation and voice service; Settings reuses the existing provider and model configuration workspace. Runs, workflows, memory, tools, integrations, tasks, approvals, and diagnostics read existing backend APIs. Agents, research, projects, media, phone, and messaging display an explicit unconnected state until their dedicated workspace integrations are built.

The nucleus has sleeping, idle, listening, thinking, working, and speaking visual states. Chat request and voice playback events and active backend Runs drive them. The moon/sun control sleeps or wakes the Galaxy; it also sleeps after five minutes without input. During development, `/?visualPreview=1` exposes a **development-only** preview strip for all six states.

CPU and memory percentages come from `GET /api/system/metrics`, sampled on the server. GPU load is shown as unavailable because no cross-platform GPU collector is present. Requests and the selected model come from `/api/telemetry`; service status comes from `/api/health`. This avoids decorative fake percentages on the Galaxy home screen. Known demo task, approval, and workflow seeds are removed from persisted state once during migration.

See [REFERENCE_ANALYSIS.md](REFERENCE_ANALYSIS.md) for the frame-based video study that guided the visual composition.

### Galaxy rendering quality

The scene renders at device resolution up to a capped DPR and pixel budget. Its stars use a compact procedural point shader with a sharp source and short falloff; far, middle, near, and core fields move at different speeds. The Brain uses a deforming 3D energy shell, a compact white nucleus, separate blue halos, and restrained bloom on hardware renderers. Software WebGL renderers skip the costly bloom pass while retaining native-size scene rendering. The six visual states remain available through the development preview described above.

### Managed browser

JARVIS browser automation runs through the canonical `/api/tools/execute` route and one `BrowserManager`. Direct tool requests now create a persisted Run and step. If an action needs approval, approve its ID through `POST /api/approvals/:id`; the saved exact action continues in the same Run automatically. Supply an `idempotencyKey` for safe replay. Generic `browser.navigate`, `browser.click`, `browser.type`, `browser.read`, `browser.content`, `browser.accessibility`, `browser.wait`, and `browser.screenshot` tools use Lightpanda first for ordinary pages. Screenshots or requested visual interactions use Playwright Firefox. Transient Lightpanda failures retry once; unsupported interactions fall back to Firefox with the URL and safe form fields restored where possible. The existing chat command that opens a URL in the user's normal browser remains available as a direct user-facing launcher.

Local one-time reminders are available from Galaxy → Reminders or deterministic chat commands such as `Remind me in 2 minutes to test the reminder` and `Remind me at 7 PM to revise physics`. They use canonical `reminders.*` tools and host-local persistence. The scheduler claims a due reminder once before attempting a Linux desktop notification; the due card remains in Galaxy until completed, snoozed, cancelled, or dismissed in that window. The host service must be running for timely delivery. Recurring schedules and voice announcements are not yet available.

`GET /api/browser/status` reports the live engine, page, state, and recent fallback events. The Galaxy Browser window displays these values, and the Home screen shows a small browser activity indicator only while an engine is active. If a page requires human verification, JARVIS opens headed Firefox, pauses the browser task, and offers **Open browser** and **Resume when done** controls in that window. It does not attempt to solve the challenge. The verification must be cleared in Firefox before resume succeeds.

The Firefox profile lives under ignored `server/data/browser/firefox-profile/`. `BROWSER_PRIMARY=lightpanda`, `BROWSER_MAX_RETRIES=1`, and `BROWSER_IDLE_TIMEOUT_MS=120000` are optional configuration values; `BROWSER_FIREFOX_PROFILE` can change the profile location. Firefox shuts down after its idle timeout and restores the last page when the task continues. Lightpanda's Linux binary is downloaded by `@lightpanda/browser` into the user's cache on first use. Playwright Firefox needs `npx playwright install firefox` after a fresh dependency install. On Windows, where native Lightpanda is unavailable, the manager starts Firefox directly. [Lightpanda installation guidance](https://github.com/lightpanda-io/docs/blob/main/src/content/quickstart.mdx) and [Lightpanda platform notes](https://github.com/lightpanda-io/browser/blob/main/README.md) describe the upstream runtime.

Credentials can be entered from Settings → Environment credentials. The active file is `server/data/credentials.env` relative to this checkout on both Linux and Windows. The server also reads a legacy `.env.local` file when that credentials file does not exist.

It is ignored by Git and masked on subsequent API reads. Copy `.env.example` as a starting point. Numbered keys are tried in order, so `GROQ_API_KEY`, `GROQ_API_KEY_1` … `_4` and the equivalent Gemini/OpenRouter/OpenCode Zen/9router/custom variables form independent credential pools. For Slack delivery, provide `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`.

Vite proxies `/api` to the local JARVIS service. State is stored in `server/data/state.json` and can be inspected or backed up as a normal project artifact. `npm start` runs only the service; `npm test` runs the unit/integration contract checks and `npm run build` creates the production client.

## Current service boundary

- `GET /api/health`, `/api/capabilities`, `/api/tools`
- `GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/cancel`, and `POST /api/runs/:id/resume`
- `POST /api/tools/execute` for workspace inspection, bounded file reads, application discovery/launch, and approval-gated commands
- `GET/POST/PATCH /api/tasks`
- `GET/POST /api/approvals/:id`
- `GET /api/activity`
- `POST /api/chat` (including task creation commands such as `create task: ...`)
- `GET/PATCH /api/model-routing` for Auto/manual logical-model routing, public provider-pool readiness, health, and recent routing telemetry
- `GET /api/generated/:file`, `GET /api/media/jobs/:id`, and `GET /api/media/jobs/:id/download` for Gemini image/video results
- `GET /api/composio/status`, `/api/composio/accounts`, `/api/composio/tools`, plus `POST /api/composio/connect` and `/api/composio/execute`
- `GET/POST /api/workflows`, `PATCH /api/workflows/:id`, and `POST /api/workflows/:id/run`
- `GET /api/scheduler` and `POST /api/scheduler/tick`; interval schedules run automatically while the service is online
- `GET /api/telemetry`, `/api/connections`, `/api/integrations`, `/api/diagnostics`, and `/api/permissions`
- `GET/POST /api/memory`, `GET /api/memory/search`, and `GET/POST /api/documents`
- `POST /api/memory/index` and `GET /api/memory/vector-search`
- `POST /api/mcp` JSON-RPC transport (`initialize`, `tools/list`, `tools/call`)
- Standalone MCP stdio transport: `node server/mcp-stdio.js`
- Calendar, messaging/Slack, and hardware commands: `/api/calendar/events`, `/api/messages/send`, `/api/hardware/command`
- Local session login: `POST /api/auth/login`; set `JARVIS_AUTH_TOKEN` to require the configured token. The Galaxy and legacy UI show a login screen and use a host-only HttpOnly session cookie; `GET /api/auth/status` reports whether login is needed.
- `GET /api/adapters` for calendar, messaging, voice, hardware, and auth readiness
- `POST /api/research/search` (uses `SEARCH_PROVIDER_URL` when configured)
- `POST /api/events` (triggers active workflows whose trigger matches `event:<type>`)

External research, messaging, calendar, and hardware adapters are registered as disabled until their provider credentials or device connection is configured. Consequential actions remain approval-gated.

Workspace file reads are constrained to this project directory, reject protected credential/state paths and symlink escapes, and are limited to 1 MB. Shell execution accepts one executable command, rejects shell operators, has a 30-second timeout, and requires an unexpired one-use approval bound to that exact command and Run. Desktop application launch uses the selected OS provider; Linux discovers XDG desktop entries and Windows discovers Start Menu shortcuts. `apps.list` is read-only. On KDE, `apps.open` focuses one existing matching window or launches the app and waits for a matching window; ambiguous matches fail without choosing one. Other desktops retain launcher-only behavior.

On the current KDE Wayland host, `computer.capabilities` reports real backend availability. Linux audio uses PipeWire with PulseAudio fallback, media control uses MPRIS, and clipboard uses KDE Klipper with optional Wayland/X11 fallbacks. `screen.capture` requests the full desktop through the XDG screenshot portal, which can require user consent. Linux `computer.keypress` and `computer.type` use a user-consented XDG RemoteDesktop portal session. Set both `JARVIS_AUTH_TOKEN` and `JARVIS_DESKTOP_INPUT=1` to enable input and mutating window actions. Each input requires a one-use approval and idempotency key bound to exact text/keys, Run, window ID, app ID and process ID. KWin's session API supplies `windows.list`, `windows.get_active`, `windows.find`, `windows.focus`, `windows.minimize`, `windows.maximize`, `windows.restore` and `windows.close`; close also requires approval. The runtime checks active identity after portal consent and immediately before input. It aborts with `TARGET_FOCUS_CHANGED` if another window is active. Chat supports `open ChatGPT`, `focus Firefox`, `type: text`, `type hello into Firefox`, `press Enter`, and `press Enter in Firefox`. The last focused/opened target is remembered for follow-up chat commands, then checked against the real desktop before each action. An approval clicked in the Galaxy browser may itself change focus; if so, the input safely aborts and must be retried with the intended window active. Window control is currently verified on KDE Wayland only; unsupported compositors return a structured limitation. The portal and KWin helpers require Python 3 with `dbus` and `gi` system bindings. Mouse control remains unavailable. See [CURRENT_CAPABILITIES.md](CURRENT_CAPABILITIES.md) for verified status and gaps.

See [WINDOWS_LINUX_COMPATIBILITY_AUDIT.md](WINDOWS_LINUX_COMPATIBILITY_AUDIT.md) for the current Linux session, cross-platform capability matrix, and unimplemented desktop-control work.

Research, calendar, messaging, and hardware are provider adapters. Their endpoints report `needs key` or `not configured` until the corresponding environment variables and external accounts/devices exist.

## Multi-model routing

The current automatic path is: exact deterministic command → canonical tool; ordinary conversation → local Ollama; clear complex or explicitly selected strong-AI request → authorized ChatGPT/Claude normal website through BrowserManager; unavailable web tier → compatible, currently verified zero-price API model. When appropriate, a compatible local model is the final offline fallback. CLI agents remain optional sources for explicit/manual use; **they are not the automatic headless tier**. Legacy logical-model IDs remain internally for existing routing and Run compatibility, but do not name the actual execution tier. The Brain window and Run telemetry show the selected tier.

`ZERO_SPEND_MODE=true` is the default. Paid API completions, hosted media, hosted TTS, and hosted STT are disabled unless both `ZERO_SPEND_MODE=false` and `ALLOW_PAID_API_USAGE=true` are explicitly set. Vercel AI Gateway and OpenRouter API models are eligible automatically only when their current `/models` catalog reports zero price for every published usage dimension. Unknown pricing is disabled. Monthly promotional credits are not treated as a guaranteed hard zero-spend allowance. Browser/system speech synthesis remains a no-API-cost speech fallback.

ChatGPT and Claude website access uses visible page controls in a reusable Firefox session. Open **Galaxy → Brain → Headless Web → Open session** to sign in yourself. JARVIS never reads browser cookies or bypasses human verification. Session status is `UNVERIFIED` until tested through the normal UI. The website adapter cannot currently select the strongest available model or attach media reliably, so it reports the model as unverified and routes attached media to compatible API/local sources instead. Website layout changes can make the adapter unavailable until its selectors are updated.

Configure model sources from **Galaxy → Brain** or **Legacy → Brain**. Brain sources can be API providers, local OpenAI-compatible endpoints, or supported AI CLIs. Add as many API keys as needed; saved secrets remain in the private, gitignored `server/data/brain-secrets.json`, while nonsecret source settings are in `server/data/brain-sources.json`. Both files are written with owner-only permissions. Set `JARVIS_AUTH_TOKEN` before editing Brain sources. The Brain window opens automatically when no model source is configured.

Brain's **Add provider** catalog fills in official endpoints and credential variable names. Select a provider, paste a key, and use **Test & save**; use **Add key** on its detail screen for unlimited backup credentials. **Quick setup** accepts several providers at once. The Ollama preset uses the local `qwen3:4b` model at `127.0.0.1:11434`; install Ollama and pull that model first if Brain reports that either is missing. Brain checks local inference and tool calling before marking it healthy. Cloud model selection is based on discovery followed by a minimal completion probe. Providers without a usable model listing may require choosing a model ID in source details. OpenCode CLI authentication and OpenCode Zen API credentials are separate.

Existing `.env.local`, `server/data/credentials.env`, and `MODEL_PROVIDER_POOLS` configurations still work. Their keys appear as masked, read-only imports in Brain and are not copied to the new store. `MODEL_PROVIDER_POOLS` entries must provide the exact provider model ID and backend `credentialRef`. The old numbered environment slots remain compatible; the Brain UI has no slot limit. New sources are included in the existing canonical model pool immediately after saving. Set source priority and assign one or more routing roles in Brain. AUTO uses the configured priority and compatible healthy sources; a strict source lock is available for debugging. A local endpoint without TLS must use loopback; remote model endpoints require HTTPS.

Brain connection tests use the provider's `/models` endpoint where available. A successful metadata check verifies connectivity, not inference quality or tool support. Cloud test completions also obey zero-spend eligibility. CLI detection checks executable/version only and reports authentication as unverified until an actual model request succeeds. Codex and Claude CLI text requests run with tools disabled or read-only sandboxing when manually selected; they cannot execute JARVIS tools outside the canonical runtime.

Provider health, bounded retries, cooldowns, API rotations, final-model selection, token/cost usage, and latency are persisted with each Run. A non-provider 4xx request error does not rotate credentials. Set `JARVIS_ROUTER_DEBUG=true` to return routing diagnostics in chat responses; secrets are never included.

For Slack calendar reminders and messages, configure `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`. Calendar reminders use Slack's `chat.scheduleMessage` API and require the app's `chat:write` scope. WhatsApp voice calling is intentionally not implemented as an unofficial headless browser automation; use a supported WhatsApp Business calling provider/device integration instead.

`HARDWARE_ENDPOINT` is the URL of a separate device bridge that accepts `POST { command, args }` (for example, a Raspberry Pi/ESP service). `JARVIS_AUTH_TOKEN` is an optional bearer token protecting the local API; set it in the server environment and obtain a session through `POST /api/auth/login`.

## Composio app connections

Composio is an optional integration provider for Gmail, Google Calendar, Discord, and Instagram. Existing direct Slack support remains available. Add these values to `server/data/credentials.env` or enter them in Settings:

```env
COMPOSIO_API_KEY=your_project_api_key
COMPOSIO_USER_ID=jarvis-local-user
COMPOSIO_AUTH_CONFIGS={"gmail":"ac_your_gmail_config","googlecalendar":"ac_your_calendar_config","discord":"ac_your_discord_config","discordbot":"ac_your_discord_bot_config","instagram":"ac_your_instagram_config"}
```

Create each Auth Config in the Composio dashboard, copy its ID into the JSON map, restart JARVIS, and use Settings → Composio app connections → Connect. Use `discordbot` for sending Discord channel messages; `discord` represents user-authorized account actions. Composio holds and refreshes the provider OAuth tokens; JARVIS stores only the Composio project key and Auth Config IDs.

Read-only tools can execute directly. Sends, replies, publishing, deletion, and calendar mutation return a pending approval first. The approval is bound to the exact tool, arguments, connected account, local user, Run, and ten-minute expiry; it is claimed before execution and cannot be replayed after an uncertain external outcome. Instagram requires a Business or Creator account, and its messaging remains subject to Meta's messaging-window policies.
# Phase 2 and device bridge status

The Galaxy modules now read real project, MCP, agent-run, research, media-job, phone-device, and messaging status. An empty module means there is no live integration or event; it is not simulated data.

- `JARVIS_PROJECT_ROOTS` accepts a JSON array of local paths or `{ "name", "root" }` objects. JARVIS itself is always included. `/api/projects` and the canonical `projects.status` tool inspect Git and package metadata without changing repositories.
- `JARVIS_MCP_SERVERS` accepts a JSON array of `{ "name", "url", "tokenEnv"? }`. HTTP JSON-RPC MCP servers are discovered independently at `/api/mcp/servers`. The canonical `mcp.call` tool requires an approval bound to the exact server, tool, and arguments; use `/api/tools/execute` and approve the returned approval ID through the existing approvals flow. The saved request resumes automatically. A failed server does not prevent other servers from appearing. Stdio and SSE transports are not yet supported as outbound MCP clients.
- `/api/research/plan` gathers attributable sources from the configured `SEARCH_PROVIDER_URL` and returns an explicit next-step plan. It does not claim synthesis or media generation occurred. Media jobs remain backed by the existing configured generator.
- Set a private `JARVIS_DEVICE_PAIRING_CODE` to enable `POST /api/device/pair` with `{ "deviceId", "name", "pairingCode" }`. The response contains a device bearer token once; only its SHA-256 hash is persisted. A paired companion can send `POST /api/device/events` using that token and `{ "deviceId", "type", ... }`. Supported event types are `device.status`, `call.incoming`, `call.active`, `call.ended`, and `notification.received`. `/api/device/status` shows recent events and the Phone window shows paired devices; a live incoming-call notice appears in Galaxy. `POST /api/device/revoke` invalidates a pair. This is a protocol foundation; no Android companion or actual call-control implementation is included yet.
- Keep the server bound to localhost unless a separate authenticated, encrypted transport is configured. Do not place real pairing codes or tokens in source control.
- `COMMUNICATION_SIGNATURES` is an optional JSON map such as `{ "generic": "By JARVIS on behalf of Master Pradyuman" }`. A signature is appended only when a send request explicitly sets `assistantAuthored: true` and a signature is configured for the chosen platform. No WhatsApp sender exists yet.
- Sending through `/api/messages/send` or the canonical `messages.send` tool now creates an exact-action approval when one is not supplied. Approve it through the existing approvals API, then retry with its ID. The approval is consumed before the external request, so a retry cannot silently duplicate an uncertain send.

## Safety Guidelines

**Pre-push safety note:** Always run `git diff` to ensure no `.env` credentials, API tokens, or `server/data` state files are committed before pushing to a remote repository.
