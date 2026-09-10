# JARVIS Fix Log

## 2026-09-10 — Exact ChatGPT conversation URL precedence

- Root cause: a new JARVIS session set `newSession`, and the ChatGPT transport preferred the persisted Project home URL over the configured inference conversation URL. That navigated to `/project` even though `JARVIS_CHATGPT_URL` was correct.
- The configured conversation is now authoritative across startup, restart, reset, and every JARVIS session. Stale persisted conversation URLs and the Project home remain verification/recovery metadata and cannot override the configured `/c/6aa171a5-72fc-83e8-ac5f-1a3b70424a6a` target.
- Live verification after backend restart and session reset reached the exact configured conversation URL, verified the `jarvis-chat` page, and found the visible ChatGPT composer. The full suite remains 285/285 and the production build passes.

## 2026-09-09 — Needle 2 local reflex router

- Added the official `cactus-needle` runtime behind a persistent Python JSONL worker and a supervised Node adapter. The runtime proposes calls only; it never executes tools.
- Inserted one structured request router after approval/pending-intent interception and before general model delegation: deterministic commands remain fastest, high-confidence simple Needle calls use the canonical runtime, and every unsuitable/failing case safely falls back to ChatGPT.
- Reused the canonical registry and existing relevance filter. Added `system.resources` for grounded CPU/RAM inspection; the registry now contains 168 definitions.
- Fixed a dispatch defect where an already accepted read-only Needle decision was subjected to a second hard-coded `0.90` gate and incorrectly delegated to the model.
- Updated the primary ChatGPT target to the exact configured persistent `jarvis-chat` conversation URL and added recovery/session-isolation coverage.
- Real isolated HTTP evidence: `show current system resource usage` routed through Needle to `system.resources`, completed with verification in 1.59 seconds. `show my tasks` remained deterministic and completed in 45 ms. No operating-system mutation was used for this verification.

## 2026-09-09 — Real-world messaging and YouTube verification

- Reproduced the three reported failures through `/api/chat`: missing WhatsApp saved endpoint stopped execution, Instagram returned raw/self-inclusive recent data, and YouTube accepted a non-advancing media element as playback.
- Added one shared platform-aware `RecipientResolver` beneath canonical `communication.send`. Saved contact identities are now an optimization, not a prerequisite; WhatsApp/Instagram search supports unique resolution, durable ambiguity selection, and exact message preservation.
- Added canonical read-only `communication.recipients.search`, persistent WhatsApp/Instagram browser profiles, semantic WhatsApp recipient search/send verification, and a managed Instagram Web fallback. External model backends still own no tools.
- Instagram uses the authenticated account identity to exclude self messages, humanizes/group content, and persists per-conversation observation cursors. It reports new since JARVIS last checked and does not invent provider unread state.
- YouTube and YouTube Music remain distinct. Playback now requires an advancing, ready, unpaused video. Batched DOM candidate extraction fixed YouTube Music's 60-second timeout (live path: about 66s before, 5.6s after).
- Evidence: 277/277 tests pass and the production Vite build passes. Live normal YouTube selected the official Seven Nation Army video (`readyState=4`, advancing `currentTime`); live YouTube Music selected the exact track and advanced playback. Repeated live Instagram checks returned incoming-only incremental summaries. WhatsApp platform search reached the correct adapter but the isolated persistent profile reported `WHATSAPP_AUTH_REQUIRED`; no real WhatsApp/Instagram message was sent.

## 2026-09-08 â€” Headless ChatGPT/Gemini canonical tools and streaming

- Root cause of `Available tools: []`: general headless routes used plain model delegation unless classification set `requiresTools`; that path intentionally had no tool schemas. Every ChatGPT/Gemini headless route now uses the existing bounded model tool loop. Deterministic routing remains the zero-model fast path.
- Added canonical `tools.discover`, capability-family summaries, intent anchors, and dynamic catalog expansion. Gmail, messaging/contact, YouTube/browser/media, developer and other schemas still come only from `registry.js`.
- Added a shared headless brain layer and Gemini Playwright transport. Both use one tool protocol and the canonical validation/policy/approval/executor/verification path.
- Added DOM MutationObserver delta streaming, normalized generation/tool events, 80 ms UI polling, real tool activity, Stop/cancellation, separate per-session browser conversation metadata, browser fallback and existing API-pool fallback.
- Fixed Gemini startup: `launchPersistentContext` had incorrectly received the executable path as its profile-directory argument. It now receives the private Gemini profile directory and installed-browser `executablePath` separately.
- Configured the user-provided stable `jarvis-chat` URL through private credentials configuration. Direct navigation is accepted only for HTTPS `chatgpt.com` and the exact project slug; sidebar discovery remains recovery and another project is never selected silently.
- Evidence: 250/250 tests and production Vite build pass. Live ChatGPT task and Gmail reads each executed one verified canonical tool and resumed the same browser conversation. Live Gemini task read emitted deltas, requested `tasks.list`, received a verified result, resumed, and completed. No external message or email was sent.

## 2026-09-08 — Live Brain, settings, sessions, and ChatGPT Project isolation

- Replaced the decorative Brain/Thought Stream with a Canvas graph backed only by a configured Obsidian vault. Markdown notes are nodes, unambiguous wiki links are edges, filesystem changes are debounced, and memory retrieval highlights real matching nodes.
- Added isolated JARVIS chat sessions with separate histories and ChatGPT browser conversations while retaining shared durable memory.
- Added a backend-only multi-key credential manager with names, enable/disable, removal, safe provider verification, and rotation-pool integration. Disabled keys are excluded from both model and legacy provider selection.
- Centralized appearance tokens, seven dark accent presets, custom accent controls, real UI/heading/HUD scaling, and validated local font registration.
- Expanded contact editing and aliases without replacing existing records.
- Fixed MediaPipe bundle/model/worker/WASM resolution for development and packaged builds by resolving assets relative to their owning modules.
- Constrained ChatGPT browser inference to the exact `jarvis-chat` Project, persisted discovered project URLs, and isolated browser conversations per JARVIS session. Project absence is explicit and never silently selects a different Project.
- Obsidian write failures now produce stored sync diagnostics and activity events instead of being silently discarded.

Evidence: 239/239 tests pass; Vite production build, all server syntax checks, and `git diff --check` pass. Temporary real filesystem watcher tests cover note create/link/rename/unlink/delete. Live camera landmarks, visual UI review, provider credential acceptance, and current ChatGPT website Project selection were unavailable in this environment and are not claimed.

## 2026-09-07 — Native development shell and browser dispatch

- Changed `Start Voice OS.bat` to launch the Vite renderer inside Electron, with the backend owning the single global hotkey bridge; it no longer opens Chrome or Edge as the JARVIS shell.
- Added an application/tray/favicon asset and wired it into Electron and Windows packaging.
- Added canonical `browser.external.open`: ordinary links use the Windows default browser; commands such as `open YouTube in Zen Browser` resolve a registered installed browser dynamically.
- Kept `browser.open` as the distinct JARVIS-managed Playwright surface for DOM automation.
- Added URL credential/protocol checks and direct argument-array launch behavior with no shell evaluation.

Evidence: 198/198 tests, production build, syntax and diff checks pass. Live `Start Voice OS.bat` produced an Electron-owned JARVIS window with the global bridge running. Canonical chat opened YouTube in the registered Zen Browser and observed `YouTube — Zen Browser`; default-handler dispatch also completed in the same runtime.

## 2026-09-06 — Voice shortcut capture and development launcher

- Prevented an undetectable `Ctrl+Fn` attempt from silently becoming plain `Ctrl`; Settings now explains the Windows firmware limitation and retains the previous shortcut.
- Verified two-key `Ctrl+Alt` persistence and live bridge reload, while unsupported `Fn` returns HTTP 400 `INVALID_ARGUMENTS`.
- Removed the duplicate standalone bridge path from the development batch launcher; the backend now owns the single global keyboard hook.
- Added Edge/Chrome/default-browser discovery and pinned Vite to `127.0.0.1:5173`.

Evidence: 196/196 tests and production build passed; live frontend/backend/bridge checks passed.

## 2026-09-06 — Completion mission P2–P15

- Closed approval-to-model continuation on the same Run, preserving verified side effects and rejecting replay/mutation/expiry.
- Added dynamic Windows discovery, stable HWND/PID launch verification, window actions, native keyboard/clipboard/pointer/screen/Core Audio/media, UI Automation, managed Playwright browser, and privacy-redacted multimodal screen perception.
- Completed typed memory CRUD, grounded ephemeral references, safe filesystem operations, and real PDF/DOCX/PPTX/XLSX parsing with provenance.
- Added canonical Gmail/Calendar/Instagram/Discord/Slack surfaces, structured Git/GitHub CLI operations, research evidence, notifications, durable scheduler occurrence/event deduplication and conditions.
- Added the secure PC-side phone protocol without claiming a mobile companion.
- Replaced visible demo workspace data with backend truth or explicit unavailable states.
- Added deterministic capability-family anchors after the 154-tool registry exposed an embedding-only tool omission.
- Hardened body/error/CORS/LAN boundaries, atomic state writes, and dependencies. Electron 44.2.0, Vite 8.2.2, and fflate 0.8.3 leave zero npm advisories.

Evidence: 195/195 tests, production build, native 40-byte input compilation, and clean diff validation. The NSIS installer and unpacked executable were built; the ASAR contains no local credential/state files. Live Notepad, clipboard, screenshot, audio, browser, UIA, Gmail, Instagram, Slack auth, GitHub auth, and DeepSeek passed. Groq TTS requires external model-terms acceptance. Synthetic keyboard focus and pointer restoration were not marked successful when Windows/user motion prevented conclusive evidence.

## 2026-09-01: P0 Windows hotkey repair

**What was wrong**

- The native low-level hook returned `1` for the final shortcut key, deliberately swallowing physical key-down and key-up events.
- Caps Lock was permitted as a trigger.
- Win/Super was unsupported by settings, browser matching, and the native bridge.
- Browser matching assumed the final serialized key was the final physical key, which is false for pure modifier chords.
- Recorder guidance encouraged Caps Lock despite the state-corruption report.

**Root cause**

The hook mixed detection and input suppression. Partial modifier/lock delivery can desynchronize Windows logical state, application state, and keyboard indicators. Shortcut serialization also encoded an order that the runtime mistakenly treated as press order.

**Fix**

- Native hook is observational and always calls `CallNextHookEx`.
- Removed Caps Lock from supported shortcuts and migrated legacy Caps shortcuts to safe defaults.
- Added Win/Meta aliases and left/right Windows-key state handling.
- Recorder now captures a complete held chord and commits on release.
- Browser matching now checks the full chord independent of modifier serialization order.
- UI states that pure modifier shortcuts are non-exclusive and may retain normal Windows behavior.

**Evidence**

- Embedded C# compilation: PASS.
- Native bridge test received `hotkey.ptt.start`, `hotkey.ptt.stop`, and `hotkey.dictation.toggle`.
- After injected balanced input: Ctrl=false, Shift=false, Alt=false, Win=false.
- Caps Lock before/after: unchanged.
- Settings-to-bridge test: `Alt+Win|Ctrl+Alt+J`, then original shortcuts restored.
- Regression tests added for Win aliases, Caps rejection/migration, and no hook suppression.

## 2026-09-01: model pool ID repair

**What was wrong**

- `muse/spark-1.2` and `nvidia/nemotron-3-nano-omni` were not valid OpenRouter model IDs.

**Root cause**

The default logical pools used guessed aliases rather than catalog IDs.

**Fix**

- Muse: `meta/muse-spark-1.2`.
- Nano Omni: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`.
- Added regression assertions for both defaults.

**Evidence**

- OpenRouter catalog lookup confirmed both IDs.
- Nano Omni live text request passed after correction.
- Muse now reaches the correct model and returns a user-account configuration requirement (18+ preference), rather than `model ID invalid`.
- DeepSeek, GLM, Laguna, MiniMax, MiMo, and Lightning live probes passed.

## Baseline and regressions

- Before fixes: 102 tests passing; production build passing.
- After hotkey fixes: 104 tests passing; C# compile passing; production build passing.
- After model-ID fix: 105 tests passing.

## 2026-09-01: exact approval policy hardening

**What was wrong**

- Command execution accepted any record whose status was `approved`.
- Generic messages reused the same unsafe pattern.
- Calendar writes had no approval gate.

**Root cause**

Approval state was checked independently from the exact action, so an approval could be reused for mutated arguments or an unrelated action.

**Fix**

- Added a shared exact-action policy with stable argument hashing, expiry, one-time consumption, mutation rejection, cross-tool rejection, and replay rejection.
- Connected command, message, and calendar endpoints to that policy.
- Added safe legacy-state initialization for approval arrays and Run approval references.

**Evidence**

- Unit tests cover mutation, cross-tool reuse, expiry, and replay.
- Live command lifecycle: 202 pending, 200 approval, 403 mutation (`APPROVAL_MISMATCH`), 200 execution, 403 replay (`APPROVAL_REPLAY`).

## 2026-09-01: Instagram inbox and TTS diagnostics repair

- Instagram discovery now falls back from Composio semantic search to the full toolkit catalog.
- Tool scoring prefers a zero-required-field conversation list over a per-conversation message tool.
- Optional `user_id` is no longer incorrectly populated with `me`; `ig_user_id` is used for the authenticated business account.
- Live deterministic Instagram chat route returned a grounded HTTP 200 result.
- TTS now preserves the primary provider failure and skips unconfigured fallback providers.
- Regression suite after this batch: 109 tests passing; production build passing.

## Confirmed but not yet fixed

- Hosted Groq TTS still needs a provider-supported model/endpoint.
- Slack bot authenticates but lacks scopes for channel/history/user reads.

## 2026-09-01: P1 authoritative execution runtime

**What was wrong**

- Deterministic chat used inline provider/custom handlers.
- The central executor covered only four tools.
- Models received discovery metadata but could not run structured tool calls.
- Workflow text steps were marked complete without executing anything.
- MCP published empty schemas and a shadow subset whose calls often failed.
- Provider writes, approvals, verification, Runs, telemetry, and idempotency were split across unrelated routes.

**Root cause**

Capability discovery and execution evolved independently in chat, workflows, integrations, and MCP. A successful parse or resolved provider promise was often treated as completed work, so no single boundary could enforce policy or prove effects.

**Fix**

- Rebuilt `server/registry.js` as one 29-tool metadata catalog.
- Rebuilt `server/toolExecutor.js` as the canonical lookup → input validation → availability → permission/risk → exact approval → timeout/retry → handler → output validation → verification → Run/telemetry/idempotency pipeline.
- Added structured runtime errors and schema validation.
- Migrated deterministic chat and assistant-facing task, memory, document, calendar, messaging, Composio, hardware, Voice OS, research, browser/app, and workflow operations.
- Added a bounded OpenAI-compatible model tool loop (four rounds/eight calls) with filtered schemas and authoritative tool-result messages.
- Replaced fake workflow completion with structured real-tool execution, dependency checks, retry exhaustion, approval resume, cancellation/pause, and verification evidence.
- Made HTTP and stdio MCP thin adapters over canonical schemas/execution with a read/low-risk permission profile.
- Added state schema v2 and migration history.
- Removed fake workflow cards and forced 100% success from the frontend; UI now reads backend summary and actual last Run state.
- Fixed explicit approval replay ordering while preserving idempotent failover replay without re-executing a completed action.
- Fixed manual scheduler tick persistence.

**Evidence**

- Complete suite: 131 passed, 0 failed.
- Production Vite build: passed (62 modules).
- Focused coverage includes invalid tools/arguments/config, timeout, provider error, output/verification failure, permission denial, exact approval mutation/expiry/replay, failover idempotency, deterministic Run evidence, one/multiple/dependent model calls, loop limits, workflow retries/dependencies/pause/cancel/approval resume, and MCP policy/schema mapping.
- Isolated live source verification: 29 tools; real `files.read` schema; task and memory persistence; verified workflow mutation; verified MCP call; deterministic `tasks.list`; seven persisted Runs.
- Performance test: 100 canonical `tasks.list` executions averaged about 0.2 ms in-process; 5,000 registry lookups stayed under the 250 ms regression ceiling.
- Test servers on ports 8790/8791 were stopped after verification.

**Known limitation**

- Historical limitation, addressed in the September 5 continuation work below: automatic post-approval model prose synthesis did not resume.

## 2026-09-05 — P1 approval continuation

Root cause: the model loop returned on approval without retaining its messages, pending calls, counters or original request. The approval endpoint executed the tool but never returned its result to that model loop.

Changes:

- Persist model continuation on the existing Run, including pending calls and bounded round/call budgets.
- Commit the approved tool result before requesting synthesis. Replace the pending tool message with verified execution evidence and resume the same context.
- Keep successful actions when synthesis fails. Explicit Run resume retries the continuation, not the approved action.
- Suppress repeated identical verified side effects within the model loop using an action fingerprint, including when the model supplies a different call ID.
- Reject/expire the waiting continuation without executing the action. Reject invalid expiration dates.
- Prevent text-only emergency fallback from taking over tool-driven execution without tool context.
- Reject concurrent/replayed approval resolution again inside the serialized mutation boundary.

Evidence: focused model-loop tests cover serialization, accepted/rejected/expired approval, execution/verification failures, synthesis failure/retry, remaining calls and replay. A real HTTP subprocess test executes `node --version`, resumes via a controlled local provider protocol fixture, checks the persisted final response and rejects replay. This is NOT proof of external provider authentication. No external messages were sent.

Mission remains active. Desktop and later phases are not declared complete by these results. Native launch verification currently has a confirmed adapter/executor contract mismatch and only six built-in launch targets; P2 must replace spawn-only success with observed evidence.

## P2 in progress: discovery, windows and input substrate

The preceding app limitation is now addressed for registered installed applications: dynamic cached discovery replaces the six-app launch restriction. The live source discovered 428 source entries. Notepad launch/minimize/restore/approved close passed through the canonical executor. Calculator initially exposed a transient-window false confirmation; two observations of a stable HWND/PID now gate launch success. Full application coverage is not claimed.

New modules: applicationIndex, desktopBridge, windowControl, desktopInput, native PowerShell/C# bridge. Nine discovery/window tools and eight input/clipboard/pointer/topology tools were added to the same registry. Existing tool name system.app.open remains compatible.

Input payloads now use stdin. Clipboard reads require approval and exclude raw text from normal tool history. Native input structure sizes were compiled and measured: desktop=40 bytes, voice bridge=40 bytes, x64 expected=40. The old dictation union omitted MOUSEINPUT and had the wrong size; it now has the correct union and checks SendInput failures.

Live keyboard/clipboard/mouse effect tests are still UNVERIFIED. See JARVIS_DESKTOP_CONTROL_ARCHITECTURE.md for precise coverage. P2 is not complete; P3-P15 remain active mission work.

### Controlled input verification follow-up

- Added a disposable real WinForms target and canonical-executor test script. It independently hashes received text instead of trusting SendInput.
- Exact mixed-case Unicode text was observed successfully in the target.
- Fixed the native key-array cast: Windows PowerShell requires uint16[], not ushort[]. Native error type/ID is now returned without command payloads to support diagnosis.
- Full compound-shortcut verification is not complete: foreground-window restrictions and user focus changes caused explicit WINDOW_NOT_FOCUSED / VERIFICATION_FAILED results. No force-focus workaround or key-state reset was introduced.
- The scripts clean up only their own target process. Caps Lock was not toggled by testing.

### Screen capture and topology

- Added canonical approved screen.capture with native visible-pixel capture, dimension/header validation, unique artifact creation, and hash read-back.
- Real executor verification: 1920x1200 PNG, 33,871 bytes, 1,029 ms, original Run retained. Temporary screenshot was removed after verification and was not uploaded.
- Real topology returned the current single 1920x1200 display. Multiple displays and scaling edge cases are not yet verified.
- Full suite now passes 150 tests. Screenshot rejection and artifact/approval tests are included. P2 remains in progress.

## Contact-aware messaging and official model pools

- Added schema-v7 local contact storage with the requested aliases and no fabricated destinations.
- Added canonical `contacts.list`, `contacts.resolve`, `contacts.upsert`, `contacts.delete`, and approval-gated `communication.send` tools.
- Routed contact messages through the structured model loop so missing platforms are clarified and Hinglish can be polished before the exact send text is approved.
- Added a Settings contact editor for WhatsApp, Instagram, Discord, Slack, and Gmail identifiers.
- Added rotating backend-only OpenAI and Gemini provider pools with canonical tool schemas and configurable model IDs. Website subscriptions are deliberately not scraped or represented as unlimited API access.
- Regression evidence: 203 tests pass, production Vite build passes, and `git diff --check` reports no whitespace errors.

## Settings information architecture and account authorization

- Replaced the single long Settings surface with five focused sub-tabs: Intelligence, Accounts & contacts, Voice OS, Appearance, and Credentials.
- Persisted the last selected section in session storage and added responsive horizontal navigation for narrow windows.
- Moved contact aliases, Composio OAuth, and account authorization into one Accounts & contacts area.
- Added canonical `connections.auth.open` for allowlisted WhatsApp, Instagram, Discord, and Google sign-in pages using the persistent managed Playwright profile in explicitly visible mode.
- The UI does not claim “Connected” when a page merely opens; provider-confirmed status remains authoritative.
- Verification evidence: 207 tests pass, including allowlist/Run/browser-executor/network-denial coverage, and the production Vite build passes.
- Fixed headed sign-in failing with `ERR_NETWORK_ACCESS_DENIED` when the development backend inherited a restricted launch environment. The verified backend was restarted outside that sandbox, its stale managed-Chrome children were closed, and a real WhatsApp Web navigation completed with canonical verification. Future network-denial errors are normalized to an actionable `CONNECTION_UNAVAILABLE` response instead of exposing raw Playwright internals.

## 2026-09-07 — Experimental ChatGPT Web brain

- Added an isolated `ChatGPTTransport` interface and persistent Playwright implementation with a private gitignored profile, semantic selector fallbacks, completion stabilization, timeout/cancellation, one crash retry, serialized access, and explicit worker health.
- Added a strict whole-response tool protocol. JSON embedded in prose cannot execute; unknown/malformed calls fail before the executor. Tool results distinguish requested, completed, verified, and failed state.
- Adapted ChatGPT Web to the existing filtered model schemas and bounded `modelToolLoop`; no executor, permission, approval, Run, idempotency, or verification path was duplicated.
- Added persisted conversation URL/turn metadata and schema-v8 migration, context rotation, headed manual-login command, Settings health/login/reset/default controls, structured ChatGPT-specific errors, telemetry/events, and post-approval continuation through the same web brain.
- Verification: 226 tests pass and Vite production build passes. Focused tests use a mocked transport and cover parser safety, no-tool/one-tool/sequential calls, approval pause, reconnect, rotation, browser failure, duplicate-loop and per-step limits. No private browser profile exists yet, so a real ChatGPT website response and full web→tool→web round trip are not claimed.
- Google rejected authentication inside the Playwright-controlled headed window as an insecure browser. Login bootstrap now launches an ordinary installed Chrome/Edge process with the dedicated JARVIS profile and no automation or stealth flags. After the user closes that window, JARVIS reopens the saved profile headlessly and verifies the composer.

## 2026-09-08 — Settings, sessions, offline gestures, and live memory Brain

- Migrated to schema v9 with isolated chat sessions and non-secret credential metadata. Chat context, messages, Runs, and ChatGPT conversations share one session ID; persistent memory stays shared.
- Added exact-name `jarvis-chat` Project discovery, stored direct-URL reuse, Project state, per-session browser conversations, and explicit failure without cross-Project fallback.
- Added a server-only multi-key manager for OpenRouter, OpenAI, Anthropic, Gemini, Groq, OpenCode Zen, 9router, and custom endpoints. Verification makes minimum provider requests and records real states without returning keys.
- Rebuilt Appearance around one accent family, seven dark themes, UI/heading/HUD scaling, and validated local TTF/OTF/WOFF/WOFF2 storage.
- Added contact creation/edit/search with aliases, category, notes, provider identifiers, and canonical approval-gated deletion.
- Replaced the fake graph and Thought Stream with a Canvas graph sourced only from Obsidian. Notes map to nodes; unambiguous wiki links map to edges; canonical retrieval highlights matching nodes.
- Added debounced vault watching and revision-only polling. Tests cover scan, create, link, rename, unlink, deletion, and path confinement.
- Fixed MediaPipe runtime URLs by resolving bundles, model, worker, and WASM relative to their modules; build tests assert production assets.
- Live endpoints returned health, one session, eight credential providers, and honest `not_configured` Obsidian state. Visual browser and live camera verification were unavailable and are not claimed.

## 2026-09-08 — Approval transactions, messaging normalization, permission modes, and media routing

- Reproduced the active Instagram `Unknown`/blank-preview response, missing WhatsApp Web fallback, approval-text re-routing, and YouTube/YouTube Music ambiguity before editing.
- Approval utterances are now intercepted by JARVIS before model routing. The exact normalized action, resolved contact endpoint, session, backend conversation, tool call, and idempotency key are persisted and resumed through the canonical executor.
- Added centralized `normal`, `skip_permissions`, and `full_permissions` policies. All modes retain schema validation, authentication, idempotency, verification, Run persistence, and audit history. Critical/destructive/security risks remain guarded.
- Added an emergency stop that cancels generation, cancels pending approvals, and prevents new side effects until resumed.
- Added persistent authenticated WhatsApp Web fallback under canonical `communication.send`; it requires a unique saved international phone number and verifies the outgoing message element.
- Instagram now hydrates conversation-list responses with the provider's per-conversation read tool, normalizes nested sender/message fields, and reports when the provider does not expose unread state.
- Added separate `youtube.search`, `youtube.play`, and `youtube_music.play` tools. Explicit YouTube requests cannot silently become YouTube Music.
- Initialized the idempotent default vault at `%USERPROFILE%/Documents/JARVIS-Vault` with the documented folder hierarchy and stable memory IDs/frontmatter.
- AutoMCP was evaluated and deliberately not installed: it exports Python framework agents as MCP servers, while JARVIS already generates HTTP/stdio MCP adapters directly from its canonical JavaScript registry and executor. Adding it would duplicate the server boundary without improving browser automation, permissions, approval resumption, or MCP consumption.
- Verification: 265 tests pass; the post-refactor approval/Instagram focused suite also passes (19/19), production build passes, JavaScript syntax passes, and `git diff --check` has no errors. Live read-only checks verified Gmail, hydrated 10 Instagram messages with zero unknown senders, and the default vault path.
