# Current JARVIS capability record

Verified through 2026-09-26 on Ubuntu 26.04.1, KDE Plasma Wayland. This record distinguishes a working local implementation from a configured external account or a mock-only protocol. Run `npm test`, `npm run build`, and `npm run dev` to repeat the local checks. The historical Windows/Linux source audit is in [WINDOWS_LINUX_COMPATIBILITY_AUDIT.md](WINDOWS_LINUX_COMPATIBILITY_AUDIT.md).

| Capability | Status | Implementation and evidence | Blocker / next requirement |
| --- | --- | --- | --- |
| Galaxy default and legacy UI | WORKING | Galaxy at `/`, legacy console at `/legacy`; prior live hardware WebGL and camera QA | Continue visual regression checks on hardware |
| Local service startup and login | WORKING | `npm run dev` starts service and Vite with or without an auth token; live 401 → login cookie → authenticated health test; login screen inspected in Firefox | Remote access is not enabled by default |
| Registry, schema validation, canonical HTTP action runtime | PARTIAL | Contract tests cover every advertised handler; exact input validation, output envelope validation, approvals, and idempotency tested. Deterministic chat, model read tools, tasks, workflows, and inbound MCP now use the request runtime; live chat Runs record completed/failed tool steps. | Tool-specific output schemas and remaining legacy direct API actions still need unification |
| Exact approvals and idempotency | WORKING for canonical tool requests | Tests cover tool/arguments/Run/expiry/one-use and concurrent duplicate requests; unknown external outcomes are not blindly retried | Extend equivalent guarantees to all legacy direct actions before adding privileges |
| Inbound MCP tools | PARTIAL | HTTP and stdio advertise actual registry input schemas and only a bounded read-only set; calls now enter canonical runtime | Mutating MCP action flow and outbound stdio/SSE MCP clients remain |
| Model tool calling | PARTIAL | Native function calls execute bounded read-only canonical tools, return results to model, and continue; tests use provider-shaped responses | Configured provider live test and approved mutating tool continuation remain |
| Workflows | PARTIAL | Structured tool steps run through canonical runtime; observed results and approval resume are tested | Cancellation during an executing step and more complex dependency graphs remain |
| Demo data removal | WORKING | Empty new state; known demo tasks, approvals, workflows migrated out of persisted state | Some legacy UI decorative sample content still needs audit |
| BrowserManager | PARTIAL | Lightpanda primary and Firefox fallback, human challenge handoff, lifecycle tests pass | Site-specific reliability and real user session QA vary by site |
| Linux applications | PARTIAL | XDG desktop discovery and unambiguous launcher handoff tested | Launch does not prove resulting window exists; no active window provider |
| Windows applications | UNVERIFIED | Start Menu provider and tests exist | Needs a Windows host/CI run |
| Linux audio | WORKING | PipeWire volume read live; set/mute provider has readback tests | Mutations not made during live QA to avoid changing user's audio |
| Linux media | WORKING | MPRIS SimpMusic status live; player control has mocked readback tests | Live control mutation not exercised |
| Linux clipboard | PARTIAL | KDE Klipper read live; write and fallback providers tested | Live write not exercised to avoid changing clipboard |
| Desktop screenshot | WORKING for full desktop | KDE Wayland XDG screenshot portal captured a real 1920×1200 image; private temp copy; cancellation test | Window/monitor targets unavailable with current portal v2; user consent may be requested |
| Linux keyboard input | PARTIAL | XDG RemoteDesktop portal helper, single-session Node provider, deterministic chat commands, modifier cleanup, opt-in auth gate, exact approval with resume, and idempotency tests pass | Live consent and focused-app typing have not been verified; portal dispatch cannot prove final app effect or bind an active window |
| Mouse input | NOT_IMPLEMENTED | Capability probe reports unavailable | Portal pointer methods, bounded coordinates, focused-app verification, and live QA |
| Window control | NOT_IMPLEMENTED | Capability probe reports unavailable | KWin Wayland adapter with state readback; separate X11 adapter |
| Global hotkeys | NOT_IMPLEMENTED | No reliable Linux registration exists | GlobalShortcuts portal integration and conflict tests |
| Screen/camera vision | NOT_IMPLEMENTED | Desktop capture exists but no vision analysis path | Vision model adapter, grounded context and permission UX |
| Remote second laptop | NOT_IMPLEMENTED | Paired device event protocol exists, not a remote desktop host | Encrypted authenticated capability-scoped host agent and second machine QA |
| Tasks | WORKING | Persisted canonical create/update/list; tests and live API | Reminders and calendar are separate |
| Reminders and morning briefing | NOT_IMPLEMENTED | No actual reminder firing or source aggregation | Scheduler-backed implementation and source connectors |
| Calendar, Gmail, Instagram, Edunext | CONFIGURATION_REQUIRED or NOT_IMPLEMENTED | Calendar/Gmail/Instagram adapters require accounts; Edunext adapter absent | Provider credentials, supported API access, Edunext specification |
| Research and media | PARTIAL | Grounded source planning and configured media generator adapters exist | Research synthesis and end-to-end source→media workflow remain |
| Android/SIM calls/WhatsApp | NOT_IMPLEMENTED | Device event/pairing foundation and UI status exist; no phone companion or real control | Android app, user-granted roles, supported WhatsApp integration |
| Smart room/robot | NOT_IMPLEMENTED | Generic hardware endpoint deliberately cannot execute arbitrary commands through API | Capability-scoped authenticated device protocol and safe mock hardware tests |

**Daily-use readiness:** PARTIAL. Local UI, browser, task, application discovery, audio/media status, clipboard read, and screen capture work. Opt-in keyboard input is implemented but not live verified. The requested open → type → Enter → second laptop → grounded screen-understanding acceptance path does not yet pass: window/action verification, remote host, and vision are missing. No phone or hardware action is claimed as working.
