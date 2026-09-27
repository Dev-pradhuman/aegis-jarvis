# Aegis JARVIS development status

Updated 2026-09-27 for the public `main` branch. This is the consolidated record of work completed so far and work still missing. **WORKING_LIVE** means an acceptance path was observed against the running service/device; **WORKING_TESTED** means unit/integration coverage exists; **PARTIAL** means an important acceptance path is incomplete; **CONFIG_REQUIRED** needs an account, secret, or device; **USER_LIVE_TEST_REQUIRED** needs an authorized external interaction; **NOT_IMPLEMENTED** means the requested capability does not exist yet; **DEFERRED** is outside the current Linux scope. A mock is never live evidence. The running service exposes a conservative machine-readable snapshot at `GET /api/capabilities/status`.

## Current repair milestone (starting commit `cb22b81`, 2026-09-27)

- Baseline before edits: clean `main`, 172 tests passing, production build passing, local health responding. After edits: **190 tests passing, 0 failing**, build passing, `git diff --check` passing. This count includes 18 new tests; earlier tests were not removed.
- `POST /api/tools/execute` now creates a persisted canonical Run and step. A pending approval stores the exact normalized request, Run and step. Approving resumes that same action without a second prompt; duplicate idempotency keys replay the result. A live `node --version` action waited for approval in Run `run-1790531027279-016fdf`, then completed that Run and consumed the approval once. Deterministic chat actions now write their eventual approved/denied outcome to chat history without another user message. The focused tests cover parallel duplicate requests, workflow continuation, deny and expiry. This proves the direct tool and deterministic approval paths; **model continuation after an approved mutating tool has not been live verified**.
- Workflow approval resumes the same workflow Run and subsequent steps. Rejected/expired approvals now mark the affected step failed rather than leaving it visually waiting. Workflows are still sequential and lack full persisted DAG scheduling, cancellation of an in-flight external step, and robust restart recovery.
- Approval policy now has SAFE (default), CUSTOM scoped rules, and deliberate FULL activation. FULL requires a configured `JARVIS_AUTH_TOKEN` and a typed warning confirmation. These modes are unit/integration tested; FULL was not activated against the live machine. They govern JARVIS dialogs only and retain OS consent, exact target checks, idempotency, account authentication, CAPTCHA handoff, and zero-spend policy.
- Galaxy and legacy Approvals now use real pending records with approve/deny controls; Galaxy also displays the policy editor. Empty Tasks, Agents, Goals, Skills, Connections and related legacy views no longer use decorative sample entries as live data. Agents remains delegation history, not an autonomous AgentManager.
- Persisted local state is written atomically with `0600` file permissions; the pre-existing local state file was corrected from `0664` to `0600`. The model list no longer labels a model free by name alone or by absent pricing; only verified zero-price metadata earns that label.
- Live QA: backend `/api/health` returned HTTP 200; Galaxy loaded from Vite and showed live CPU/RAM status; its Approvals window exposed the real pending action and policy controls. A previous pending approval was left untouched during UI QA. External account actions were not sent.
- Native one-time reminders now use canonical `reminders.create/list/update/complete/snooze/cancel` tools, the existing scheduler tick, persisted due claims, desktop `notify-send` delivery attempts on Linux, and a Galaxy Reminders window. Live harmless reminders fired both through a manual scheduler tick and the automatic timer; each was accepted by desktop notifications and completed, with no duplicate claim. Recurring/cron scheduling, voice announcements, and cross-device delivery remain missing.

## Development history

| Milestone | What changed | Evidence / boundary |
| --- | --- | --- |
| Initial foundation (`8aa23d2`) | React console and local JARVIS service | Foundation, not a complete daily assistant |
| Galaxy and browser (`9c1a543`) | Default 3D Galaxy, preserved `/legacy` frontend, service orchestration, Lightpanda → Firefox BrowserManager, human handoff, device and integration foundations | Galaxy and browser UI were inspected locally; external sites vary |
| Canonical runtime (`edc70dd`, `55ec5f5`, `70baa15`) | Registry contracts, tool executor, exact approvals, idempotency, real workflow steps, model tool loop, Linux audio/media/clipboard/screenshot providers, Run telemetry | Tests cover contracts and representative integration paths; legacy direct actions remain |
| Linux input (`22e1a03`, `5aac061`) | Opt-in XDG RemoteDesktop keyboard input with exact one-use approvals | Live disposable Firefox field: exact text and Enter dispatched |
| Target-aware desktop (`da9b937`) | KDE KWin window discovery, focus, app-to-window resolution, target-bound input, focus-race abort | Live KDE Wayland focus/window QA and disposable input; other compositors unverified |
| Brain setup (`96d3bdf`, `dddcff2`) | Brain window, provider presets, unlimited stored API credentials, health/cooldown logic, Ollama `qwen3:4b` bootstrap | Local Ollama model answered a live prompt; cloud provider tests mostly use mocks |
| Current routing change | Deterministic tool → local model → authorized normal ChatGPT/Claude web UI → verified zero-price API. CLI agents are no longer the automatic headless tier. Brain status, Vercel AI Gateway preset, zero-spend guards, and interrupted-Run recovery were added. | 172 automated tests pass; web UI submission and API pricing/failover are mocked. No paid API completion was sent during QA. |

## Current verified installation

- `npm run dev` started the backend on `127.0.0.1:8787` and Vite on `127.0.0.1:5173`; `/api/health` returned HTTP 200 on 2026-09-27.
- `/api/brain` reported **ONLINE**, Ollama **MODEL_AVAILABLE**, one saved local Qwen source, **zero configured API sources**, and zero-spend mode enabled. ChatGPT and Claude web session statuses were **UNVERIFIED** after service restart. In an earlier headed-session check, ChatGPT required login; no authenticated website answer has been verified.
- `/api/workflows` returned zero saved workflows; `/api/runs` returned zero active Runs. Previously interrupted Runs are now marked failed on restart rather than shown as indefinitely active.
- A live ordinary chat request received a final Qwen answer. A deterministic `List tasks` request used the canonical tool path in about 23 ms, with no model call. Qwen's observed CPU-only answer took about 28 seconds, so local latency is still a practical limitation.
- `npm test`: **172 passed, 0 failed**. `npm run build`: passed. `git diff --check`: passed. These are local checks, not live verification of every connector.

## Capability matrix

| Area | Status | Implemented and tested | Missing / next requirement |
| --- | --- | --- | --- |
| Galaxy and legacy frontend | WORKING | Galaxy at `/`, legacy at `/legacy`; 3D core, starfield, fullscreen, 360° camera, manual controls, auto drift, state animation, floating windows; previous visual QA and current build | Continue real-GPU visual checks after graphics changes |
| Local service and auth | WORKING | Unified dev startup, health endpoint, authenticated session flow, offline backoff; local health check passed | Remote access remains disabled by default |
| Canonical tools, approvals, idempotency | PARTIAL | Registry/handler/schema contract tests, exact one-use approvals, Run binding and duplicate-action protection | Some legacy direct API actions and tool-specific output schemas still need consolidation |
| Tasks and Runs | WORKING | Durable tasks, canonical deterministic commands, Run telemetry, interrupted-Run recovery | More task scheduling and cross-device delivery are absent |
| Local reminders | WORKING_LIVE for one-time | Canonical tools, Galaxy Reminders window, persistent scheduler claim and Linux desktop notification request; live create → due → no duplicate → complete | Voice announcement, recurrence, timezone-aware cron and remote delivery remain |
| Workflows | PARTIAL | Canonical tool steps, dependencies, approval resume, observed results tested | No user workflows currently configured; cancellation during execution and richer graphs remain |
| Ollama local Brain | WORKING | `qwen3:4b` installed and live text inference verified; structured final output prevents the observed reasoning-only reply | CPU inference is slow; live model tool-continuation QA remains |
| Brain setup and provider credentials | PARTIAL | Galaxy Brain window, provider presets, backend-only masked secrets, dynamic credential arrays, health and cooldown tests | `JARVIS_AUTH_TOKEN` is needed to edit Brain config; no cloud credentials are configured here |
| Normal ChatGPT/Claude web tier | PARTIAL / CONFIGURATION REQUIRED | BrowserManager Firefox adapter uses visible UI, persistent session, login/rate-limit/handoff states; mocked visible-control submission tests pass | Sign in to authorized sessions; verify live selectors, response extraction and model choices. Highest available model selection is not implemented or verified |
| Zero-cost API tier | PARTIAL / CONFIGURATION REQUIRED | Vercel/OpenRouter catalog price checks, capability filtering, free-model and paid-model guard tests; API-key rotation remains | No API keys configured. Other providers without reliable price metadata remain disabled in automatic zero-spend mode. Provider-side hard billing caps would be needed for an absolute monetary guarantee against price changes between catalog check and use |
| CLI agents | PARTIAL | Existing optional manual Codex/Claude/OpenCode adapters remain | Explicit authentication and live request testing per CLI; not part of automatic headless routing |
| Model tool calling | PARTIAL | Native tool-call → canonical tool → model-continuation tests pass | Live provider tool-loop and approval continuation require further QA |
| BrowserManager | PARTIAL | Lightpanda primary, Firefox visual fallback, bounded recovery, idle cleanup and human handoff tests; headed Firefox opened in live check | Reliability on each external site and authenticated session QA |
| KDE apps, windows, keyboard | PARTIAL | KWin identity/focus/readback and opt-in portal typing/keypress live tested; approvals bind exact target; focus change aborts | Other compositors/Windows unverified; arbitrary application content cannot be confirmed without app-specific readback |
| Mouse and global hotkeys | NOT IMPLEMENTED | Capability absence reported honestly | Safe pointer adapter, portal/compositor support and live tests |
| Audio, media, clipboard, desktop screenshot | PARTIAL | Linux PipeWire/MPRIS/Klipper status and XDG desktop screenshot tested; mutation paths have mocked tests | Live mutation QA and portable provider coverage remain |
| Speech | PARTIAL | Browser speech and recognition are the zero-API-cost fallbacks; hosted speech is blocked by default zero-spend policy | Verified zero-price hosted TTS/STT route or explicit paid opt-in; Vercel Gateway speech execution is not implemented |
| MCP | PARTIAL | Inbound HTTP/stdio and outbound HTTP discovery/calls use canonical contracts; failed server isolation tested | Outbound stdio/SSE, reconnect and mutating MCP completion |
| Project intelligence | PARTIAL | Git and package status for configured roots; current API found one project | Service logs, tests, issues and project-specific APIs are not yet aggregated |
| Research and media | PARTIAL | Attributable source collection/plan and configured media adapters exist | No search provider configured; source verification, synthesis and research-to-media workflow remain. Hosted media is blocked by zero-spend default |
| Memory/context | PARTIAL | Conversation context, relevant memory retrieval and recent tool context tested | Screen, selected-text, contact and richer project context fusion |
| Second laptop and screen/camera vision | NOT IMPLEMENTED | Local desktop screenshot and paired-device event foundations exist | Authenticated encrypted host agent; vision adapter and grounded perception |
| Android, SIM calls, WhatsApp | NOT IMPLEMENTED / CONFIGURATION REQUIRED | Pairing/revocation/event protocol and Phone UI status foundation exist | Android companion and OS roles, real call control/audio path, supported WhatsApp connection; no AI call handling is claimed |
| Smart room and physical JARVIS | NOT IMPLEMENTED | Generic hardware adapter is deliberately limited | Capability-scoped device protocol, hardware and safety testing |
| Windows support | UNVERIFIED | Windows abstraction and some provider tests exist | Live Windows host/CI verification |

## Security and spend boundaries

- The service binds to localhost by default. Remote control is not enabled. Desktop input requires `JARVIS_AUTH_TOKEN`, `JARVIS_DESKTOP_INPUT=1`, portal consent, and target-bound one-use approval.
- Brain secrets, environment credentials, browser profiles and Playwright artifacts are ignored by Git. The Brain API exposes masked credential metadata, not raw keys.
- Default `ZERO_SPEND_MODE=true` and `ALLOW_PAID_API_USAGE=false` block paid/unknown-price automatic model calls and hosted media/speech calls. A consumer website subscription is separate from API billing. Free promotional credits are **not** automatically spent. The current catalog guard cannot alone prove an absolute account-level billing ceiling if a provider reprices a model; use provider-side hard limits for that guarantee.
- Human verification and website rate limits are handed off or respected. No cookie extraction, hidden consumer APIs, CAPTCHA bypass, or account rotation is used.

## Current roadmap position

1. **Daily local assistant: PARTIAL.** Deterministic commands, tasks, one-time reminders, local chat, browser management, and controlled KDE desktop input work. The full second-laptop and grounded screen-understanding acceptance path does not.
2. **Brain routing: PARTIAL.** Local and deterministic paths are live; web and free-API fallbacks have code and tests but need authenticated sessions/keys and live end-to-end QA.
3. **Advanced research and projects: PARTIAL.** Real status and source planning exist; full synthesis and media execution are not complete.
4. **Communications and physical devices: NOT IMPLEMENTED for real-world actions.** Protocol/UI foundations do not make phone calls, WhatsApp messages, smart lights or robots functional.

**JARVIS DAILY-USE READY: PARTIAL.** It supports several local assistant workflows, but reliable cross-device control, grounded perception, and connected communications remain incomplete.

Detailed Linux capability evidence is in [CURRENT_CAPABILITIES.md](CURRENT_CAPABILITIES.md). Architecture and setup instructions are in [README.md](README.md). Do not interpret a status panel or passing mock as proof of a connected external account or device.
