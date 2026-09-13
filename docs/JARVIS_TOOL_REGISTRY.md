# JARVIS Canonical Tool Registry

## Needle routing note (2026-09-09)

The authoritative runtime currently contains 168 definitions. Needle 2 does not add a registry or own tool implementations: it receives an eligible, compact view of these definitions, proposes a normalized call, and the existing executor performs all validation, policy, approval, execution, verification, persistence, and telemetry. `system.resources` is the new read-only local capability used for grounded CPU and memory inspection.

`memory.search` now combines durable local memory with ranked cached Obsidian note matches while preserving source paths. `memory.store` also writes into the configured vault's `JARVIS` folder when available. The graph is an observability read model, not a second executor.

Refreshed from `server/registry.js` on 2026-09-08. This is descriptive evidence; the registry remains authoritative at runtime. Input/output JSON Schemas are returned by `GET /api/tools` and MCP schemas are generated from the same definitions.

- Total definitions: 168
- Enabled in this environment: 129
- MCP exposed in the current environment: 43
- Duplicate IDs: 0 (validated during completion)

ChatGPT and Gemini browser brains add no shadow tools. They receive a request-filtered subset of these definitions and map the shared strict protocol back into `modelToolLoop.js` and `toolExecutor.js`. `tools.discover` is the canonical, read-only fallback for capability-family expansion. Login, health, cancellation, and session reset are authenticated control-plane endpoints, not assistant tools.

| Tool | Module | Provider | Availability | Risk | Approval | MCP | Timeout ms | Attempts | Verifier | Handler | Requirement |
|---|---|---|---|---|---|---|---:|---:|---|---|---|
| tools.discover | system | local-registry | enabled | READ_ONLY | no | yes | 5000 | 1 | object | tools.discover | â€” |
| workflows.list | automation | local | enabled | READ_ONLY | no | yes | 5000 | 1 | workflows.list | workflows.list | — |
| workflows.run | automation | local | enabled | DYNAMIC | no | no | 120000 | 1 | workflows.run | workflows.run | — |
| browser.back | browser | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.back | — |
| browser.click | browser | playwright | enabled | PROJECT_WRITE | yes | no | 30000 | 1 | browser.action | browser.click | — |
| browser.download | browser | playwright | enabled | PROJECT_WRITE | yes | no | 30000 | 1 | browser.action | browser.download | — |
| browser.fill | browser | playwright | enabled | PROJECT_WRITE | yes | no | 30000 | 1 | browser.action | browser.fill | — |
| browser.forward | browser | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.forward | — |
| browser.read | browser | playwright | enabled | READ_ONLY | no | yes | 30000 | 1 | browser.action | browser.read | — |
| browser.reload | browser | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.reload | — |
| browser.scroll | browser | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.scroll | — |
| browser.search | browser | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.search | — |
| browser.submit | browser | playwright | enabled | PROJECT_WRITE | yes | no | 30000 | 1 | browser.action | browser.submit | — |
| browser.tabs.close | browser | playwright | enabled | PROJECT_WRITE | yes | no | 30000 | 1 | browser.action | browser.tabs.close | — |
| browser.tabs.list | browser | playwright | enabled | READ_ONLY | no | yes | 30000 | 1 | browser.action | browser.tabs.list | — |
| browser.tabs.open | browser | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.tabs.open | — |
| browser.tabs.switch | browser | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.tabs.switch | — |
| browser.type | browser | playwright | enabled | PROJECT_WRITE | yes | no | 30000 | 1 | browser.action | browser.type | — |
| browser.upload | browser | playwright | enabled | PROJECT_WRITE | yes | no | 30000 | 1 | browser.action | browser.upload | — |
| calendar.availability | calendar | composio:googlecalendar | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | calendar.availability | COMPOSIO_API_KEY project key is required |
| calendar.create | calendar | configured-calendar | disabled | EXTERNAL_ACTION | yes | no | 15000 | 1 | calendar.create | calendar.create | A real calendar provider is required |
| calendar.delete | calendar | composio:googlecalendar | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | calendar.delete | COMPOSIO_API_KEY project key is required |
| calendar.list | calendar | configured-calendar | disabled | READ_ONLY | no | yes | 15000 | 2 | calendar.list | calendar.list | CALENDAR_API_URL or a Composio project connection is required for calendar reads |
| calendar.search | calendar | composio:googlecalendar | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | calendar.search | COMPOSIO_API_KEY project key is required |
| calendar.update | calendar | composio:googlecalendar | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | calendar.update | COMPOSIO_API_KEY project key is required |
| communication.send | communication | contact-dispatch | enabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | communication.send | communication.send | — |
| communications.call.answer | communication | voice-os | enabled | EXTERNAL_ACTION | yes | no | 15000 | 1 | voice-os.action | voice-os.action | — |
| communications.call.reject | communication | voice-os | enabled | EXTERNAL_ACTION | yes | no | 15000 | 1 | voice-os.action | voice-os.action | — |
| communications.call.start | communication | voice-os | enabled | EXTERNAL_ACTION | yes | no | 15000 | 1 | voice-os.action | voice-os.action | — |
| communications.message.send | communication | voice-os | enabled | EXTERNAL_ACTION | yes | no | 15000 | 1 | voice-os.action | voice-os.action | — |
| connections.auth.open | communication | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | connections.auth.open | — |
| contacts.delete | communication | local-contact-book | enabled | DESTRUCTIVE | yes | no | 5000 | 1 | contacts.delete | contacts.delete | — |
| contacts.list | communication | local-contact-book | enabled | READ_ONLY | no | no | 5000 | 1 | contacts.result | contacts.list | — |
| contacts.resolve | communication | local-contact-book | enabled | READ_ONLY | no | no | 5000 | 1 | contacts.result | contacts.resolve | — |
| contacts.upsert | communication | local-contact-book | enabled | LOW_RISK_WRITE | no | no | 5000 | 1 | contacts.upsert | contacts.upsert | — |
| discord.channels | communication | composio:discordbot | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | discord.channels | COMPOSIO_API_KEY project key is required |
| discord.react | communication | composio:discordbot | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | discord.react | COMPOSIO_API_KEY project key is required |
| discord.read | communication | composio:discordbot | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | discord.read | COMPOSIO_API_KEY project key is required |
| discord.reply | communication | composio:discordbot | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | discord.reply | COMPOSIO_API_KEY project key is required |
| discord.search | communication | composio:discordbot | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | discord.search | COMPOSIO_API_KEY project key is required |
| discord.send | communication | composio:discordbot | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | discord.send | COMPOSIO_API_KEY project key is required |
| gmail.archive | communication | composio:gmail | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | gmail.archive | COMPOSIO_API_KEY project key is required |
| gmail.delete | communication | composio:gmail | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | gmail.delete | COMPOSIO_API_KEY project key is required |
| gmail.draft | communication | composio:gmail | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | gmail.draft | COMPOSIO_API_KEY project key is required |
| gmail.labels | communication | composio:gmail | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | gmail.labels | COMPOSIO_API_KEY project key is required |
| gmail.latest | communication | composio:gmail | disabled | READ_ONLY | no | yes | 30000 | 2 | gmail.latest | gmail.latest | COMPOSIO_API_KEY project key is required |
| gmail.read | communication | composio:gmail | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | gmail.read | COMPOSIO_API_KEY project key is required |
| gmail.reply | communication | composio:gmail | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | gmail.reply | COMPOSIO_API_KEY project key is required |
| gmail.search | communication | composio:gmail | disabled | READ_ONLY | no | yes | 30000 | 1 | connected.operation | gmail.search | COMPOSIO_API_KEY project key is required |
| gmail.send | communication | composio:gmail | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | gmail.send | COMPOSIO_API_KEY project key is required |
| instagram.messages.latest | communication | composio:instagram | disabled | READ_ONLY | no | yes | 30000 | 2 | instagram.messages.latest | instagram.messages.latest | COMPOSIO_API_KEY project key is required |
| instagram.reply | communication | composio:instagram | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | instagram.reply | COMPOSIO_API_KEY project key is required |
| instagram.send | communication | composio:instagram | disabled | EXTERNAL_ACTION | yes | no | 30000 | 1 | connected.operation | instagram.send | COMPOSIO_API_KEY project key is required |
| messages.send | communication | configured-messaging | disabled | EXTERNAL_ACTION | yes | no | 15000 | 1 | messages.send | messages.send | A messaging provider is required |
| slack.channels | communication | slack | disabled | READ_ONLY | no | yes | 20000 | 1 | slack.operation | slack.channels | SLACK_BOT_TOKEN is required |
| slack.history | communication | slack | disabled | READ_ONLY | no | yes | 20000 | 1 | slack.operation | slack.history | SLACK_BOT_TOKEN is required |
| slack.react | communication | slack | disabled | EXTERNAL_ACTION | yes | no | 20000 | 1 | slack.operation | slack.react | SLACK_BOT_TOKEN is required |
| slack.reply | communication | slack | disabled | EXTERNAL_ACTION | yes | no | 20000 | 1 | slack.operation | slack.reply | SLACK_BOT_TOKEN is required |
| slack.search | communication | slack | disabled | READ_ONLY | no | yes | 20000 | 1 | slack.operation | slack.search | SLACK_BOT_TOKEN is required |
| slack.send | communication | slack | disabled | EXTERNAL_ACTION | yes | no | 20000 | 1 | slack.operation | slack.send | SLACK_BOT_TOKEN is required |
| slack.status | communication | slack | disabled | READ_ONLY | no | yes | 20000 | 1 | slack.operation | slack.status | SLACK_BOT_TOKEN is required |
| slack.thread | communication | slack | disabled | READ_ONLY | no | yes | 20000 | 1 | slack.operation | slack.thread | SLACK_BOT_TOKEN is required |
| slack.users | communication | slack | disabled | READ_ONLY | no | yes | 20000 | 1 | slack.operation | slack.users | SLACK_BOT_TOKEN is required |
| apps.close | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | apps.close | — |
| apps.list | computer | windows | enabled | READ_ONLY | no | yes | 25000 | 1 | object | apps.list | — |
| apps.search | computer | windows | enabled | READ_ONLY | no | yes | 25000 | 1 | object | apps.search | — |
| audio.mute | computer | windows-core-audio | enabled | LOW_RISK_WRITE | no | no | 10000 | 1 | desktop.action | audio.mute | — |
| audio.set_volume | computer | windows-core-audio | enabled | LOW_RISK_WRITE | no | no | 10000 | 1 | desktop.action | audio.set_volume | — |
| audio.status | computer | windows-core-audio | enabled | READ_ONLY | no | yes | 10000 | 1 | desktop.action | audio.status | — |
| audio.toggle_mute | computer | windows-core-audio | enabled | LOW_RISK_WRITE | no | no | 10000 | 1 | desktop.action | audio.toggle_mute | — |
| audio.unmute | computer | windows-core-audio | enabled | LOW_RISK_WRITE | no | no | 10000 | 1 | desktop.action | audio.unmute | — |
| audio.volume_down | computer | windows-core-audio | enabled | LOW_RISK_WRITE | no | no | 10000 | 1 | desktop.action | audio.volume_down | — |
| audio.volume_up | computer | windows-core-audio | enabled | LOW_RISK_WRITE | no | no | 10000 | 1 | desktop.action | audio.volume_up | — |
| browser.external.open | computer | windows-url-handler | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | external.browser.open | browser.external.open | — |
| browser.open | computer | playwright | enabled | LOW_RISK_WRITE | no | no | 30000 | 1 | browser.action | browser.open | — |
| clipboard.read | computer | windows | enabled | READ_ONLY | yes | no | 12000 | 1 | desktop.action | clipboard.read | — |
| clipboard.write | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | clipboard.write | — |
| command.execute | computer | local | enabled | PROJECT_EXECUTION | yes | no | 30000 | 1 | command.execute | command.execute | — |
| computer.keypress | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.input | computer.keypress | — |
| computer.state | computer | windows | enabled | READ_ONLY | no | no | 12000 | 1 | object | computer.state | — |
| computer.type | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.input | computer.type | — |
| media.next | computer | windows-media-session | enabled | LOW_RISK_WRITE | no | no | 12000 | 1 | desktop.action | media.next | — |
| media.pause | computer | windows-media-session | enabled | LOW_RISK_WRITE | no | no | 12000 | 1 | desktop.action | media.pause | — |
| media.play | computer | windows-media-session | enabled | LOW_RISK_WRITE | no | no | 12000 | 1 | desktop.action | media.play | — |
| media.previous | computer | windows-media-session | enabled | LOW_RISK_WRITE | no | no | 12000 | 1 | desktop.action | media.previous | — |
| media.status | computer | windows-media-session | enabled | READ_ONLY | no | yes | 12000 | 1 | media.status | media.status | — |
| media.toggle | computer | windows-media-session | enabled | LOW_RISK_WRITE | no | no | 12000 | 1 | desktop.action | media.toggle | — |
| mouse.click | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | mouse.click | — |
| mouse.double_click | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | mouse.double_click | — |
| mouse.drag | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | mouse.drag | — |
| mouse.move | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | mouse.move | — |
| mouse.position | computer | windows | enabled | READ_ONLY | no | no | 12000 | 1 | desktop.action | mouse.position | — |
| mouse.right_click | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | mouse.right_click | — |
| mouse.scroll | computer | windows | enabled | PROJECT_WRITE | yes | no | 12000 | 1 | desktop.action | mouse.scroll | — |
| screen.capture | computer | windows | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | desktop.action | screen.capture | — |
| screen.perceive | computer | windows+multimodal-model | enabled | PROJECT_WRITE | yes | no | 45000 | 1 | screen.perception | screen.perceive | — |
| screen.topology | computer | windows | enabled | READ_ONLY | no | no | 12000 | 1 | desktop.action | screen.topology | — |
| system.app.open | computer | windows | enabled | LOW_RISK_WRITE | no | no | 45000 | 1 | system.app.open | system.app.open | — |
| ui.click | computer | windows-uia | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | desktop.action | ui.click | — |
| ui.find | computer | windows-uia | enabled | READ_ONLY | no | yes | 15000 | 1 | desktop.action | ui.find | — |
| ui.inspect | computer | windows-uia | enabled | READ_ONLY | no | yes | 15000 | 1 | desktop.action | ui.inspect | — |
| ui.type | computer | windows-uia | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | desktop.action | ui.type | — |
| windows.close | computer | windows | enabled | PROJECT_WRITE | yes | no | 25000 | 1 | desktop.action | windows.close | — |
| windows.focus | computer | windows | enabled | LOW_RISK_WRITE | no | no | 25000 | 1 | desktop.action | windows.focus | — |
| windows.get_active | computer | windows | enabled | READ_ONLY | no | yes | 25000 | 1 | object | windows.get_active | — |
| windows.list | computer | windows | enabled | READ_ONLY | no | yes | 25000 | 1 | object | windows.list | — |
| windows.maximize | computer | windows | enabled | LOW_RISK_WRITE | no | no | 25000 | 1 | desktop.action | windows.maximize | — |
| windows.minimize | computer | windows | enabled | LOW_RISK_WRITE | no | no | 25000 | 1 | desktop.action | windows.minimize | — |
| windows.restore | computer | windows | enabled | LOW_RISK_WRITE | no | no | 25000 | 1 | desktop.action | windows.restore | — |
| dev.test | development | local-git | enabled | PROJECT_WRITE | yes | no | 180000 | 1 | developer.action | dev.test | — |
| git.branch.create | development | local-git | enabled | PROJECT_WRITE | yes | no | 60000 | 1 | developer.action | git.branch.create | — |
| git.branch.switch | development | local-git | enabled | PROJECT_WRITE | yes | no | 60000 | 1 | developer.action | git.branch.switch | — |
| git.branches | development | local-git | enabled | READ_ONLY | no | yes | 60000 | 1 | developer.action | git.branches | — |
| git.commit | development | local-git | enabled | PROJECT_WRITE | yes | no | 60000 | 1 | developer.action | git.commit | — |
| git.diff | development | local-git | enabled | READ_ONLY | no | yes | 60000 | 1 | developer.action | git.diff | — |
| git.log | development | local-git | enabled | READ_ONLY | no | yes | 60000 | 1 | developer.action | git.log | — |
| git.pull | development | local-git | enabled | EXTERNAL_ACTION | yes | no | 60000 | 1 | developer.action | git.pull | — |
| git.push | development | local-git | enabled | EXTERNAL_ACTION | yes | no | 60000 | 1 | developer.action | git.push | — |
| git.status | development | local-git | enabled | READ_ONLY | no | yes | 60000 | 1 | developer.action | git.status | — |
| github.issues.list | development | github-cli | enabled | READ_ONLY | no | yes | 60000 | 1 | developer.action | github.issues.list | — |
| github.prs.list | development | github-cli | enabled | READ_ONLY | no | yes | 60000 | 1 | developer.action | github.prs.list | — |
| github.search | development | github-cli | enabled | READ_ONLY | no | yes | 60000 | 1 | developer.action | github.search | — |
| project.inspect | development | local | enabled | READ_ONLY | no | yes | 10000 | 1 | project.inspect | project.inspect | — |
| documents.compare | documents | local | enabled | READ_ONLY | no | yes | 5000 | 1 | document.result | documents.compare | — |
| documents.extract | documents | local | enabled | READ_ONLY | no | yes | 5000 | 1 | document.result | documents.extract | — |
| documents.ingest | documents | local | enabled | LOW_RISK_WRITE | no | no | 15000 | 1 | documents.ingest | documents.ingest | — |
| documents.read | documents | local | enabled | READ_ONLY | no | yes | 30000 | 1 | document.read | documents.read | — |
| documents.search | documents | local | enabled | READ_ONLY | no | yes | 5000 | 1 | document.result | documents.search | — |
| documents.summarize | documents | local | enabled | READ_ONLY | no | yes | 5000 | 1 | document.result | documents.summarize | — |
| files.copy | files | local | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | file.action | files.copy | — |
| files.create | files | local | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | file.action | files.create | — |
| files.delete | files | local | enabled | DESTRUCTIVE | yes | no | 15000 | 1 | file.action | files.delete | — |
| files.list | files | local | enabled | READ_ONLY | no | yes | 10000 | 1 | file.action | files.list | — |
| files.mkdir | files | local | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | file.action | files.mkdir | — |
| files.move | files | local | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | file.action | files.move | — |
| files.read | files | local | enabled | READ_ONLY | no | yes | 10000 | 1 | files.read | files.read | — |
| files.rename | files | local | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | file.action | files.rename | — |
| files.search | files | local | enabled | READ_ONLY | no | yes | 15000 | 1 | file.action | files.search | — |
| files.write | files | local | enabled | PROJECT_WRITE | yes | no | 15000 | 1 | file.action | files.write | — |
| hardware.command | hardware | configured-hardware | disabled | EXTERNAL_ACTION | yes | no | 15000 | 1 | hardware.command | hardware.command | HARDWARE_ENDPOINT is required |
| composio.execute | integrations | composio | disabled | DYNAMIC | yes | yes | 30000 | 1 | composio.execute | composio.execute | COMPOSIO_API_KEY project key is required |
| media.generate | media | gemini | disabled | EXTERNAL_ACTION | yes | no | 120000 | 1 | media.generate | media.generate | GEMINI_API_KEY is required |
| memory.delete | memory | local | enabled | DESTRUCTIVE | yes | no | 5000 | 1 | memory.delete | memory.delete | — |
| memory.index | memory | local | enabled | LOW_RISK_WRITE | no | no | 5000 | 1 | memory.index | memory.index | — |
| memory.search | memory | local | enabled | READ_ONLY | no | yes | 5000 | 1 | memory.search | memory.search | — |
| memory.store | memory | local | enabled | LOW_RISK_WRITE | no | yes | 5000 | 1 | memory.store | memory.store | — |
| memory.update | memory | local | enabled | LOW_RISK_WRITE | no | yes | 5000 | 1 | memory.store | memory.update | — |
| notifications.dismiss | notifications | local | enabled | LOW_RISK_WRITE | no | no | 5000 | 1 | notification.action | notifications.dismiss | — |
| notifications.ingest | notifications | local | enabled | LOW_RISK_WRITE | no | no | 5000 | 1 | notification.action | notifications.ingest | — |
| notifications.list | notifications | local | enabled | READ_ONLY | no | yes | 5000 | 1 | notification.action | notifications.list | — |
| notifications.mark_read | notifications | local | enabled | LOW_RISK_WRITE | no | no | 5000 | 1 | notification.action | notifications.mark_read | — |
| notifications.summary | notifications | local | enabled | READ_ONLY | no | yes | 5000 | 1 | notification.action | notifications.summary | — |
| phone.command | phone | local-phone-bridge | enabled | EXTERNAL_ACTION | yes | no | 5000 | 1 | phone.action | phone.command | — |
| phone.devices | phone | local-phone-bridge | enabled | READ_ONLY | no | yes | 5000 | 1 | phone.action | phone.devices | — |
| phone.status | phone | local-phone-bridge | enabled | READ_ONLY | no | yes | 5000 | 1 | phone.action | phone.status | — |
| tasks.create | productivity | local | enabled | LOW_RISK_WRITE | no | yes | 5000 | 1 | tasks.create | tasks.create | — |
| tasks.list | productivity | local | enabled | READ_ONLY | no | yes | 5000 | 1 | tasks.list | tasks.list | — |
| tasks.update | productivity | local | enabled | LOW_RISK_WRITE | no | yes | 5000 | 1 | tasks.update | tasks.update | — |
| research.report | research | configured-search | disabled | READ_ONLY | no | yes | 60000 | 1 | research.report | research.report | SEARCH_PROVIDER_URL is required |
| research.search | research | configured-search | disabled | READ_ONLY | no | yes | 15000 | 2 | research.search | research.search | SEARCH_PROVIDER_URL is required |
| diagnostics | system | local | enabled | READ_ONLY | no | yes | 5000 | 1 | diagnostics | diagnostics | — |
| runtime.telemetry | system | local | enabled | READ_ONLY | no | yes | 5000 | 1 | object | runtime.telemetry | — |

## Security invariants

All assistant, deterministic-router, workflow, HTTP tool, model-tool, and MCP executions resolve these definitions through `server/toolExecutor.js`. Side effects are policy checked and exact-argument approvals are consumed once. Sensitive input/output is redacted from persisted Run evidence. Control-plane input/output routes (authentication, microphone upload, TTS byte streaming, Voice OS bridge protocol, and phone pairing protocol) are not assistant tools and remain separately authenticated/validated.
## Additions — 2026-09-08

- `youtube.search` — read-only YouTube search through managed Playwright; service fixed to `youtube`.
- `youtube.play` — low-impact normal YouTube playback; verifies a `youtube.com/watch` URL plus unpaused, ready, advancing media.
- `youtube_music.play` — separate low-impact YouTube Music playback used only for explicit YouTube Music intent.
- `communication.recipients.search` — read-only, sensitive-output recipient lookup through the shared resolver; not exposed over MCP.
- `communication.send` resolves and freezes a saved or platform-discovered identity before policy evaluation. WhatsApp uses Voice OS when available and otherwise authenticated WhatsApp Web; Instagram uses Composio conversations first and managed Instagram Web discovery as fallback.
- `instagram.messages.latest` accepts `unreadOnly`, hydrates conversation-only provider responses, and emits normalized message/thread/sender/content metadata.

All additions use the existing canonical registry/executor. The registry contains 167 tools (62 MCP-exposed read/policy-safe tools) in the live runtime after this change.
