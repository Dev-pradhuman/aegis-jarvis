# JARVIS Auto MCP

Auto MCP is an optional external MCP tool provider for JARVIS. It does not replace the canonical JARVIS runtime. Imported Auto MCP tools are mapped into the existing canonical registry and still pass through schema validation, permission policy, approvals, idempotency, execution telemetry, run history, output validation, and verification.

## Configuration

Set these in the normal JARVIS credentials/config file or environment:

```env
AUTO_MCP_ENABLED=true
AUTO_MCP_TRANSPORT=stdio
AUTO_MCP_COMMAND=<auto-mcp-command>
AUTO_MCP_ARGS=
AUTO_MCP_URL=
AUTO_MCP_ALLOWED_TOOLS=
AUTO_MCP_BLOCKED_TOOLS=
AUTO_MCP_TIMEOUT_MS=15000
```

Use `AUTO_MCP_TRANSPORT=http` with `AUTO_MCP_URL` for JSON-RPC HTTP endpoints. Use `stdio` with `AUTO_MCP_COMMAND` and optional comma-separated `AUTO_MCP_ARGS` for local MCP processes.

## Runtime Flow

1. `auto_mcp.refresh` connects to Auto MCP and imports `tools/list` schemas.
2. Each external tool is namespaced as `auto_mcp.<original_name>`.
3. The canonical registry exposes the imported definitions to routers/model tool filtering.
4. The canonical executor handles validation, permission checks, approvals, timeout, execution, verification, Runs, and telemetry.
5. The Auto MCP adapter calls the original MCP `tools/call` only after JARVIS policy permits it.

## Risk Mapping

- `read`, `list`, `search`, `get`, `fetch`, `status` -> `READ_ONLY`
- `create`, `update`, `edit`, `write`, `draft`, `schedule` -> `PROJECT_WRITE`
- `send`, `post`, `email`, `message`, `invite`, `share`, `upload` -> `EXTERNAL_ACTION`
- `delete`, `remove`, `archive`, `payment`, `security`, `password`, `token` -> `DESTRUCTIVE`
- unknown tools default to `PROJECT_WRITE`

Side-effecting imported tools require normal JARVIS approval unless the centralized permission mode allows them. Validation, idempotency, telemetry, and audit logging are never skipped.

## Filtering And Duplicates

Imported tools keep `provider: auto_mcp` and `originalMcpName` metadata. Tool names are namespaced to avoid collisions with first-party tools; first-party tools should remain preferred by normal capability selection. `AUTO_MCP_ALLOWED_TOOLS` and `AUTO_MCP_BLOCKED_TOOLS` can limit imported tools by original name or namespaced ID.

## Security

Auto MCP descriptions and results are treated as untrusted external data. JARVIS does not log secrets, cookies, OAuth tokens, passwords, OTPs, or private credentials. Models never call Auto MCP directly; they request canonical JARVIS tool calls.

## Verification Status

The adapter is mock-testable without external credentials. Live verification requires a configured Auto MCP server. Safe live verification should call `auto_mcp.refresh`, inspect `auto_mcp.status`, and execute one read-only imported tool only.
