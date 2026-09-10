# JARVIS Platform Architecture

## Scope

JARVIS supports Windows 11 and targets Ubuntu 24.04+/Zorin OS 18+ x86_64. The canonical registry, executor, policy, approvals, workflows, model routing, memory, connectors, and frontend are platform-neutral. Only operating-system operations branch through `server/platform/` and the pre-existing Windows native bridge.

## Runtime path

```text
request
  -> router/model/workflow/MCP
  -> canonical ToolCall
  -> schema + availability + authentication + policy
  -> canonical executor
  -> platform-neutral capability module
  -> desktopBridge
       -> Windows: windows/desktop-native.ps1
       -> Linux: server/platform/linuxDesktop.js
  -> result validation + verification
  -> Run/telemetry/idempotency
```

There is no second Linux tool registry and no Linux-side permission bypass.

## Platform modules

- `server/platform/common.js`: command discovery, structured subprocess execution, timeouts, display-server detection, structured platform errors.
- `server/platform/paths.js`: XDG config/data/cache paths while retaining legacy Windows locations.
- `server/platform/browserExecutable.js`: Chrome/Chromium/Firefox/Edge/Brave/Zen discovery without fixed Windows-only paths.
- `server/platform/linuxDesktop.js`: freedesktop application indexing, `/proc`, X11 windows/input, PipeWire audio, MPRIS media, clipboard, screenshots, and capability detection.
- `server/platform/index.js`: platform dispatch and truthful capability report.
- `server/platformDesktop.js`: cross-platform app and external-URL launch facade.

## Windows dependency audit

The following Windows-specific components are deliberately retained behind the Windows branch:

- `windows/desktop-native.ps1`, `DesktopInput.cs`, and `AudioControl.cs`: Win32 window/input/screen/audio bridge.
- `windows/voice-os-bridge.ps1`: observational global shortcut bridge.
- `server/windowsDesktop.js`: Start Menu, App Paths, registered-browser, process/window launch verification.
- Windows `.bat` development/package launchers and PowerShell-only verification fixtures.

Platform-neutral modules no longer assume `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `Program Files`, `.exe`, PowerShell, or backslash-only paths. Browser transport modules use shared executable discovery. Windows references remaining in the repository are either inside those adapters, Windows tests/scripts, packaging metadata, or documentation.

Dependencies are categorized as follows:

- Cross-platform: React, Vite, Electron, Playwright Core, document parsers, Node built-ins.
- Windows-only runtime: PowerShell bridge and dynamically compiled Win32 C# helpers; no npm package is installed conditionally on Linux for these.
- Linux optional integration: system commands discovered at runtime (`xdg-open`, `gio`, `wmctrl`, `xdotool`, `wpctl`, `playerctl`, `xclip`/`wl-copy`, `gnome-screenshot`/`grim`). Missing commands produce configuration errors.
- Local optional model: Python Needle environment uses `.venv-needle/Scripts/python.exe` on Windows and `.venv-needle/bin/python` on Linux.

## Linux capability matrix

| Capability | X11 | Wayland | Implementation / limitation |
|---|---:|---:|---|
| Web/server/Electron UI | Supported | Supported | Electron/Vite/Node |
| Files, memory, workflows, connectors, MCP | Supported | Supported | Platform-neutral Node APIs |
| App discovery/open | Supported | Supported | freedesktop entries, Flatpak exports, `gio`/direct executable |
| Default URL opening | Supported | Supported | `xdg-open`, HTTP(S) only |
| Managed browser DOM automation | Supported | Supported | Playwright/CDP; browser must be installed |
| Process/RAM listing | Supported | Supported | `/proc`, read-only |
| Volume/mute | Supported | Supported | `wpctl` |
| Media sessions | Supported | Supported | `playerctl`/MPRIS |
| Clipboard text | Supported | Supported | `xclip` / `wl-clipboard` |
| Full-desktop screenshot | Supported | Partial | `gnome-screenshot`; `grim` on wlroots Wayland |
| Window list/focus/state | Supported | Unsupported | `wmctrl`/`xdotool`; arbitrary Wayland control intentionally blocked |
| Global keyboard/pointer injection | Supported | Unsupported | `xdotool`; no Wayland security bypass |
| Native semantic UI tree | Unsupported | Unsupported | AT-SPI adapter not implemented; browser DOM remains available |
| Global Voice OS hook | Unsupported | Unsupported | Current native press/release hook is Windows-only |
| Per-window/per-monitor capture | Unsupported | Unsupported | Requires compositor/portal-specific implementation |

Unsupported operations return structured errors such as `CAPABILITY_UNAVAILABLE` or `CONFIGURATION_MISSING`; they are never reported as successful.

## Application discovery

Linux applications are indexed from XDG application directories plus user/system Flatpak export directories. Only `.desktop` files are scanned. `Exec` field codes are removed and processes are launched with argument arrays, not shell strings. Alias scoring and ambiguity checks are shared with Windows.

## Filesystem layout

Linux follows XDG Base Directory conventions:

- config: `${XDG_CONFIG_HOME:-~/.config}/aegis-jarvis`
- data: `${XDG_DATA_HOME:-~/.local/share}/aegis-jarvis`
- cache: `${XDG_CACHE_HOME:-~/.cache}/aegis-jarvis`

`JARVIS_CONFIG_DIR`, `JARVIS_DATA_DIR`, and `JARVIS_CACHE_DIR` override these locations. Windows retains `server/data` for backward compatibility and packaged Electron continues to set its per-user application-data location.

## Verification semantics

- Application launch requires an observed matching Linux process.
- Window actions reread X11 window state; maximize/minimize state is inspected through EWMH properties when available.
- Audio mutations reread the default sink.
- Screenshots validate the PNG signature and dimensions before persistence.
- Clipboard writes read the content back.
- Browser automation continues to verify DOM/navigation/media state in its existing adapter.
- `xdg-open` can only acknowledge dispatch to the registered handler; it does not prove a rendered page. Higher-assurance web actions should use the managed browser.

## Packaging and services

`npm run dist:linux` produces AppImage and Debian targets via Electron Builder. `scripts/setup-linux.sh` performs local project setup without `sudo`. `scripts/install-linux-autostart.sh` installs a user systemd unit only when invoked explicitly; enabling it remains a user choice.

## Security

- No command is constructed through a shell string.
- URLs are restricted to HTTP(S), reject embedded credentials, and are passed as a single process argument.
- Linux automation does not weaken Wayland or install privileged services.
- Runtime profiles, cookies, credentials, state, generated graphs, and package artifacts are ignored.
- Platform capability detection is visible in `/health` and diagnostics.

## Validation status

Ubuntu 24.04 WSL validation completed a clean `npm ci`, production Vite build, 18 focused canonical/platform tests, exact-case import check, Bash syntax check, backend startup/health probe, and Electron Builder AppImage plus Debian packaging. The Windows host regression suite passes 292 tests. GUI-level X11/Wayland actions and installed-package launch still require a real Ubuntu/Zorin graphical session; this distinction is retained in the migration report.
