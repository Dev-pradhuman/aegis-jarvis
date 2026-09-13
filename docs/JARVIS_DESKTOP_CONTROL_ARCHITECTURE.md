# Desktop control: Windows and Linux implementation status

> Linux port update (2026-09-10): the canonical desktop tools now dispatch through a platform layer. Windows keeps its existing native bridge. Linux uses freedesktop application entries, `/proc`, PipeWire/MPRIS, Linux clipboard/screenshot utilities, and X11-native window/input tools. Wayland restrictions are detected and returned explicitly. See `JARVIS_PLATFORM_ARCHITECTURE.md` for the Linux matrix.

> Completion update (2026-09-06): discovery, application lifecycle, windows, clipboard, screen, Core Audio, pointer, keyboard, media, and UI Automation are integrated into the canonical executor. Current evidence and limitations are authoritative in `JARVIS_CAPABILITY_MATRIX.md`.

## Execution path

Text/voice router or model -> canonical registry -> validation/policy/approval -> `toolExecutor.js` -> desktop modules -> platform dispatcher -> Windows `desktop-native.ps1` or Linux adapter -> observed result -> verifier -> Run.

No new HTTP side-effect endpoint or independent desktop tool registry was added. `system.app.open` remains the compatibility name for generic installed-app opening.

## Discovery and launch

`applicationIndex.js` caches discovery for five minutes and shares an in-flight refresh. Sources are Get-StartApps (including packaged apps), the two Start Menu shortcut directories, HKCU/HKLM App Paths (including WOW6432Node), and Windows' registered `StartMenuInternet` browsers. It does not scan the whole disk. Known portable executables without registration are not discovered automatically.

Names are normalized; VS Code aliases resolve to Visual Studio Code, not Visual Studio. Low-confidence/duplicate matches return APP_AMBIGUOUS. Paths and shell arguments are not accepted as app-name commands. Shortcuts with executable targets are indexed; registered shortcut arguments are retained by Windows shell launching.

Normal URL commands use the Windows default handler. An explicitly named browser is resolved from the browser-only subset of the app index, preventing a non-browser executable from receiving a URL.

Launch requires the same matching HWND/PID in two native observations. Executable path or application-user-model ID must match. Successful spawn alone is insufficient. A transient Calculator startup window exposed this need during live testing. Apps whose visible window is hosted under another identity may fail verification honestly.

## Windows

Win32 EnumWindows returns handles, process IDs, executable/app IDs where accessible, title, foreground/minimized/maximized state. Focus uses SetForegroundWindow and respects Windows focus restrictions. Minimize/maximize/restore use ShowWindowAsync. Close sends WM_CLOSE, never force-kills. An unsaved-document dialog or remaining window causes verification failure.

**Verified live:** Notepad launch, minimize, restore, and approved close of the window created by the controlled test. Representative wall times: windows.list 602 ms; cold apps.search 2052 ms; launch 3162 ms; minimize 1364 ms; restore 1363 ms; approved close 1308 ms. These include a fresh PowerShell process per bridge call. They are not low-latency targets yet.

## Input and privacy

`DesktopInput.cs` uses a correctly sized INPUT union (40 bytes on this x64 host), Unicode keyboard events, paired releases, SendInput return checks, and checks that modifiers are released and Caps Lock is unchanged. It never synthesizes Caps Lock. Keyboard calls require approval plus an exact, already-focused window handle/PID. Native delivery confirmation is not proof that an application applied the desired edit/shortcut.

The disposable WinForms target received the exact mixed-case Unicode string, independently checked by its text-change hash. The full typing/shortcut sequence remains PARTIALLY_WORKING: live runs exposed a PowerShell `ushort[]` cast error (fixed to `uint16[]`), then focus rejection and a shortcut effect that did not match the fixture's expected text replacement. The fixture now observes explicit Ctrl+A events; a subsequent run was blocked by Windows foreground restrictions before input. Caps Lock ON/OFF and complete compound-shortcut effects are still UNVERIFIED. Native delivery checks are not being substituted for those tests.

Clipboard read/write require approval. Clipboard read output is transient in the executor: raw text is not included in tool Run output or idempotency records. Pending write approvals necessarily retain their bound action until resolution; consumed sensitive action arguments are redacted. Model-authored replies may still quote content and require a broader retention review. Clipboard live read/write/restore tests remain UNVERIFIED.

Payloads travel through stdin, not command-line arguments. Native stderr is not printed. The bridge has execution/output limits and explicit error codes. It uses per-process DPI awareness for pointer/display coordinates. Mouse position/move and display topology are implemented; live pointer mutation is UNVERIFIED. The native topology call was verified on one 1920x1200 monitor; multi-monitor/DPI edge cases remain UNVERIFIED. Mouse clicks/drag, audio and media are not implemented by this module yet.

Screenshot capture supports desktop, an exact monitor ID, or a visible window rectangle bound to HWND/PID. It requires approval and writes a unique local PNG artifact after header/dimension validation, then reads it back for SHA-256 verification. A live canonical test produced a 1920x1200 PNG (33,871 bytes, 1,029 ms) in the original Run and deleted the controlled temporary artifact afterward. This proves native capture/file persistence, not vision interpretation or occluded-window reconstruction. The production artifact root is JARVIS_DATA_DIR/screenshots (default server/data/screenshots). Screenshot display/download UI is not yet added.

The existing Voice OS hook remains observational. Its dictation INPUT union was corrected and rejected input now emits `dictation.input_failed`. Its existing dictation queue still needs migration to canonical input execution during the voice phase.

## Evidence and limits

- `scripts/verify-desktop.mjs`: opt-in controlled native execution, no external provider.
- `scripts/verify-native-build.ps1`: compiles both native input implementations and checks 40-byte layout without injecting keyboard events.
- `scripts/verify-input.mjs` and `scripts/input-test-window.ps1`: disposable real target that reports text hashes and received shortcut events; requires an uninterrupted foreground desktop. The target process is stopped in finally; no user document is edited.
- `scripts/verify-screen.mjs`: real approved native screenshot, PNG/file verification, exact controlled temporary cleanup.
- `tests/desktop-control.test.mjs`: ambiguity, identity, observed state, canonical Runs, chord validation, clipboard approval/privacy and input verification failure.
- Elevated windows, another user session, secure desktop, protected apps and missing native access can block control. No bypass is attempted.

References: [Get-StartApps](https://learn.microsoft.com/en-us/powershell/module/startlayout/get-startapps), [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow), [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput), [INPUT structure](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-input).
