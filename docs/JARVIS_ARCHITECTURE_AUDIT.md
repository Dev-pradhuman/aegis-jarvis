# JARVIS Architecture Audit — Completion State

## 2026-09-09 local reflex-routing extension

Normalized voice and text requests now enter one `requestRouter` before model delegation. It preserves the existing deterministic fast path, then asks a resident official Cactus Needle 2 worker to propose at most one canonical `ToolCall` for simple requests. Complex, ambiguous, invalid, low-confidence, or unavailable cases fall through to the existing ChatGPT headless/model fallback chain. Needle owns no handlers and cannot execute directly: accepted proposals still pass through the canonical schema validator, policy/approval layer, executor, verifier, Run persistence, and telemetry.

```text
Voice / Text -> normalize -> deterministic router
                            -> Needle 2 proposal -> canonical ToolCall runtime
                            -> ChatGPT headless -> bounded tool loop -> same runtime
```

The worker is persistent and uses Needle's own indexed tool retrieval over the eligible canonical catalog. Context is intentionally limited. The configured ChatGPT target is the exact persistent `jarvis-chat` conversation URL and is authoritative for every ChatGPT-backed request; persisted Project-home or stale conversation URLs cannot override it. JARVIS still keeps its own local session histories separately, but ChatGPT inference intentionally uses the user-configured persistent conversation.

Verified 2026-09-08 against the current source, 250 automated tests, production build, prior Windows installer/native compilation, and controlled live checks.

## Before this mission

Chat, deterministic commands, workflows, MCP, and provider adapters had parallel execution paths. Some workflow text steps could be marked complete without a real action. MCP exposed a shadow subset. Model approval stopped the tool loop. Desktop launch confirmation relied too heavily on process creation, and several frontend workspaces rendered demonstration data as operational state.

## Current architecture

```text
Text / Voice / Event / Workflow / MCP
                 |
        Context + deterministic router
                 |
       direct ToolCall or bounded model loop
                 |
       Canonical registry (163 definitions)
                 |
 schema -> availability -> permission/risk -> exact approval
                 |
 handler -> timeout/retry -> output schema -> verifier
                 |
     Run step + telemetry + idempotency + context
                 |
          grounded final response
```

The authoritative capability boundary is `server/registry.js` plus `server/toolExecutor.js`. Deterministic routes, model calls, workflows, HTTP tool execution, and MCP map to it. Authentication, raw microphone/TTS streaming, Voice OS hotkey transport, scheduler ticking, OAuth connection setup, and phone pairing are control-plane protocols rather than assistant actions; their resulting capabilities enter the executor.

## Runtime flow in current code

1. `server/index.js` accepts chat, voice event, workflow/event, approval, MCP, or explicit tool input.
2. `contextAssembler.js` keeps a bounded recent window and ranked memory. `contextResolver.js` resolves only grounded ephemeral references.
3. `router.js` executes high-confidence deterministic intents as canonical ToolCalls. Otherwise `modelRouterService.js`/`modelRouting.js` select a logical model.
4. `modelPool.js` rotates healthy same-model credentials, classifies provider failures, then follows an acyclic fallback. `modelToolLoop.js` exposes filtered schemas and supports bounded sequential/parallel calls.
5. `toolExecutor.js` validates schema and policy, binds approval to normalized arguments/Run/step/caller/session, executes once, validates output, verifies evidence, and persists redacted Run telemetry.
6. `workflowEngine.js` uses the same executor. A planned step cannot be completed without verified execution.
7. The response is derived from the actual ToolExecutionResult. A side effect surviving a synthesis failure is never repeated.

## Persistence and migrations

`server/store.js` stores local JSON through a serialized mutation queue and atomic temporary-file replacement. Schema version 12 migrations preserve legacy data and add canonical execution telemetry, classified memories, normalized notifications, workflow event receipts, paired-phone command state, contacts, isolated JARVIS chat sessions, credential labels/verification metadata, non-secret ChatGPT/Gemini Web session metadata, durable recipient-clarification transactions, and Instagram observation cursors.

## Live memory, sessions, and settings

- `memoryGraph.js` scans only the configured Obsidian vault, parses real Markdown/frontmatter/wiki links, caches the graph, and uses a debounced filesystem watcher. The browser polls revision metadata; unchanged graphs are not retransmitted.
- `LiveMemoryGraph.jsx` renders the graph on Canvas with viewport culling, zoom-dependent labels, filters, note details, and active-memory highlights. It contains no demonstration nodes.
- Chat messages and ChatGPT browser conversation URLs are isolated per durable JARVIS session. Persistent memory remains shared.
- ChatGPT browser inference is constrained to the exact `jarvis-chat` Project. Exact accessible-name discovery and a discovered direct URL are used; failure is `CHATGPT_PROJECT_NOT_FOUND`, never a silent switch to another Project.
- Credentials remain in the backend-only file. The frontend receives configured/enabled/verification metadata only. Appearance uses one CSS accent token family; uploaded fonts are validated and persisted in IndexedDB.

## Subsystems

- Frontend: React + Vite, with backend-grounded tasks, approvals, workflows, Runs/workers, tools, connections, provider telemetry, and settings. The single identity is JARVIS.
- Desktop: PowerShell/native C# bridge for discovery, windows, keyboard, clipboard, pointer, screen, media, and Core Audio.
- Browser: Playwright Core persistent managed Chromium session using DOM/accessibility locators.
- Screen: Windows UI Automation first; screenshot + configured multimodal perception when pixel understanding is required.
- Voice: MediaRecorder/browser recognition or Groq Whisper STT; browser/ElevenLabs/Fish/Groq TTS; interruptible island and observational global hotkeys.
- Memory/documents: local deterministic embeddings and typed metadata; real PDF/DOCX/PPTX/XLSX/text parsers with provenance.
- Communications: canonical Composio Gmail/Calendar/Instagram/Discord adapters and direct Slack adapter.
- Contacts: schema-v7 local aliases and private per-platform endpoints feed the canonical `communication.send` dispatcher. Platform omission remains a clarification, never an inferred side effect.
- Models: official OpenAI and Gemini OpenAI-compatible endpoints are rotating logical-model pools and receive the same filtered canonical function schemas as existing providers.
- Browser brains: the shared headless model adapter connects private persistent ChatGPT and Gemini Playwright transports to the existing model loop. Both use the same strict tool protocol, filtered canonical schemas, executor, approvals, Runs, and verification. They own no tools.
- Messaging resolution: `communication.send` calls the shared `RecipientResolver` before policy evaluation. It prefers saved identities, then authenticated provider/platform search, persists ambiguity with the original exact message, and freezes the selected identity before approval. WhatsApp and Instagram Web remain low-level adapters beneath the canonical tool.
- Browser profile isolation: named persistent profiles prevent hidden WhatsApp/Instagram sessions from changing the visible/audible media browser mode. Sign-in reopens the same platform profile headed; YouTube uses a dedicated headed `media` profile.
- Automation: durable workflows, dependencies, retries, approval resume, interval worker, event conditions, duplicate occurrence/event protection.
- Phone: authenticated/encrypted PC protocol and command queue; no mobile companion is present.

## Deliberate limitations

- Keyboard/pointer delivery can be rejected by Windows foreground restrictions; JARVIS reports this instead of force-focusing or resetting modifier state.
- Native UIA invocation requires observable state change; controls exposing no verification signal return `VERIFICATION_FAILED`.
- Browser automation controls its own Chromium profile, not arbitrary existing personal tabs.
- Model screen perception requires a configured multimodal endpoint and approval; OCR is not a separate local fallback.
- Binary Office creation/editing, screen recording, brightness/Wi-Fi/Bluetooth/power control, wake word, Spotify API, WhatsApp personal-session control, and a phone mobile app are not implemented.
- External write integrations were not exercised during completion testing.
- ChatGPT and Gemini Web support is experimental consumer-UI automation, not a supported model API and not an unlimited-service guarantee. It requires normal user authentication, respects website/rate limits, stores separate private profiles outside Git, and can break when either website changes.

## 2026-09-08 browser-brain tool gateway verification

The `Available tools: []` defect came from `server/index.js`: only routes classified with `requiresTools` entered `modelToolLoop`; other headless requests entered plain model delegation, which supplied no schemas. All ChatGPT/Gemini headless routes now enter the bounded model tool loop, while deterministic commands still bypass the model entirely. `tools.discover` is a canonical read-only registry tool and the existing filter always retains it, so a low-confidence filter can expand the allowed catalog without creating a shadow registry.

Live verification used the configured stable `jarvis-chat` Project URL, validated its HTTPS origin/project slug, and completed ChatGPT -> `tasks.list` -> verified result -> ChatGPT synthesis in one Run. A second live Run completed ChatGPT -> `gmail.latest` (Composio) -> verified result -> synthesis. Gemini launched its separate persistent Chrome profile headlessly and completed Gemini -> `tasks.list` -> verified result -> Gemini synthesis. Normalized delta/tool events were observed for the Gemini Run. External sends were deliberately not performed.
## Approval and permission runtime update (2026-09-08)

Before, exact approvals existed but natural-language approval replies entered model routing as new prompts. Contact resolution also occurred inside the messaging handler, after approval.

After:

`user intent → canonical ToolCall → schema validation → contact/target resolution → frozen PendingAction → centralized permission mode → approval interception → same ToolCall/idempotency key → handler → verification → same Run/model continuation`

Pending action state remains owned by JARVIS and is independent of ChatGPT/Gemini availability. `normal`, `skip_permissions`, and `full_permissions` change only approval policy; they do not disable validation, authentication, verification, idempotency, telemetry, or the canonical executor.

AutoMCP is not part of the runtime. JARVIS's existing MCP HTTP/stdio adapters already expose allowlisted canonical definitions and invoke the same executor, whereas AutoMCP targets exporting Python framework agents as separate MCP servers.

## Auto MCP Runtime Addition

Auto MCP is now an optional provider below the canonical execution layer. The flow is: Auto MCP `tools/list` -> normalized `auto_mcp.*` canonical tool definitions -> tool filtering/model loop -> canonical executor -> Auto MCP `tools/call` -> result normalization/verification. This preserves the existing registry/executor/approval architecture and avoids a parallel tool system.
