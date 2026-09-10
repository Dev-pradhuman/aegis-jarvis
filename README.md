# A.E.G.I.S. JARVIS

Local-first desktop assistant with a React/Vite console, Electron shell, durable runs and workflows, multi-model routing, and one canonical tool runtime.

## Supported platforms

- **Windows 11:** primary, fully supported desktop-control implementation through the existing native PowerShell bridge.
- **Ubuntu 24.04+ / Zorin OS 18+ x86_64:** supported for the application, server, browser automation, files, memory, integrations, application discovery, process inspection, audio/media, and selected desktop controls.
- **Linux X11:** window, keyboard, and pointer control are available when `wmctrl` and `xdotool` are installed.
- **Linux Wayland:** the application works, but compositors intentionally restrict global input injection and arbitrary window control. JARVIS reports `CAPABILITY_UNAVAILABLE` instead of bypassing those controls. Browser DOM automation remains available.

## Architecture

All assistant capabilities use one execution path on both platforms:

```text
text / speech / workflow / MCP
  -> deterministic router or model tool selection
  -> canonical ToolCall
  -> registry and schema validation
  -> permission, risk and exact approval
  -> platform-neutral handler
       -> Windows native adapter
       -> Linux desktop adapter
  -> output validation and tool-specific verification
  -> durable Run, telemetry and idempotency
  -> grounded response
```

OS behavior is centralized under `server/platform/`. Application logic does not invoke PowerShell, `cmd.exe`, or Linux shell strings directly.

## Linux installation

Install Node.js 22.12 or newer and Python 3.10 or newer. Then run:

```bash
chmod +x scripts/setup-linux.sh scripts/dev-linux.sh
./scripts/setup-linux.sh
```

The setup script installs project dependencies locally, creates the optional Needle Python environment, and creates XDG configuration/data/cache directories without overwriting existing configuration.

For the complete Ubuntu/Zorin X11 desktop feature set, install these optional system packages:

```bash
sudo apt update
sudo apt install wmctrl xdotool xclip x11-xserver-utils playerctl wireplumber gnome-screenshot xdg-utils
```

On Wayland, use `wl-clipboard`; wlroots compositors can use `grim` for screenshots:

```bash
sudo apt install wl-clipboard
```

System packages are not installed automatically by the project script.

## Linux launch

Development desktop app:

```bash
npm run dev:linux
```

Or run the services separately:

```bash
npm run dev:server
npm run dev
```

Then open `http://127.0.0.1:5173`. The API listens on `http://127.0.0.1:8787` and Vite proxies `/api` to it.

Build Linux packages:

```bash
npm run dist:linux
```

Outputs are written to `release/` as AppImage and Debian package artifacts. Package installation and desktop-session testing must be performed on Linux.

Optional user-level startup integration is installed explicitly, never automatically:

```bash
./scripts/install-linux-autostart.sh
systemctl --user daemon-reload
systemctl --user enable --now aegis-jarvis.service
systemctl --user status aegis-jarvis.service
```

## Windows launch and packaging

From PowerShell:

```powershell
npm.cmd install
npm.cmd run dev:server
npm.cmd run dev
```

Windows shortcuts remain available:

- `Start JARVIS App.bat` starts Electron.
- `Start Voice OS.bat` starts the development app and Voice OS bridge.
- `Stop Voice OS.bat` stops that controlled development stack.
- `Build Windows App.bat` creates the NSIS installer.

Build directly with `npm.cmd run dist:win`.

## Configuration and data locations

Start from `.env.example`; never commit real credentials.

| Data | Windows | Linux |
|---|---|---|
| Credentials | `server/data/credentials.env` | `${XDG_CONFIG_HOME:-~/.config}/aegis-jarvis/credentials.env` |
| State/profiles/artifacts | `server/data/` | `${XDG_DATA_HOME:-~/.local/share}/aegis-jarvis/` |
| Model cache | runtime default | `${XDG_CACHE_HOME:-~/.cache}/aegis-jarvis/` |

Override these with `JARVIS_CONFIG_DIR`, `JARVIS_DATA_DIR`, and `JARVIS_CACHE_DIR`. Existing Windows locations remain compatible.

Settings -> Credentials supports multiple named provider keys and validates keys with a minimal provider request. Values remain backend-only and are masked. Numbered variables such as `OPENROUTER_API_KEY_1` participate in provider rotation.

## Platform behavior

- Applications are indexed from Windows Start Menu/App Paths or Linux freedesktop `.desktop` registrations, including common Flatpak exports. JARVIS does not scan the whole disk.
- Browser executables are discovered from registered applications and `PATH`; Chrome, Chromium, Firefox, Edge, Brave, and Zen candidates are supported where installed.
- Linux audio uses PipeWire/WirePlumber `wpctl`; media sessions use `playerctl`.
- Linux process memory comes from `/proc` without command lines or environment data.
- Linux clipboard uses `xclip` on X11 or `wl-clipboard` on Wayland.
- Linux X11 automation uses `wmctrl` and `xdotool`. Wayland restrictions are detected and reported honestly.
- Full-desktop screenshots use `gnome-screenshot` or `grim`. Per-window/per-monitor Linux capture is not yet offered because portal/compositor behavior differs.
- Semantic native Linux UI automation is not claimed yet; Windows UI Automation and browser DOM/accessibility automation remain separate capabilities.
- The Windows global Voice OS hook remains Windows-specific. On Linux, focused-app shortcuts work; unrestricted global hooks are not installed or emulated.

## Credentials, contacts, and browser brains

Contacts and connector authentication remain managed in Settings. Persistent Playwright profiles are stored in the platform data directory and are excluded from Git.

ChatGPT Web and Gemini Web are optional consumer-website adapters. They reuse authenticated browser profiles, never automate password/CAPTCHA bypass, and still route every proposed action through JARVIS validation, permissions, approvals, execution, and verification. Authenticate ChatGPT in a visible browser with:

```bash
npm run chatgpt:login
```

Website UI changes or provider security challenges may require manual reauthentication.

## Testing

```bash
npm test
npm run build
node --test tests/platform-linux.test.mjs
```

## Troubleshooting Linux

- `CAPABILITY_UNAVAILABLE` for windows/input on Wayland: log into an Xorg session for global automation, or use browser DOM automation.
- `CONFIGURATION_MISSING` naming `wmctrl`, `xdotool`, `wpctl`, `playerctl`, `xclip`, or `wl-copy`: install the corresponding optional package above.
- Browser not found: install a supported browser system package and confirm its executable is on `PATH`.
- Electron fails in a headless terminal: launch from a graphical desktop session with `DISPLAY` or `WAYLAND_DISPLAY` set.
- Port 8787 is in use: stop the existing JARVIS server rather than starting a duplicate.
- Browser authentication is lost: rerun the relevant headed login flow; do not copy cookies manually.

See [docs/JARVIS_PLATFORM_ARCHITECTURE.md](docs/JARVIS_PLATFORM_ARCHITECTURE.md) for the exact capability matrix and implementation details.

## Safety boundaries

- Side effects use exact, expiring, one-use approvals.
- File operations remain inside configured workspace boundaries.
- Commands use structured `execFile`/argument arrays; shell operators and option injection are rejected.
- External webpage, message, document, and screen content is treated as untrusted data.
- Sensitive tool arguments/outputs are redacted from persisted Runs and logs.
- Runtime state, credentials, browser profiles, cookies, generated output, and package artifacts are ignored by Git.
