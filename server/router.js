function externalWebTarget(value) {
  const input = String(value || '').trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '');
  const known = {
    youtube: { url: 'https://www.youtube.com', label: 'YouTube' },
    github: { url: 'https://github.com', label: 'GitHub' },
    instagram: { url: 'https://www.instagram.com', label: 'Instagram' },
    gmail: { url: 'https://mail.google.com', label: 'Gmail' },
    whatsapp: { url: 'https://web.whatsapp.com', label: 'WhatsApp' },
    'whatsapp web': { url: 'https://web.whatsapp.com', label: 'WhatsApp' },
    reddit: { url: 'https://www.reddit.com', label: 'Reddit' },
  };
  const named = known[input.toLowerCase().replace(/^the\s+/, '')];
  if (named) return named;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : /^(?:www\.)?[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}(?:[/:?#].*)?$/i.test(input) ? `https://${input}` : null;
  if (!candidate) return null;
  try { const parsed = new URL(candidate); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? { url: parsed.href, label: parsed.hostname } : null; } catch { return null; }
}

export function routeRequest(text, options = {}) {
  const value = String(text).trim();
  const command = value
    .replace(/^(?:hey\s+)?(?:jarvis|travis)[\s,]+/i, '')
    .replace(/^(?:(?:can|could|would)\s+you|please)\s+/i, '');
  const openApp = command.match(/^(?:open|launch|start)\s+(?:the\s+)?(notepad|note\s*pad|text editor|calculator|calc|paint|mspaint|file explorer|explorer|files|windows terminal|terminal|windows settings|settings)\s*[.!?]*$/i);
  if (openApp) return { route: 'TOOL_CALL', capability: 'system.app.open', args: { app: openApp[1].trim() }, confidence: 1 };
  const shortVoiceCommand = options.source === 'voice' && command.split(/\s+/).length <= 8 && !/\b(?:what|who|why|how|tell|explain)\b|(?:क्या|कौन|क्यों|कैसे)/i.test(command);
  if (shortVoiceCommand) {
    const spokenApp = command.match(/\b(notepad|note\s*pad|calculator|paint|file explorer|windows terminal|windows settings)\b/i);
    if (spokenApp) return { route: 'TOOL_CALL', capability: 'system.app.open', args: { app: spokenApp[1].trim() }, confidence: 0.96 };
  }
  const instagramMessages = value.match(/\b(?:any|check|show|list|what(?:'s| is| are))?\s*(?:new|latest|recent|unread)?\s*(?:instagram|insta)\s+(?:direct\s+)?(?:messages?|dms?|inbox|chats?)\b|\b(?:any\s+)?(?:new|latest|recent|unread)?\s*(?:messages?|dms?)\s+(?:on|in|from)\s+(?:instagram|insta)\b/i);
  if (instagramMessages) return { route: 'TOOL_CALL', capability: 'instagram.messages.latest', args: { limit: 10, unreadOnly: /\b(?:new|unread)\b/i.test(value) }, confidence: 0.99 };
  if (/^(?:jarvis[\s,]+)?(?:answer|accept|pick\s*up)(?:\s+the)?\s+call\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'communications.call.answer', args: {}, confidence: 1 };
  if (/^(?:jarvis[\s,]+)?(?:reject|decline|hang\s*up)(?:\s+the)?\s+call\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'communications.call.reject', args: {}, confidence: 1 };
  const call = value.match(/^(?:jarvis[\s,]+)?(?:call|dial)\s+(.+?)\s*[.!?]*$/i);
  if (call) return { route: 'TOOL_CALL', capability: 'communications.call.start', args: { target: call[1].trim() }, confidence: 0.99 };
  const message = value.match(/^(?:jarvis[\s,]+)?(?:send\s+(?:a\s+)?message\s+to|message)\s+(.+?)\s+(?:on|using|via)\s+(whatsapp|slack|discord|instagram)\s*[:,-]?\s+(.+)$/i);
  if (message) {
    const exactMessage = message[3].trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
    return { route: 'TOOL_CALL', capability: 'communication.send', args: { contact: message[1].trim(), platform: message[2].toLowerCase(), message: exactMessage }, confidence: 0.99, communicationIntent: { contact: message[1].trim(), platform: message[2].toLowerCase(), message: exactMessage } };
  }
  const youtubePlay = command.match(/^(?:play|put\s+on)\s+(.+?)\s+(?:on|using|via)\s+(youtube|youtube\s+music)\s*[.!?]*$/i);
  if (youtubePlay) { const music=/music/i.test(youtubePlay[2]);return { route: 'TOOL_CALL', capability: music?'youtube_music.play':'youtube.play', args: { query: youtubePlay[1].trim(), service: music?'youtube_music':'youtube' }, confidence: 1 }; }
  const media = value.match(/^(?:please\s+)?(?:make|generate|create)\s+(?:me\s+)?(?:an?\s+)?(image|picture|video|clip)\b[\s:,-]*(.*)$/i);
  if (media) return { route: 'TOOL_CALL', capability: 'media.generate', args: { kind: /video|clip/i.test(media[1]) ? 'video' : 'image', prompt: media[2] || value }, confidence: 0.99 };
  const browserQualified = command.match(/^(?:open|launch|go\s+to|start)\s+(?:the\s+)?(.+?)\s+(?:in|using|with)\s+(?:the\s+)?(.+?)\s*[.!?]*$/i);
  if (browserQualified) {
    const destination = externalWebTarget(browserQualified[1]);
    const browser = browserQualified[2].replace(/[.!?]+$/, '').replace(/\s+browser$/i, '').trim();
    if (destination && browser) return { route: 'TOOL_CALL', capability: 'browser.external.open', args: { ...destination, browser }, confidence: 0.99 };
  }
  const directWeb = command.match(/^(?:open|launch|go\s+to|start)\s+(?:the\s+)?(.+?)\s*[.!?]*$/i);
  const directDestination = directWeb ? externalWebTarget(directWeb[1]) : null;
  if (directDestination) return { route: 'TOOL_CALL', capability: 'browser.external.open', args: directDestination, confidence: 1 };
  const destinations = [
    { pattern: /(?:\b(?:youtube|you\s*tube)\b|यूट्यूब|योट्यूब)/i, url: 'https://www.youtube.com', label: 'YouTube' },
    { pattern: /\binstagram\b/i, url: 'https://www.instagram.com', label: 'Instagram' },
    { pattern: /\bgmail\b/i, url: 'https://mail.google.com', label: 'Gmail' },
    { pattern: /\bwhats?app\b/i, url: 'https://web.whatsapp.com', label: 'WhatsApp' },
  ];
  const destination = destinations.find((item) => item.pattern.test(command));
  const explicitBrowserOpen = /^(?:open|launch|go\s+to|start|ओपन|खोलो?|पन)\b/i.test(command);
  if (destination && (explicitBrowserOpen || shortVoiceCommand)) return { route: 'TOOL_CALL', capability: 'browser.external.open', args: { url: destination.url, label: destination.label }, confidence: explicitBrowserOpen ? 1 : 0.96 };
  const windowCommand = command.match(/^(focus|switch to|minimize|maximize|restore|close)\s+(.+?)\s*[.!?]*$/i);
  if (windowCommand && !/^(it|this|that)$/i.test(windowCommand[2]) && !/\b(and|then)\b/i.test(windowCommand[2])) return { route: 'TOOL_CALL', capability: `windows.${/focus|switch to/i.test(windowCommand[1]) ? 'focus' : windowCommand[1].toLowerCase()}`, args: { target: windowCommand[2] }, confidence: 0.96 };
  if (/^(what app am i using|what is the active window|show active window)[?!]*$/i.test(command)) return { route: 'TOOL_CALL', capability: 'windows.get_active', args: {}, confidence: 1 };
  if (/^(take|capture)( a)? screenshot[.!?]*$/i.test(command)) return { route: 'TOOL_CALL', capability: 'screen.capture', args: { scope: 'desktop' }, confidence: 1 };
  if (/^(what(?:'s| is) (?:on|visible on) (?:my |the )?screen|describe (?:my |the )?screen|understand (?:my |the )?screen)[.!?]*$/i.test(command)) return { route: 'TOOL_CALL', capability: 'screen.perceive', args: { scope: 'desktop', question: command }, confidence: 0.99 };
  if (/^(list|show) (installed )?(apps|applications)[.!?]*$/i.test(command)) return { route: 'TOOL_CALL', capability: 'apps.list', args: {}, confidence: 1 };
  const genericApp = command.match(/^(?:open|launch|start)\s+(?:the\s+)?([\p{L}\p{N}][\p{L}\p{N} +_-]{0,100})[.!?]*$/iu);
  if (genericApp && !/\b(and|then|file|folder|repository|repo|it|this|that|workflow|task)\b/i.test(genericApp[1])) return { route: 'TOOL_CALL', capability: 'system.app.open', args: { app: genericApp[1].trim() }, confidence: 0.96 };
  const volume = command.match(/^(?:set\s+)?volume\s+(?:to\s+)?(\d{1,3})\s*%?[.!?]*$/i);
  if(volume&&Number(volume[1])<=100)return{route:'TOOL_CALL',capability:'audio.set_volume',args:{volume:Number(volume[1])},confidence:1};
  const relativeVolume=command.match(/^volume\s+(up|down)(?:\s+(\d{1,2}))?[.!?]*$/i);
  if(relativeVolume)return{route:'TOOL_CALL',capability:`audio.volume_${relativeVolume[1].toLowerCase()}`,args:relativeVolume[2]?{amount:Number(relativeVolume[2])}:{},confidence:1};
  if(/^(mute|unmute|toggle mute)[.!?]*$/i.test(command))return{route:'TOOL_CALL',capability:/^unmute/i.test(command)?'audio.unmute':/^toggle/i.test(command)?'audio.toggle_mute':'audio.mute',args:{},confidence:1};
  if(/^(play|pause|toggle play(?:back)?|next(?: song| track)?|previous(?: song| track)?)[.!?]*$/i.test(command)){
    const action=/^toggle/i.test(command)?'toggle':command.match(/^\w+/)[0].toLowerCase();return{route:'TOOL_CALL',capability:`media.${action}`,args:{},confidence:1};
  }
  const latestEmail = value.match(/\b(?:latest|last|recent|newest)\s*(\d{1,2})?\s*(?:e-?mails?|mails?)\b/i);
  if (latestEmail) return { route: 'TOOL_CALL', capability: 'gmail.latest', args: { limit: Math.min(20, Math.max(1, Number(latestEmail[1] || 4))) }, confidence: 0.99 };
  if (/\b(?:any|check|show|do i have|are there)\s+(?:new|unread)\s+(?:e-?mails?|mails?)\b|\b(?:new|unread)\s+(?:e-?mails?|mails?)\s+(?:for|to)\s+me\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'gmail.search', args: { query: 'is:unread', limit: 10 }, confidence: 0.99 };
  if (/^(show|list|what are)\s+(my\s+)?tasks\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'tasks.list', args: {}, confidence: 0.99 };
  const createTask = value.match(/^(?:create|add|remember)\s+(?:a\s+)?task\s*[:\-]?\s*(.+)$/i);
  if (createTask) return { route: 'TOOL_CALL', capability: 'tasks.create', args: { title: createTask[1].trim() }, confidence: 0.99 };
  if (/\b(provider|model|router)\b.*\b(using|active|current)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'runtime.telemetry', args: {}, confidence: 0.98 };
  if (/^(what('?s| is) in|read)\s+(the\s+)?readme/i.test(value)) return { route: 'TOOL_CALL', capability: 'files.read', args: { path: 'README.md' }, confidence: 0.99 };
  if (/\b(health|diagnostics|system status)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'diagnostics', args: {}, confidence: 0.98 };
  if (/\b(remember|decision|architecture)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'memory.search', args: { query: value }, confidence: 0.9 };
  return { route: 'MODEL', capability: null, args: {}, confidence: 0.7 };
}
