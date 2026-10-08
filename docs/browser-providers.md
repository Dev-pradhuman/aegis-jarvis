# Browser Providers

This document outlines the browser providers available for web AI operations.

## WARNING

**EXPERIMENTAL / may violate provider terms / account risk**

Using these web providers automates interactions with their respective websites. This may be against their terms of service, and you risk your account being suspended or banned. Proceed with caution.

## Included Providers

- **ChatGPT** (`https://chatgpt.com/`)
- **Claude** (`https://claude.ai/new`)
- **Gemini** (`https://gemini.google.com/app`)
- **Google Flow** (`https://imagefx.google.com/`): Used for image/video generation as a visible-browser flow.

## Authentication and Human Verification

CAPTCHA, login, and age-gate steps MUST hand off to the human. The system detects patterns such as "log in", "captcha", or "verify your age" and sets the provider state to `HUMAN_ACTION_REQUIRED`. This pauses the automation flow and waits for the human to clear them manually in the persistent browser window.

## Selectors Configuration

All CSS selectors for the providers are consolidated into `server/browserProvidersConfig.js`.
