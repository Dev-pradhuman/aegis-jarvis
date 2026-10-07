# Phase 2 Independent Audit Report

## 1. Build and Test
Fresh `npm ci`, `npm test`, `npm run build`, and `npm run smoke` were executed. All tests and builds passed successfully.

## 2. Latency Honesty
Live benchmarking (`node scripts/bench-brain.mjs --live`) was attempted. However, the local Ollama instance was not reachable. Therefore, real latency metrics (TTFB, total time) could not be recorded. Latency is marked as **unproven**. Mocked benchmarks executed successfully but are ignored per instructions.

## 3. Push Audit
An audit of the `origin/phase2-brain` push was conducted:
- `git ls-files server/data` confirmed the directory is empty.
- Pushed files include documentation, platform integrations (Linux/Windows), neural brain components, media tools, orchestrator core, and test files.
- The reflog and commit history were scanned for secrets. No actual secrets were pushed (only dummy variables used in tests like `ak_project_test`, `ck_consumer_test`, `TEST_API_KEY`, etc. were found).

## 4. Test Evidence (Phase 2 Features)
- **SSE Streaming**: No specific tests found in the test suite. (Gap)
- **State Migration**: No specific migration tests found. (Gap)
- **Origin/Host/Referer Security**: Tested and verified. Covered by tests mapping to `local API accepts local frontend origins and rejects foreign origins and hosts` (including Origin, Host header rebinding, and Referer requirement tests). Mutating `server/requestSecurity.js` correctly failed the tests.
- **Warm-up**: No specific tests found. (Gap)
- **Telemetry**: Tested and verified. Covered by `Run token telemetry does not double-count output tokens`. Mutating the token usage calculation in `server/runEngine.js` correctly failed the test.
- **Context Budget**: Tested and verified. Covered by `context budget reserves space for the current request and tool results` and `model requests use a bounded output-token budget`. Mutating context calculation in `server/contextAssembler.js` correctly failed the test.
- **Dependency Injection Seams**: Tested and verified. Covered heavily in provider/routing tests via `fetchImpl` mock injections (e.g., `Brain pool rotates on 429`, `Ollama pool uses native non-thinking chat`). Removing the injected mock usage in `server/modelPool.js` correctly triggered widespread network test failures.

## 5. Migration Review (`server/store.js`)
State migration review confirms:
- **Makes a Backup**: Yes. It reads the raw file and atomically writes a backup (`writeJsonAtomically(backupFile, ...)`).
- **Writes Atomically**: Yes. The final migrated state is saved atomically (`writeJsonAtomically(file, parsed)`).
- **Is Idempotent**: Yes. It explicitly identifies out-of-date configurations (e.g., older model aliases) and flags `needsMigration`. Running it on an already migrated file resolves `needsMigration` to `false`, effectively making it idempotent.
- **Covered by Tests**: No. The current test suite (e.g. `tests/store-security.test.mjs`) tests basic file writing but lacks old-format state files to test migration paths.

## 6. Warm-up Review (`server/brainService.js`)
The `warmUpLocalModels` function implements the warm-up procedure:
- **Under `node --test` / CI**: It safely bails out. It specifically checks `process.env.NODE_ENV === 'test'`, `process.env.CI`, and `process.argv` for `--test`, returning immediately if found.
- **Outbound Requests / Restricted Providers**: It strictly filters the source catalog for `source.type === 'LOCAL'`. It makes no outbound external requests, guaranteeing it does not violate provider restrictions or cost boundaries.

## 7. Lost Live Evidence
According to `git log -p` on `server/capabilityStatus.js` and `docs/CURRENT_CAPABILITIES.md`, the capabilities marked `WORKING_LIVE` prior to Phase 2 are:
1. `service.local` (Local authenticated capability request reached service)
2. `approvals.continuation` (Exact approvals and idempotency - Live command approval resumed same Run)
3. `reminders.local` / `scheduler.reminders` (Native one-time reminders)
4. `brain.local` (Local answer completed)

## G1 Mutation Check (Phase 3 Gate)
- **SSE streaming fix**: Reverted the `isSSE` scoping fix in `server/routes/chat.js` and confirmed that `tests/sse-streaming.test.mjs` successfully caught the bug and failed.
- **Migration backup/atomic-write**: Removed `writeJsonAtomically(backupFile, ...)` from `server/store.js` and confirmed that `tests/store-migration.test.mjs` caught the missing backup and failed.
- **Warm-up guard**: Removed `NODE_ENV === 'test' || CI` check from `server/brainService.js` and confirmed `tests/warmup-guard.test.mjs` caught the missing guard and failed.

### Secret Scan
Scanned `origin/phase2-brain` pushed history for secrets. No API keys, tokens, or credentials were found in the history.
