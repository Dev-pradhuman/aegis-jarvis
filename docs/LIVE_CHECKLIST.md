# Live Verification Checklist

Run these steps when you need to verify `WORKING_LIVE` status for any feature that requires internet access or API accounts, as those are blocked in CI by `ZERO_SPEND_MODE`.

## Prerequisites
1. Ensure your local `jarvis` server is not running (the kit binds ports).
2. Prepare one valid, zero-price API key (e.g. Google Gemini free tier) or ensure a local Ollama server is running on `http://localhost:11434`.

## Automated Local Check
1. Start local model: `ollama run qwen2.5:3b`
2. Run: `npm run verify:live`
3. Check `docs/evidence/` for the new `verify-live-*.json` file. Commit it.

## ChatGPT / Claude Web Tier Check
1. Open the UI.
2. Ensure you have the Chrome/Firefox extension active.
3. Open a tab with ChatGPT and a tab with Claude.
4. Go to JARVIS UI > Settings > Brain and enable "Web Tier".
5. Send request: "What is my current battery level?"
6. Observe the command executing successfully without errors.
