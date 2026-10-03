#!/usr/bin/env python3
import sys

with open('src/components/WorkspaceViews.jsx', 'r') as f:
    content = f.read()

# Locate the `const cards = [` block and replace it.
start_str = "const cards = ["
end_str = "];\n  \n  const getKeysForGroup"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Cards array not found")
    sys.exit(1)

new_cards = """const cards = [
    { title: 'GROQ', type: 'API Key', baseKey: 'GROQ_API_KEY', desc: 'Fast LPU inference for speech and text.' },
    { title: 'GEMINI', type: 'API Key', baseKey: 'GEMINI_API_KEY', desc: 'Google AI models for text, vision, and video.' },
    { title: 'VERCEL AI', type: 'API Key', baseKey: 'AI_GATEWAY_API_KEY', single: true, desc: 'Centralized model routing via Vercel AI Gateway.' },
    { title: 'COMPOSIO', type: 'API Key', baseKey: 'COMPOSIO_API_KEY', single: true, desc: 'Managed integrations for Gmail, Calendar, etc.' },
    { title: 'OPENROUTER', type: 'API Key', baseKey: 'OPENROUTER_API_KEY', desc: 'Unified API for multiple LLM providers.' },
    { title: 'OPENCODE ZEN', type: 'API Key', baseKey: 'OPENCODE_ZEN_API_KEY', desc: 'Zen API keys for OpenCode services.' },
    { title: 'NINEROUTER', type: 'API Key', baseKey: 'NINEROUTER_API_KEY', desc: 'Alternative multi-model routing gateway.' },
    { title: 'CUSTOM MODEL', type: 'API Key', baseKey: 'MODEL_API_KEY', max: 12, desc: 'Generic keys for custom OpenAI-compatible endpoints.' },
    { title: 'SEARCH PROVIDER URL', type: 'URL', baseKey: 'SEARCH_PROVIDER_URL', single: true, desc: 'Endpoint for web search operations.' },
    { title: 'JARVIS AUTH TOKEN', type: 'Token', baseKey: 'JARVIS_AUTH_TOKEN', single: true, desc: 'Token for local client authentication.' }
  """

content = content[:start_idx] + new_cards + content[end_idx:]

with open('src/components/WorkspaceViews.jsx', 'w') as f:
    f.write(content)

print("Patch applied")
