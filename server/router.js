export function routeRequest(text) {
  const value = String(text).trim();
  const media = value.match(/^(?:please\s+)?(?:make|generate|create)\s+(?:me\s+)?(?:an?\s+)?(image|picture|video|clip)\b[\s:,-]*(.*)$/i);
  if (media) return { route: 'TOOL_CALL', capability: 'media.generate', args: { kind: /video|clip/i.test(media[1]) ? 'video' : 'image', prompt: media[2] || value }, confidence: 0.99 };
  if (/^(open|launch|go to)\s+(youtube|youtube\.com)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'browser.open', args: { url: 'https://www.youtube.com', label: 'YouTube' }, confidence: 1 };
  const latestEmail = value.match(/\b(?:latest|last|recent|newest)\s*(\d{1,2})?\s*(?:e-?mails?|mails?)\b/i);
  if (latestEmail) return { route: 'TOOL_CALL', capability: 'gmail.latest', args: { limit: Math.min(20, Math.max(1, Number(latestEmail[1] || 4))) }, confidence: 0.99 };
  if (/^(show|list|what are)\s+(my\s+)?tasks\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'tasks.list', args: {}, confidence: 0.99 };
  if (/\b(provider|model|router)\b.*\b(using|active|current)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'runtime.telemetry', args: {}, confidence: 0.98 };
  if (/^(what('?s| is) in|read)\s+(the\s+)?readme/i.test(value)) return { route: 'TOOL_CALL', capability: 'files.read', args: { path: 'README.md' }, confidence: 0.99 };
  if (/\b(health|diagnostics|system status)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'diagnostics', args: {}, confidence: 0.98 };
  if (/\b(remember|decision|architecture)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'memory.search', args: { q: value }, confidence: 0.9 };
  return { route: 'MODEL', capability: null, args: {}, confidence: 0.7 };
}
