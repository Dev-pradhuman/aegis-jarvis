# JARVIS Browser Architecture

## Desktop browser dispatch

Natural requests such as `open YouTube` use the canonical `browser.external.open` tool and Windows' registered default HTTP(S) handler. Explicit requests such as `open YouTube in Zen Browser` resolve only against browsers registered under Windows `StartMenuInternet`, then launch that browser executable with the normalized URL as a direct argument. There is no shell evaluation. Credential-bearing and non-HTTP(S) URLs are rejected.

This is deliberately separate from `browser.open`: external dispatch opens the user's normal browser, while the managed-browser tools below provide DOM automation in a JARVIS-owned profile.

The browser layer is `server/browserAutomation.js`, exposed only through canonical registry definitions. It launches a persistent JARVIS-owned Chrome/Edge profile with Playwright Core and records active tab ID, URL, title, and operation evidence.

Supported operations: tabs list/open/close/switch, back/forward/reload, DOM text read, web search, scroll, semantic click, type/fill/submit, upload, and download. URLs are limited to credential-free HTTP(S). Upload paths remain workspace-confined. Downloads use a controlled data directory. Page content is marked untrusted before model use.

Mutating/form/file actions are approval-gated. Filling and submission are separate tools. Locators prefer role/label/text/placeholder/CSS and return ambiguity/not-found errors rather than blind coordinate actions. The live verification page proved open, fill, click, DOM state observation, read, and tab cleanup. Upload/download have automated contract coverage but no external live test.

The managed layer does not attach to arbitrary personal browser sessions. Native UIA and vision are separate fallback layers for desktop surfaces.
