# JARVIS Capability Matrix

Verified 2026-09-10. Statuses: WORKING, PARTIALLY_WORKING, BROKEN, NOT_IMPLEMENTED, CONFIGURATION_REQUIRED, EXTERNAL_PLATFORM_LIMITATION, UNVERIFIED. Windows rows retain their prior live evidence; Linux status is separately identified below.

| Capability | Status | Implementation | Verification / limitation |
|---|---|---|---|
| Canonical tool executor/registry | WORKING | `registry.js`, `toolExecutor.js` | 168 unique definitions; schema/policy/approval/retry/verification/Run tests |
| Cross-platform desktop dispatch | WORKING | `desktopBridge.js`, `platformDesktop.js`, `server/platform/*` | Same canonical tools dispatch to Windows or Linux; 292 Windows regression tests and 18 focused tests in Ubuntu 24.04 WSL passed |
| Linux XDG storage/config/cache | WORKING | `platform/paths.js`, store/browser/media modules | Executed under Ubuntu 24.04 WSL with isolated XDG fixtures; no username/source-tree state assumption |
| Linux freedesktop app discovery/process inspection | PARTIALLY_WORKING | `platform/linuxDesktop.js` | Parser, resolver and canonical bridge tests pass under Linux; real graphical app launch still requires Ubuntu/Zorin desktop verification |
| Linux X11 windows/keyboard/pointer | UNVERIFIED | `platform/linuxDesktop.js` | Implemented through `wmctrl`, `xdotool`, EWMH state checks; no X server is available in WSL |
| Linux Wayland global window/input | EXTERNAL_PLATFORM_LIMITATION | capability detection | Compositor security restrictions are reported as `CAPABILITY_UNAVAILABLE`; no bypass attempted |
| Linux audio/media/clipboard/screenshot | UNVERIFIED | `platform/linuxDesktop.js` | PipeWire/MPRIS/X11-or-Wayland adapters implemented; require a real desktop/audio session for live verification |
| Linux semantic native UI / global Voice OS hook | NOT_IMPLEMENTED | capability boundary | AT-SPI adapter and Linux global press/release hook are not present; browser DOM and focused-app controls remain available |
| Deterministic routing | WORKING | `router.js` | Direct canonical ToolCalls; no unnecessary model; performance tests |
| Structured model tool loop | WORKING | `modelToolLoop.js` | zero/one/multiple/dependent calls, limits, errors, approvals |
| ChatGPT Web brain adapter | WORKING | shared headless brain, ChatGPT transport, strict protocol | Live authenticated `jarvis-chat` selection plus real canonical `tasks.list` and Composio `gmail.latest` tool loops verified |
| ChatGPT Web local tool protocol | WORKING | strict sentinel parser → existing model loop/executor | Normal/malformed/fake/unknown/multiple call cases, sequential tools, approval pause, duplicate and per-step limits tested |
| ChatGPT Web persistent session/worker | WORKING | isolated Playwright profile + persisted conversation URL + queue | Authenticated profile, direct Project URL, restart reuse and real generation verified; consumer UI changes remain an operational risk |
| Gemini Headless brain adapter | WORKING | shared headless brain + `geminiWebTransport.js` | Live authenticated headless Run executed and verified `tasks.list`, resumed Gemini, and emitted normalized deltas/tool events |
| Headless capability discovery | WORKING | `toolFilter.js`, canonical `tools.discover` | Exact Gmail, messaging, and YouTube prompts retain relevant schemas; discovery expansion and no-empty-catalog regression tests pass |
| Headless streaming/cancel | WORKING | DOM MutationObserver, generation event protocol, Chat UI | Delta deduplication, hidden control envelopes, real tool activity, session filtering and abort signaling tested; live Gemini events observed |
| Post-approval model resumption | WORKING | model loop + approval API | Same Run/context; accepted/rejected/expired/failure/replay tests |
| Isolated chat sessions | WORKING | `chatSessions.js`, session APIs and chat selector | Separate IDs/history and ChatGPT URLs; durable memory shared; focused tests/build pass |
| Obsidian live memory graph | CONFIGURATION_REQUIRED | `memoryGraph.js`, `LiveMemoryGraph.jsx` | Live endpoint honestly reports not configured; temp-vault scan and create/link/rename/unlink/delete watcher tests pass |
| Multi-key credential manager | WORKING | `credentialManager.js`, Credentials settings | Named slots, mask, enable/disable/remove, provider verification; disabled slots are excluded from actual rotation; live catalog returned eight providers without secrets |
| Central appearance tokens | WORKING | `useAppearance.js`, `variables.css` | Seven dark presets, custom accent, UI/heading/HUD scaling, validated persistent local fonts; compile tested, manual visual QA unavailable |
| Contact management UI | WORKING | `SettingsPanels.jsx`, canonical contact tools | Add/edit/search/aliases/category/notes; deletion remains exact-approval gated |
| Offline MediaPipe assets | WORKING | `public/brain/main.js`, `handTracker.js` | Module-relative URLs and production-dist asset assertions; live camera landmarks require camera permission and remain unverified here |
| Model provider rotation/fallback | WORKING | `modelPool.js` | quota/429/5xx/request-bug/concurrency/modality tests; live DeepSeek |
| Runs/telemetry/idempotency | WORKING | Run engine/executor/store | Verified persistence and no duplicate side effects |
| Workflows | WORKING | `workflowEngine.js` | Real tools, dependencies, retries, pause/resume/cancel/approval |
| Scheduler/event conditions | WORKING | scheduler/workflowEvents | Worker, occurrence keys, conditions, duplicate receipts tested |
| MCP HTTP/stdio | WORKING | MCP adapters | 59 policy-safe canonical tools; schemas and executor tested |
| Dynamic app discovery/search | WORKING | application index/native bridge | Cached Start Apps/shortcuts/App Paths/registered browsers; ambiguity tests |
| App open | WORKING | `system.app.open` | Live Notepad stable HWND/PID verification; Calculator transient launch correctly rejected |
| App graceful close | WORKING | `apps.close`, windows.close | Exact HWND/PID + approval; live Notepad |
| Window list/active/focus/minimize/maximize/restore | WORKING | window control | Unit/native tests; live minimize/restore |
| Window move/resize/fullscreen | NOT_IMPLEMENTED | — | No canonical tools |
| Keyboard type/keypress | PARTIALLY_WORKING | native SendInput | Unicode effect previously observed; modifier/Caps invariants tested; latest noninteractive focus attempt rejected |
| Clipboard text | WORKING | desktop input | Live write/read/restore; sensitive persistence redacted |
| Mouse position/move/click/right/double/scroll/drag | PARTIALLY_WORKING | desktop input | Native/approval tests; live move observed but restore raced with physical pointer |
| Screenshot | WORKING | screen capture | Live 1920x1200 PNG dimensions/hash/readback/cleanup |
| Screen recording | NOT_IMPLEMENTED | — | No recorder |
| Core Audio volume/mute | WORKING | Core Audio bridge | Live 6→7→6 restore and unit tests |
| Brightness/Wi-Fi/Bluetooth/lock/sleep/restart/shutdown | NOT_IMPLEMENTED | — | Intentionally absent high/system-risk capabilities |
| Windows media play/pause/next/previous/status | PARTIALLY_WORKING | GSMTC bridge | Honest no-session live result; mutation contract tests, no active-session live test |
| Spotify search/queue/playlists | NOT_IMPLEMENTED | — | Requires Spotify API/OAuth |
| Default/named desktop browser opening | WORKING | `browser.external.open`, registered browser index | Live canonical default-handler and explicit Zen Browser commands; HTTP(S)-only, no shell |
| Managed browser tabs/navigation/read/search/scroll | WORKING | Playwright Core | Live controlled page and unit tests |
| Browser click/type/fill/submit/upload/download | PARTIALLY_WORKING | Playwright Core | DOM/accessibility and approval implemented; fill/click live; upload/download not live |
| Existing personal browser tabs | EXTERNAL_PLATFORM_LIMITATION | managed profile only | Does not attach to arbitrary personal sessions |
| UIA inspect/find | WORKING | Windows UI Automation | Live active-window tree inspection |
| UIA semantic click/type | PARTIALLY_WORKING | Windows UI Automation | Approval and state-change verification; control/app support varies |
| Pixel screen perception | CONFIGURATION_REQUIRED | screenshot + Nano Omni | Contract tests pass; live multimodal image call not performed |
| Browser microphone / PTT / dictation | WORKING | VoiceIsland/Voice OS bridge | Event/hotkey/Caps-state tests; device-specific manual QA still prudent |
| Electron desktop/tray development shell | WORKING | `desktop/main.cjs`, `Start Voice OS.bat` | Live visible JARVIS window belongs to Electron; bridge remains global outside app focus |
| Groq Whisper STT | PARTIALLY_WORKING | `tts.js` | Configured and request contract tested; no live recorded sample in final batch |
| Browser TTS | WORKING | SpeechSynthesis | Interrupt/cancel path implemented |
| Groq TTS | CONFIGURATION_REQUIRED | Orpheus endpoint | Live provider says account admin must accept model terms |
| ElevenLabs/Fish Audio TTS | CONFIGURATION_REQUIRED | hosted adapters | Credentials/voice IDs not set |
| Wake word / continuous listening / audio device picker | NOT_IMPLEMENTED | — | PTT/dictation remains activation mechanism |
| Durable memory CRUD/search/index | WORKING | memory tools/local embeddings | Metadata, update/delete/persistence/ranking tests |
| Contextual “it/back/pause” | PARTIALLY_WORKING | ephemeral context resolver | Grounded desktop/browser/media cases; no broad pronoun inference |
| Files list/search/read/create/write/move/copy/rename/delete | WORKING | fileTools | Canonical lifecycle, approval, traversal/symlink/protected-path tests |
| TXT/MD/JSON/CSV/HTML documents | WORKING | document intelligence | Real parsing/chunking/provenance tests |
| PDF/DOCX/PPTX/XLSX read/search/summarize/compare/extract | WORKING | pdf-parse + OOXML parser | Real generated format fixtures and provenance |
| Binary Office create/edit | NOT_IMPLEMENTED | — | Read intelligence only |
| Gmail read/search | WORKING | Composio | Live canonical inbox read |
| Gmail draft/send/reply/archive/delete/labels | PARTIALLY_WORKING | Composio dynamic adapter | Approval and contract tests; no live mutations |
| Local contact aliases and platform address book | WORKING | `contactBook.js`, canonical contact tools, Settings | Nine requested seed aliases; persistence, resolution, redaction, and UI build verified; destinations require user entry |
| Settings sub-navigation | WORKING | `SettingsHub`, `workspaces.css` | Intelligence, Accounts & contacts, Voice OS, Appearance, and Credentials render as separate persistent tabs; production build passed |
| Visible managed account sign-in launcher | PARTIALLY_WORKING | `connections.auth.open`, Playwright persistent profile | Canonical executor and allowlist tests pass; user must complete QR/OAuth and connector readiness is reported separately |
| Contact-aware cross-platform sending | PARTIALLY_WORKING | `communication.send`, `recipientResolver.js` | Saved endpoints are optional for WhatsApp/Instagram: authenticated platform search, ambiguity transactions, exact approval, and replay prevention are tested; live external sends intentionally not performed |
| Hinglish message polishing | PARTIALLY_WORKING | structured model tool loop | Grounding instructions and tool path verified; quality depends on configured model and final text remains approval-visible |
| Google Calendar list/search/create/update/delete/availability | PARTIALLY_WORKING | Composio | Active account and contract tests; no live mutation/read in final batch |
| Slack auth/channels/send | PARTIALLY_WORKING | direct Slack API | Auth live; configured scopes permit limited surface |
| Slack history/DM/search/users/reactions | CONFIGURATION_REQUIRED | direct Slack API | Missing exact OAuth scopes documented |
| Slack file upload/download | NOT_IMPLEMENTED | — | No canonical file transport |
| Instagram inbox | WORKING | Composio + local sync cursor | Live canonical incoming-only read; authenticated self identity excludes outgoing messages; humanized baseline/incremental summaries verified |
| Instagram send/reply/publishing | PARTIALLY_WORKING | Composio plus managed Web fallback | Username/display resolution, ambiguity preservation, exact-text dispatch and verification mock-tested; no live write; Web profile login still required |
| Discord user | PARTIALLY_WORKING | Composio | Active connection; adapters not live-tested |
| Discord bot | CONFIGURATION_REQUIRED | Composio | Connected account expired |
| WhatsApp personal messaging/calls | PARTIALLY_WORKING | visible managed sign-in + Voice OS control contract | QR page can be opened safely; authenticated browser messaging/calls still require a compatible control bridge and are not claimed connected |
| Local Git status/diff/log/branches | WORKING | structured execFile Git adapter | Unit and live status |
| Git commit/pull/push | PARTIALLY_WORKING | Git adapter | Approval/injection tests; no live remote mutation |
| GitHub issues/PR/search | WORKING | `gh` adapter | GitHub CLI authentication and repository access verified live; canonical adapter tests pass |
| Research pipeline | CONFIGURATION_REQUIRED | researchPipeline | Planning/dedupe/evidence/freshness/conflict tests; search URL absent |
| Notification normalization/prioritization/dedup | WORKING | notificationCenter | Canonical persistence/privacy tests |
| Automatic connector notification ingestion | PARTIALLY_WORKING | phone/Voice OS events | Event intake exists; no general connector polling worker |
| Phone PC bridge | PARTIALLY_WORKING | phoneBridge | Pairing/encryption/signing/replay/permissions/queue tests |
| Phone companion/device control | CONFIGURATION_REQUIRED | external companion required | No mobile application/device paired |
| Hardware/IoT | NOT_IMPLEMENTED | generic legacy endpoint only | User requested hardware be left aside |
| Frontend truthful operational state | WORKING | WorkspaceViews/Tasks/Approvals | Demo fallbacks removed from visible paths; live APIs drive state |
| Approval transaction resumption | WORKING | `server/approvalManager.js`, `server/index.js`, `server/toolExecutor.js` | HTTP and executor regression tests | Exact frozen action resumes once; model continuation remains in the same Run. |
| Three permission modes | WORKING | `server/permissionPolicy.js`, `/api/permissions`, Settings → Security | Unit tests + live endpoint | Modes persist; destructive/security actions remain guarded. |
| WhatsApp Web send fallback | PARTIALLY_WORKING | `server/whatsappWeb.js`, `recipientResolver.js`, `communication.send` | Controlled send/ambiguity tests + live read-only auth check | Missing saved endpoint and non-library contacts use semantic platform search. Real send not performed; isolated profile currently requires QR authentication. |
| Instagram inbox normalization | WORKING | `server/connectedMessages.js` | Fixtures + repeated live read-only checks | Self/outgoing filtering uses authenticated account identity; content is grouped/humanized; first check establishes a cursor and later checks report new-since-JARVIS-check without fabricating unread state. |
| Explicit YouTube playback | WORKING | `server/youtubeAutomation.js`, `server/router.js` | Unit tests + live browser playback | Normal YouTube selected the official video and verified advancing playback. YouTube Music is separate and completed in 5.6s after batched DOM extraction. |
| Default JARVIS Obsidian vault | WORKING | `server/memoryGraph.js` | Idempotency test + live initialization | Uses `%USERPROFILE%/Documents/JARVIS-Vault`; watcher and graph use the same path. |

| Auto MCP external tools | CONFIGURATION_REQUIRED | `server/autoMcpAdapter.js`, `server/registry.js`, `server/toolExecutor.js` | Auto MCP server config | Mocked canonical runtime tests | PASS | Live server credentials/config | Configure Auto MCP and run read-only live verification |
