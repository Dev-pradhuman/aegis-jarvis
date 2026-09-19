# JARVIS Linux Continuation Mission

Continue development of the existing JARVIS repository on a Linux laptop. Do not
rebuild the assistant or create a parallel architecture. Preserve the canonical
runtime and continue from the verified repository state.

## Repository state

The repository is on branch `linux-port`. The latest important commit is:

`a585e77 feat: integrate optional Auto MCP provider`

Read these files before editing, without repeating the completed broad audit:

- `docs/JARVIS_ARCHITECTURE_AUDIT.md`
- `docs/JARVIS_CAPABILITY_MATRIX.md`
- `docs/JARVIS_CONNECTION_STATUS.md`
- `docs/JARVIS_TOOL_REGISTRY.md`
- `docs/JARVIS_FIX_LOG.md`
- `docs/JARVIS_SECURITY_MODEL.md`
- `docs/JARVIS_AUTO_MCP.md`

## First Linux commands

```bash
git status --short
git branch --show-current
git log --oneline -10
node --version
npm --version
npm install
npm test
npm run build
```

Do not commit `.env`, API keys, cookies, browser profiles, tokens, passwords,
`node_modules`, build output, or runtime caches.

## Non-negotiable execution architecture

All capabilities must use this path:

```text
input -> router/model -> canonical ToolCall -> registry -> schema validation
-> permission/risk policy -> approval -> canonical executor -> timeout/retry/idempotency
-> output validation -> verification -> Run/telemetry -> grounded response
```

Do not create separate executors or registries for Linux, Auto MCP, ChatGPT, Gemini,
workflows, browser automation, messaging, voice, or desktop control. Models only
propose actions. JARVIS validates and executes them. Never claim an action happened
without execution evidence and verification.

## Verified baseline

- Canonical tool registry and executor exist.
- Structured model tool calling exists.
- Workflows execute real tools.
- Permissions, approvals, retries, verification, idempotency, Runs, and telemetry exist.
- MCP HTTP/stdio adapters map into canonical execution.
- Auto MCP is implemented in `server/autoMcpAdapter.js`.
- Auto MCP configuration and documentation exist.
- Auto MCP tests exist in `tests/auto-mcp-adapter.test.mjs`.
- Previous full result: 299 tests passed and production build passed.
- Auto MCP live verification is configuration-dependent; do not call it live-working
  until a real configured read-only tool has executed.

## Linux migration mission

Make Linux first-class while preserving Windows behavior. Inspect the actual code
before changing it. Locate the backend, frontend, desktop entrypoint, browser runtime,
voice/hotkey code, registry, executor, config loader, persistence, and scripts.

Create or extend platform adapters for:

- application discovery and launching;
- process listing and safe termination;
- active windows and window management;
- keyboard and mouse capabilities;
- clipboard and screenshots;
- notifications, audio, volume, and media;
- browser executable discovery;
- filesystem/config/cache/data locations;
- startup/background services;
- shell and process execution.

Use portable path APIs. On Linux prefer XDG paths such as `~/.config`,
`~/.local/share`, and `~/.cache`. Never hard-code `/home/<username>` or Windows paths.
Detect X11 versus Wayland. If Wayland or another compositor restricts a capability,
return a structured capability error instead of pretending it worked.

Prioritize:

1. dependency and path portability;
2. platform abstraction and capability detection;
3. dynamic app discovery and safe launching;
4. process/window APIs;
5. clipboard, screenshots, audio, notifications, browser launching;
6. hotkeys and voice activation where supported;
7. browser/media control;
8. memory, documents, communications, research, notifications, automations;
9. security, performance, packaging, and end-to-end verification.

Do not stop because one integration needs credentials. Implement independent work and
mark external blockers honestly.

## Auto MCP

Keep Auto MCP optional and behind the canonical executor. Its tools must be namespaced,
schema-validated, risk-classified, permission-checked, approval-bound, idempotent,
observable, timeout-controlled, and normalized into JARVIS results. One broken MCP
server must not crash JARVIS. Filter tools by request relevance instead of exposing
the entire discovered registry to every model request.

Relevant configuration includes:

- `AUTO_MCP_ENABLED`
- `AUTO_MCP_TRANSPORT`
- `AUTO_MCP_COMMAND`
- `AUTO_MCP_ARGS`
- `AUTO_MCP_URL`
- `AUTO_MCP_ALLOWED_TOOLS`
- `AUTO_MCP_BLOCKED_TOOLS`
- `AUTO_MCP_TIMEOUT_MS`

## Headless brains

ChatGPT and Gemini are replaceable reasoning backends, not tool authorities. Preserve
persistent authentication, session isolation, structured tool calls, streaming,
approval pause/resume, and recovery. Never log cookies or tokens.

The JARVIS ChatGPT target must remain:

`https://chatgpt.com/g/g-p-6a9ed38ea1c8819182eb991a96e4fc1c-jarvis-chat/c/6aa171a5-72fc-83e8-ac5f-1a3b70424a6a`

## Testing requirements

For every change:

1. identify the root cause;
2. implement the smallest architectural fix;
3. add focused tests;
4. run focused tests;
5. run the full suite after the batch stabilizes;
6. run the production build;
7. run `git diff --check`;
8. inspect the final diff for secrets, generated files, accidental deletions, and
   Windows regressions.

Use safe read-only live checks first. Do not send real messages/emails, delete data,
or perform destructive actions merely to prove functionality.

Use only honest statuses:

`WORKING`, `PARTIALLY_WORKING`, `CONFIGURATION_REQUIRED`,
`EXTERNAL_PLATFORM_LIMITATION`, `UNVERIFIED`, or `BROKEN`.

## Documentation and final report

Update the existing audit, capability, connection, tool-registry, security, fix-log,
and Auto MCP documents. Add Linux setup, launch, package, X11/Wayland, and
troubleshooting instructions.

Final report must include:

1. Linux audit and detected architecture;
2. files changed;
3. platform abstraction and Linux implementations;
4. Windows functionality preserved;
5. Linux working/partial/blocked/unverified capabilities;
6. exact test/build commands and results;
7. Auto MCP configuration and live status;
8. security and secret-scan result;
9. remaining manual steps only.

Do not claim Linux is fully supported until it has been tested on an actual Linux
environment. Continue implementing independent capabilities instead of stopping after
writing a report.
