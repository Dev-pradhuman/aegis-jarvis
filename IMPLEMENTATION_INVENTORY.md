# A.E.G.I.S. v1 implementation inventory

## Baseline

- Client: React 18 + Vite (`src/`), with the central knowledge graph iframe and a real Three.js/MediaPipe neural-brain surface.
- Service: Node HTTP service (`server/`) on `127.0.0.1:8787`; Vite proxies `/api` during development.
- Persistence: local JSON state in `server/data/state.json` (tasks, approvals, activity).
- Tests: Node's built-in test runner; production build via Vite.

## Phase status

| Phase | Status | Evidence / limitation |
| --- | --- | --- |
| 0 Repository audit | Complete | Inventory, baseline tests/build, API boundary documented |
| 1 Core foundation | Functional but limited | JARVIS service, health, capability/tool registry, env-backed logical-model provider pools, structured errors, Run/orchestrator boundary, adaptive deterministic router, DeepSeek default, specialist selection, same-model API rotation, and GLM terminal fallback |
| 2 Tasks/execution/activity | Partial | Durable task CRUD, persisted chat history/usage, approvals/activity, structured Runs and plans; richer autonomous execution remains |
| 3 Tools/files/safe computer ops | Partial | Workspace inspection, bounded file reads, normalized tool results, path containment, command restrictions, and approval gate implemented |
| 4 Research | Partial | Provider-neutral search adapter with attribution-preserving source payloads; live search requires `SEARCH_PROVIDER_URL` |
| 5 Memory/knowledge | Partial | Durable local memory CRUD, deterministic embeddings, indexing, and vector search added; learned semantic retrieval remains |
| 6 Development workflows | Infrastructure ready | Existing project inspection/build checks; generalized code-operation tool remains |
| 7 Workflows/automation | Partial | Durable definitions, sequential runs, interval scheduler, event trigger endpoint, retry limit, pause/cancel state, run logs, and UI metrics/actions implemented |
| 8 Integrations/MCP | Partial | HTTP and standalone stdio JSON-RPC MCP transports, provider adapters, and integration status added; account-specific adapters remain |
| 9 Communication/calendar | Partial | Executable calendar and messaging/Slack adapters with approval-gated sends; no account credentials configured |
| 10 Documents/analytics | Partial | Bounded ingestion, headings/sentence extraction, chunk metadata, and type-neutral extraction added; binary format parsers and analytics remain |
| 11 Voice/hardware | Partial | Browser voice command loop and executable hardware HTTP adapter added; serial/MQTT/device discovery remains |
| 12 Security hardening | Partial | Optional bearer-token auth plus expiring local sessions, timing-safe comparison, approval records, path/command guards, and secret non-persistence; full identity/vault remains |
| 13 End-to-end verification | Functional but limited | Health, task, chat, approval, build, neural-brain, tool safety, workflow, adapter, Run, model-pool rotation/fallback, concurrency, idempotency, and latency contracts verified locally |

The UI intentionally labels or leaves unconfigured external capabilities rather than presenting fake live data.
