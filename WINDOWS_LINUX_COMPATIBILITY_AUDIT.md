# Windows → Linux compatibility audit

**Historical baseline:** This document records the 2026-09-21 source audit. The implementation has changed since then. See [CURRENT_CAPABILITIES.md](CURRENT_CAPABILITIES.md) for the verified current status; in particular, browser automation, audio, media, clipboard, and full-desktop screenshot providers now exist.

Audit date: 2026-09-21. Scope: all 131 tracked files, including server, client, tests, package scripts, configuration, documentation, and tracked assets. Generated `dist/`, installed `node_modules/`, and vendored UI/media assets were excluded from source searches. This repository is a Node/React command console, not the earlier Windows desktop controller described in the request. No Win32 native bridge, Python runtime, Electron/Tauri project, Windows installer, service, registry integration, or `.exe`/`.bat`/`.cmd`/`.ps1` script is present in tracked source.

## Observed environment

| Item | Observation |
| --- | --- |
| Distribution | Ubuntu 26.04.1 LTS, x86_64 |
| Kernel | Linux 7.0.0-31-generic |
| Desktop and display | KDE Plasma session, Wayland (`XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-0`); Xwayland `DISPLAY=:0` is also present |
| Shell | `/bin/bash` |
| Runtime | Node 24.21.0, npm 11.19.0, pnpm 12.5.1, Python 3.14.4 installed but unused by this repository; Yarn absent |
| Package management | apt; `flatpak` and `snap` commands installed |
| Init and sandbox | `systemd` tools installed, but PID 1 here is `codex`; `systemctl --user` cannot access the user bus from this execution environment. `systemd-detect-virt` reports `container-other`. This is a restricted Codex execution context inside a host KDE session, not evidence that the application itself is installed as a container, Flatpak, Snap, or WSL app. No `FLATPAK_ID`, `SNAP`, or WSL marker was found. |
| Audio | `pipewire`, `wpctl`, and `pactl` binaries exist. Running audio services and the active sink could not be queried from the restricted session; PipeWire versus PulseAudio server is **UNKNOWN**. |
| Browser | `zen.desktop` is the current default HTTP(S) browser; Firefox and Brave desktop entries also exist. Browser automation is not implemented in this repository. |
| Project dependencies | React 18.3.1, React DOM 18.3.1, Vite 5.4.21, `@vitejs/plugin-react` 4.7.0. No native npm addon is declared. |

## Actual execution path

`server/router.js` routes a few deterministic chat intents. `server/registry.js` lists tools. `server/toolExecutor.js` executes tool IDs. `server/index.js` exposes `/api/tools/execute` with replay/activity persistence and `/api/chat` with Runs. MCP calls also reach the executor. There is **not yet a general model-generated ToolCall validation/permission loop**: HTTP and MCP callers can call `executeTool` directly, and the chat route has several special-case branches. This is an architectural gap to close before adding high-impact desktop input/window actions.

The new `server/platform/` boundary selects Linux or Windows once and implements `apps.list` and `apps.open` behind the existing executor. Linux reads XDG application directories, including exported Flatpak/Snap desktop entries when their export paths are in `XDG_DATA_DIRS`; Windows reads Start Menu shortcuts. Linux delegates launch to `gio launch` with an argument array. Windows delegates shortcut launch to `explorer.exe` with an argument array. Both return `verified: false`: successful launcher handoff does not prove that a window appeared.

## Repository matrix

| Component | Current implementation | Windows dependency | Linux status | Portable? | Replacement / adapter needed? | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Router, model, workflow, Run and telemetry | Node service with deterministic routes and provider APIs | None found | WORKS_AS_IS | Yes | Unify all tool routes under validation and permission before privileged desktop control | High |
| Registry and executor | Central registry, executor, approvals for `command.execute` and Composio writes | `windowsHide` option is harmless on Linux | PARTIALLY_PORTABLE | Yes | Central input schema/permission enforcement remains incomplete | High |
| Desktop app discovery and launch | New OS providers and `apps.list`/`apps.open` | Start Menu `.lnk` provider | PARTIALLY_PORTABLE | Yes | Live launch/window verification, PATH-only applications and unregistered AppImages remain | High |
| Windows provider | New Start Menu shortcut enumeration and Shell handoff | Windows Shell | NOT_TESTED | Through interface | Exercise on Windows CI/host; add native verification | High |
| Linux provider | XDG `.desktop` discovery, ambiguity handling, `gio launch` | None | PARTIALLY_PORTABLE | Through interface | Launcher accepted live requests for Spotify, Discord, VS Code, and Calculator; resulting windows were not verified | High |
| Window list/active/focus/minimize/maximize/restore/close/move/resize | No tools or native bridge exist | None in this repository | NOT_TESTED | Interface planned | KWin provider for this Wayland desktop; separate X11 provider | High |
| Keyboard/mouse/global hotkey | No implementation exists | None in this repository | NOT_TESTED | Interface planned | Consent-based RemoteDesktop portal/input backend; GlobalShortcuts portal; lifecycle/safety tests | High |
| Clipboard and screen capture | No implementation exists; screenshot button is UI text/icon | None in this repository | NOT_TESTED | Interface planned | Wayland portal/desktop API, X11 backend; structured results | High |
| Media and system audio | No player or volume tools exist; browser TTS is separate | None in this repository | NOT_TESTED | Interface planned | MPRIS DBus provider; PipeWire/PulseAudio sink provider with readback | Medium |
| Notifications | No OS notification tool exists | None | NOT_TESTED | Interface planned | Send via freedesktop notifications; receiving/history is a separate capability | Medium |
| Browser opening | `browser.open` produces a UI action for YouTube only; client uses `window.open` | None | LIKELY_WORKS | Yes | Broader URL handling and browser automation are separate work | Medium |
| Process and shell management | Approval-gated `command.execute` uses `execFile` with a whitespace-split string | No Windows commands in source; argument parsing is weak on both OSes | PARTIALLY_PORTABLE | Mostly | Structured executable/argv schema, platform command provider, exact approval binding | High |
| Workspace filesystem | `path.resolve`/`path.join`; project-root reads and generated artifacts | None | WORKS_AS_IS | Mostly | Symlink containment and eventual data-path migration review | Medium |
| State, generated media, credentials | `server/data/` relative to checkout; `.env.local` legacy read | README names a fixed `C:\Users\...` path | PARTIALLY_PORTABLE | Path APIs are portable | XDG data/config/cache destinations on Linux, Windows AppData destination, migration and backup before move | High |
| Credential security | `credentials.env` written with mode `0600`; plaintext env file | No Credential Manager integration found | PARTIALLY_PORTABLE | Yes, with caveats | OS keyring/Secret Service and Windows Credential Manager providers; avoid claiming secure keyring storage today | High |
| Voice activation | Browser SpeechRecognition/MediaRecorder, server HTTP STT/TTS | None | PARTIALLY_PORTABLE | Browser dependent | Separate global shortcut activation and mic permission UX | Medium |
| Build, npm scripts, CI | `vite`/`node --test`; no tracked CI | None | WORKS_AS_IS | Yes | Linux and Windows CI matrix desirable | Medium |
| Line endings and executable bits | No tracked shell/Python scripts or CRLF source files | None | WORKS_AS_IS | Yes | None currently | Low |
| Import case sensitivity | No case-colliding tracked paths; Linux build and tests import successfully | None found | WORKS_AS_IS | Yes | Keep Linux CI to catch regressions | Medium |
| Native dependencies/binaries | No native npm dependency or tracked native executable | None | WORKS_AS_IS | Yes | Future desktop bridges need per-OS packaging | Medium |

## Wayland and X11 capability plan

The statuses below describe **possible backends**, not implemented JARVIS tools. `systemctl --user` cannot reach the KDE user bus from this restricted process; no window/input/capture action was live-tested. The separate `gio launch` command did accept application launch requests. `DISPLAY=:0` does not make X11 automation valid for native Wayland windows.

| Capability | X11 support path | Wayland support path on KDE Plasma | Desktop dependency |
| --- | --- | --- | --- |
| List/active/focus windows | EWMH/X11 window manager API | KWin scripting/plugin API; requires a trustworthy installed bridge | KWin-specific for Wayland |
| Minimize/maximize/restore/close/move/resize | EWMH/X11 window manager API, with state readback | KWin scripting/plugin API with property readback | KWin-specific for Wayland |
| Global keyboard and mouse input | XTest/X11 backend, with key-release cleanup | User-consented RemoteDesktop portal session where supported | Portal backend/compositor |
| Global hotkeys | X11 key grabs with clean teardown | GlobalShortcuts portal with user binding; modifier-only combinations require validation | Portal backend/compositor |
| Screenshot: desktop/window/monitor | X11 capture backend | Screenshot portal or KDE capture API; targets depend on advertised portal version/backend | Portal backend/compositor |
| Clipboard read/write | X11 selections via detected backend | Wayland clipboard protocol/provider with seat access; no `xclip` assumption | Compositor/clipboard manager |
| Notifications | freedesktop DBus notifications | freedesktop DBus notifications | Notification daemon; reading history is not standard send API |

Do not claim support for `Ctrl+Alt`, `Ctrl+Space`, `Alt+Space`, `Super+Alt`, `Super+Shift`, or `Ctrl+Alt+J` until a GlobalShortcuts portal integration has actually registered and reported each binding. Pure modifier triggers may be refused or reserved by the desktop. Do not use `/dev/uinput` permission changes or X11 tools against native Wayland applications as a silent workaround.

## Findings and next implementation order

1. Finish the canonical tool boundary: schema validation, risk/approval enforcement, exact action binding, and Run tool-call records for HTTP, MCP, and chat equally. This must precede keyboard, mouse, power, process termination, or window control.
2. Add a desktop session probe that distinguishes host session capabilities from this restricted execution context. Expose explicit `unavailable` reasons.
3. Implement KWin and X11 window providers with post-action state verification. Keep methods under `platform.windows` and the same assistant-level tool IDs.
4. Add portal-backed input, screenshot, and global shortcut providers with consent, teardown, and state cleanup. Probe each backend before enabling tools.
5. Add MPRIS, audio, clipboard, and notifications providers, each with readback and optional dependency diagnostics.
6. Plan data/config migration with an explicit legacy lookup and atomic copy; preserve Windows installs. Move plaintext credentials only after a tested keyring strategy exists.

Sources for proposed Linux backends: [Desktop Entry Specification](https://specifications.freedesktop.org/desktop-entry/latest-single/), [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/0.8/), [KWin scripting API](https://develop.kde.org/docs/plasma/kwin/api/), [Screenshot portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Screenshot.html), [RemoteDesktop portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html), [GlobalShortcuts portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html), [MPRIS Player interface](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html), and [Desktop Notifications Specification](https://specifications.freedesktop.org/notification/latest-single/).
