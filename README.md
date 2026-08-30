# JARVIS // Command Console

A React + Vite port of the original single-file HTML console. Same visuals,
same animations, split into components and per-section CSS files.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Build

```bash
npm run build
npm run preview
```

## Structure

```
src/
  App.jsx                  # top-level layout: sidebar / topbar / main / statusbar
  main.jsx                 # React entry point + global CSS imports
  components/
    Icon.jsx                # shared icon set (nav, quick actions, tasks, approvals, statusbar)
    Sidebar.jsx              # brand emblem + nav list (click to set active)
    TopBar.jsx               # provider/model/router/usage/uptime/core status
    NeuralCore.jsx           # intel stream + central visual + thought stream + footer stats
    BrainVisualization.jsx   # procedurally generated brain-shaped node/line SVG
    Approvals.jsx            # pending approvals list
    QuickActions.jsx         # 3x3 quick action grid
    Chat.jsx                 # chat log + input, with typing indicator and auto-scroll
    Tasks.jsx                # task list with progress / pending state
    StatusBar.jsx            # footer status strip
  hooks/
    useUptime.js             # ticking DD:HH:MM:SS counter
    useWaveform.js            # animates an SVG polyline into a sparkline
  styles/
    variables.css, reset.css, typography.css, hud.css, layout.css,
    sidebar.css, topbar.css, neural-core.css, chat.css, tasks.css,
    approvals.css, quick-actions.css, metrics.css, footer.css,
    animations.css, responsive.css
```

Notes:
- `styles/metrics.css` mirrors CSS that existed in the source file but wasn't
  actually used in its markup — kept here for parity/reuse if you build a
  metrics panel later.
- All icons are stored as raw SVG path strings in `components/Icon.jsx` and
  rendered via `dangerouslySetInnerHTML`, mirroring the original's approach so
  the icon table stays in one place instead of 25 near-duplicate JSX files.
- The chat "AI reply" is a canned 1.4s-delayed response, same as the original —
  wire it up to a real backend/model call where marked in `Chat.jsx`.
# JARVIS Command Console

The console is a Vite React client for one assistant identity: JARVIS. The local service in `server/` provides the durable execution boundary for tasks, approvals, activity, capability discovery, and chat command handling.

## Run locally

From this directory:

```sh
npm install
npm run dev:server   # terminal 1, http://127.0.0.1:8787
npm run dev          # terminal 2, http://127.0.0.1:5173
```

Credentials can be entered from Settings → Environment credentials. The exact active file is:

`C:\Users\Pradhuman\projects\aegis\jarvis-console\jarvis-console\server\data\credentials.env`

It is ignored by Git and masked on subsequent API reads. Copy `.env.example` as a starting point. Numbered keys are tried in order, so `GROQ_API_KEY`, `GROQ_API_KEY_1` … `_4` and the equivalent Gemini/OpenRouter/OpenCode Zen/9router/custom variables form independent credential pools. For Slack delivery, provide `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`.

Vite proxies `/api` to the local JARVIS service. State is stored in `server/data/state.json` and can be inspected or backed up as a normal project artifact. `npm start` runs only the service; `npm test` runs the unit/integration contract checks and `npm run build` creates the production client.

## Current service boundary

- `GET /api/health`, `/api/capabilities`, `/api/tools`
- `GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/cancel`, and `POST /api/runs/:id/resume`
- `POST /api/tools/execute` for workspace inspection, bounded file reads, and approval-gated commands
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
- Local session login: `POST /api/auth/login`; set `JARVIS_AUTH_TOKEN` to require the configured token
- `GET /api/adapters` for calendar, messaging, voice, hardware, and auth readiness
- `POST /api/research/search` (uses `SEARCH_PROVIDER_URL` when configured)
- `POST /api/events` (triggers active workflows whose trigger matches `event:<type>`)

External research, messaging, calendar, and hardware adapters are registered as disabled until their provider credentials or device connection is configured. Consequential actions remain approval-gated.

Tool execution is constrained to this project directory. File reads are limited to 1 MB; shell execution accepts one executable command, rejects shell operators, has a 30-second timeout, and requires an approval record with `status: approved`.

Research, calendar, messaging, and hardware are provider adapters. Their endpoints report `needs key` or `not configured` until the corresponding environment variables and external accounts/devices exist.

## Multi-model routing

Settings exposes three JARVIS modes:

- **Normal**: Muse Spark 1.2 is the conversational agent brain; agentic/tool-heavy work can route to DeepSeek V4 Flash.
- **Coding**: Laguna S 2.1 is selected for all model-backed requests.
- **Deep Thinking**: GLM-5.2 is selected for all model-backed requests.

Manual model selection remains available and overrides the mode. In Normal mode deterministic tools still execute first. Automatic specialists include MiniMax M3 for GUI work, Nemotron 3 Nano Omni followed by MiMo V2.5 for media perception/reasoning, Laguna for repository coding, and GLM for exceptional reasoning. Same-model provider entries are exhausted before the acyclic GLM-5.2 terminal fallback is used.

Requests such as `create an image of ...` and `make a video of ...` bypass the chat model and call Gemini media generation directly. The defaults are `gemini-3.1-flash-image` for images and `veo-3.1-generate-preview` for video; both can be replaced with `GEMINI_IMAGE_MODEL` and `GEMINI_VIDEO_MODEL`. Video creation is asynchronous and returns a durable job that can be polled without restarting the chat Run.

Configure pools with the `MODEL_PROVIDER_POOLS` JSON object shown in `.env.example`. Every entry has a unique `id`, OpenAI-compatible `baseUrl`, provider-specific `modelId`, and backend environment-variable `credentialRef`. Twelve generic `MODEL_API_KEY_n` slots are available in addition to the named provider keys. Exact provider model IDs are deliberately configuration, because aliases and availability differ by provider.

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

Read-only tools can execute directly. Sends, replies, publishing, deletion, and calendar mutation return a pending approval first. The approval is bound to the exact tool, arguments, connected account, local user, and ten-minute expiry; it is consumed after a successful execution and cannot be replayed for another action. Instagram requires a Business or Creator account, and its messaging remains subject to Meta's messaging-window policies.
