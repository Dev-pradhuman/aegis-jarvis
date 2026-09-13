# JARVIS Security Model

## Capability enforcement

Every assistant capability resolves through the canonical executor: schema validation, configuration/availability, caller permissions, risk classification, exact approval, bounded execution, output validation, verification, audit telemetry, and idempotency.

Approvals bind tool ID, normalized argument fingerprint, Run, step, ToolCall, caller, optional session, and expiry. They are single-use. Mutated, expired, cross-context, and replayed approvals fail before side effects.

## Local boundaries

- Server binds to loopback by default. LAN binding is refused unless phone-LAN opt-in, a JARVIS auth token, and a 32+ character phone master key are all configured.
- Cross-origin wildcard headers were removed. The Vite development UI uses a same-origin proxy.
- JSON bodies are bounded to 2 MB and invalid JSON is rejected structurally.
- State writes use a serialized queue and atomic replacement.
- The Electron renderers use sandboxing, context isolation, and no Node integration.

## Data and injection safety

Secrets stay in `server/data/credentials.env`, never frontend state. Registry metadata identifies sensitive input/output; logs and Runs redact key/token/password/secret/cookie/OTP-like fields. Files use realpath confinement and reject protected roots/symlink escape. Commands use `execFile` argument arrays and reject shell metacharacters. URLs accept only HTTP(S) without embedded credentials. External content is marked untrusted.

## Known boundaries

The optional bearer token is local shared-secret authentication, not multi-user identity. The phone protocol adds AES-256-GCM payloads, HMAC-SHA256 request authentication, expiry, nonces, and replay receipts, but requires a compatible companion. Native input must obey Windows foreground restrictions; the implementation does not reset physical modifier/lock state.

Dependency verification on 2026-09-06 after upgrading Electron 44.2.0, Vite 8.2.2, and fflate 0.8.3 reported zero known npm vulnerabilities.
