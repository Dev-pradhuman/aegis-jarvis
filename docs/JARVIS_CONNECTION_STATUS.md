# JARVIS Connection Status

Verified 2026-09-10. No secret values are recorded. `SET` proves only local presence; authentication is listed separately.

| Service | Configured | Authenticated | Read | Write | Available to JARVIS | Evidence / blocker |
|---|---|---|---|---|---|---|
| OpenRouter | SET | YES | N/A | N/A | YES | Live DeepSeek request succeeded without fallback in 1.69 s |
| OpenCode Zen | SET | NOT_TESTED | N/A | N/A | YES as configured provider | No direct live probe in final batch |
| Groq | SET | endpoint reachable | STT UNVERIFIED with real audio | TTS BLOCKED | YES | TTS HTTP 400 requires account admin to accept Orpheus model terms |
| Gemini | SET | NOT_TESTED in final batch | N/A | Media adapter | YES | Unit/provider-contract tests; no paid generation performed |
| OpenAI official API | NOT_SET | NO | N/A | N/A | YES when configured | Add `OPENAI_API_KEY`; website subscription is separate from API billing |
| ChatGPT Web brain | YES | YES | Canonical reads verified | Approval gated | YES | Live `jarvis-chat` Project, task read and Gmail read tool loops passed; experimental consumer UI automation, not an official API |
| Gemini Headless brain | YES | YES | Canonical task read verified | Approval gated | YES | Separate persistent Chrome profile launched headlessly; tool-result continuation and normalized streaming events verified live |
| Gemini OpenAI-compatible API | SET | NOT_TESTED in this batch | N/A | N/A | YES | `gemini-best` pool supports canonical function/tool calling; account limits still apply |
| 9router | NOT_SET | NO | N/A | N/A | NO | Add `NINEROUTER_API_KEY` |
| Custom model API | NOT_SET | NO | N/A | N/A | NO | Add base URL/model/key |
| Local model | default endpoint present | NOT_TESTED | N/A | N/A | CONDITIONAL | Requires Ollama/compatible server and selected model |
| Composio | SET | YES | YES | Approval gated | YES | Account enumeration succeeded: 4 active |
| Gmail | YES | YES | YES | Approval gated, UNVERIFIED live | YES | Canonical latest-email read returned one verified record |
| Google Calendar | YES | YES | Adapter tested | Approval gated, UNVERIFIED live | YES | Active Composio account; canonical list/create/update/delete/availability |
| Instagram | YES | YES | YES | Approval gated, NOT live-tested | YES | Composio inbox and conversation-recipient lookup verified live; managed Instagram Web fallback requires its own login for recipients absent from recent provider conversations |
| Discord user | YES | YES | Adapter available | Platform dependent | YES through Composio | Active account; no live content read in final batch |
| Discord bot | connection exists | EXPIRED | NO | NO | NO until reconnect | Reconnect Discord Bot in Settings |
| Slack | SET | YES | PARTIAL | Send approval gated | YES | Missing `channels:history`, `im:read`, `im:history`, `reactions:write`, `users:read`, `search:read` |
| WhatsApp | user action required | AUTH_REQUIRED in isolated profile | NO | NO | YES after QR login | Read-only canonical platform search reached the WhatsApp adapter and returned `WHATSAPP_AUTH_REQUIRED`; Settings opens that same persistent profile visibly for official QR login |
| Managed account browser | YES | user-controlled | N/A | N/A | YES for sign-in bootstrap | Canonical `connections.auth.open` allowlists WhatsApp, Instagram, Discord, and Google login URLs; credentials are never captured |
| Obsidian vault | NO | N/A | N/A | N/A | YES when configured | Set `OBSIDIAN_VAULT_PATH`; endpoint currently reports `not_configured` and never substitutes demo nodes |
| ChatGPT `jarvis-chat` Project | YES | YES | consumer account | inference only | YES | User-provided stable Project URL is stored privately, origin/slug validated, and direct startup verified; semantic sidebar discovery remains recovery |
| GitHub | YES | YES | Issues/PR/search available | Push approval gated | YES | Read-only CLI check authenticated `Dev-pradhuman`; target repository permission is ADMIN |
| Browser | YES | N/A | YES | Approval gated | YES | Live tab/open/fill/click/read/cleanup verified |
| Filesystem | YES | local | YES | Approval gated | YES | Workspace lifecycle, traversal and symlink tests pass |
| Terminal | YES | local | execute | Approval gated | YES | Structured `execFile`; shell metacharacters rejected |
| Windows desktop | YES | local session | YES | Risk dependent | YES | Live Notepad lifecycle, clipboard, screen, audio, UIA verified |
| Linux runtime (Ubuntu 24.04 WSL) | YES | local | YES | platform dependent | YES | Clean `npm ci`, production build, 18 focused tests, health endpoint, AppImage and Debian packaging passed |
| Linux graphical desktop | adapter present | NOT_TESTED | platform dependent | Risk dependent | YES | Requires a real Ubuntu/Zorin X11 or Wayland session; limitations are capability-detected |
| Research search | NOT_SET | NO | NO | N/A | NO | Set `SEARCH_PROVIDER_URL` and optional key |
| Phone bridge | NOT_SET | no devices | NO | NO | PC infrastructure only | Set master/auth/LAN values and install companion |
| MCP HTTP/stdio | YES | local/auth boundary | 59 tools | Policy dependent | YES | Canonical schemas/executor tests pass |

## Credential presence

| Variable | State |
|---|---|
| `OPENROUTER_API_KEY`, `OPENCODE_ZEN_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | SET |
| `OPENAI_API_KEY` | NOT_SET |
| `COMPOSIO_API_KEY`, Slack token/channel/signing secret | SET |
| `NINEROUTER_API_KEY`, `CUSTOM_API_KEY` | NOT_SET |
| `SEARCH_PROVIDER_URL` | NOT_SET |
| `ELEVENLABS_API_KEY`, `FISH_AUDIO_API_KEY` | NOT_SET |
| `JARVIS_AUTH_TOKEN`, `PHONE_BRIDGE_MASTER_KEY` | NOT_SET |

The active credentials file is `server/data/credentials.env`; `.env.local` is only a legacy fallback when the active file does not exist.
## Live check — 2026-09-08

| Service | Configured/authenticated | Read | Write | Evidence / limitation |
|---|---|---|---|---|
| Instagram via Composio | Yes | WORKING | Unverified | Canonical live read hydrated 10 conversations/messages with zero unknown senders. Unread flags were not exposed by the provider response. |
| Gmail via Composio | Yes | WORKING | Unverified | Canonical `gmail.search` completed and verified. No message was sent. |
| WhatsApp Web | Profile-dependent | AUTH_REQUIRED (live) | PARTIALLY_WORKING | Missing saved endpoints now fall back to platform search. Search/send/ambiguity/exact-text verification pass controlled tests; no real message was sent. |
| YouTube | No account required for public playback | Live verified | N/A | Normal YouTube opened the official Seven Nation Army watch page and verified advancing playback; YouTube Music separately selected the exact track and verified playback. |
| AutoMCP | Not installed | N/A | N/A | Deliberately omitted because it duplicates the existing canonical MCP server boundary and does not add browser automation or approval enforcement. |
