# JARVIS Missing and Limited Capabilities

Verified 2026-09-06. These entries are intentionally not presented as working.

## External configuration

- ChatGPT Web brain: run `npm.cmd run chatgpt:login`, complete normal authentication in the visible private browser, then enable the brain under Settings → Intelligence. The local profile does not exist yet, so the real website/tool round trip remains UNVERIFIED.

- Groq TTS: accept the Orpheus model terms in the configured Groq organization. The live request currently returns HTTP 400 with that required action.
- Slack reads: grant/reinstall with `channels:history`, `im:read`, `im:history`, `users:read`, `search:read`; add `reactions:write` for reactions.
- Discord bot: reconnect the expired Composio Discord Bot account.
- Search/research: set `SEARCH_PROVIDER_URL` and optional `SEARCH_PROVIDER_KEY`.
- Phone: provide a compatible mobile companion, set `PHONE_BRIDGE_MASTER_KEY` (32+ characters), `JARVIS_AUTH_TOKEN`, `JARVIS_PHONE_BRIDGE_ALLOW_LAN=1`, and a LAN host/firewall rule.
- ElevenLabs/Fish: add their API key and valid voice/reference ID if selected.
- Windows distribution signing: provide a trusted code-signing certificate for public distribution. The local NSIS build is currently unsigned.

## Implemented but not fully live-verified

- Keyboard/shortcut effects are supported and invariant-tested; Windows rejected foreground focus in the latest headless verification. No unsafe force-focus workaround was added.
- Pointer mutation is implemented; the live restore attempt raced with physical pointer movement.
- Browser upload/download, external communications writes, calendar mutations, Git remote mutations, active media-session control, real-audio STT, and multimodal screen perception were not executed against personal/external state.
- Notification aggregation accepts normalized events but does not yet poll every connector.

## Not implemented

- Window move/resize/fullscreen, screen recording.
- Brightness, Wi-Fi, Bluetooth, lock, sleep, restart, shutdown.
- Wake-word/continuous listening and audio-device selection.
- Spotify library/search/queue APIs.
- Binary Office creation/editing.
- Slack file upload/download.
- Personal WhatsApp read/send/call control.
- A mobile phone companion and phone screen mirroring.
- A dedicated local OCR fallback.
- Durable first-class Goals (the UI states this explicitly).

## Platform boundaries

- Playwright controls the JARVIS-managed browser profile, not arbitrary existing personal tabs.
- UI Automation depends on application accessibility support and observable state transitions.
- Instagram/Discord/WhatsApp capabilities are limited by official account/API policies; JARVIS does not scrape credentials or create self-bots.
- UWP applications such as Calculator may present transient launcher windows. JARVIS rejects unverified launches instead of claiming success.
## Current external verification limits (2026-09-08)

- A real WhatsApp message was not sent because no dedicated safe test recipient was authorized. QR authentication and a saved international phone number are required.
- Live YouTube playback was not started during verification to avoid an unsolicited visible/media side effect; controlled navigation/playback verification passes.
- Instagram's active Graph/Composio response does not expose an unread flag. JARVIS now says this explicitly and shows recent messages rather than falsely reporting them as unread or empty.
- AutoMCP is not missing runtime functionality for this repository. Its supported use case is exporting Python framework agents as separate MCP servers; JARVIS already has canonical HTTP and stdio MCP adapters.
