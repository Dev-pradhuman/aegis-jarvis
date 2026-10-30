export const KNOWN_SITES = {
  instagram: { url: 'https://www.instagram.com', label: 'Instagram' },
  youtube: { url: 'https://www.youtube.com', label: 'YouTube' },
  github: { url: 'https://github.com', label: 'GitHub' },
  whatsapp: { url: 'https://web.whatsapp.com', label: 'WhatsApp' },
  gmail: { url: 'https://mail.google.com', label: 'Gmail' },
  chatgpt: { url: 'https://chatgpt.com', label: 'ChatGPT' },
  claude: { url: 'https://claude.ai', label: 'Claude' },
  gemini: { url: 'https://gemini.google.com', label: 'Gemini' },
  x: { url: 'https://x.com', label: 'X' },
  twitter: { url: 'https://x.com', label: 'Twitter' },
  reddit: { url: 'https://www.reddit.com', label: 'Reddit' },
  linkedin: { url: 'https://www.linkedin.com', label: 'LinkedIn' },
  netflix: { url: 'https://www.netflix.com', label: 'Netflix' },
};

export function resolveKnownSiteOrDomain(input) {
  const trimmed = String(input || '').trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return { url: trimmed, label: parsed.hostname };
    } catch {}
  }
  const clean = trimmed.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/+$/, '');
  const baseKey = clean.replace(/\.(com|org|net|io|ai|dev|app|in|co|so|me|tech)$/, '');
  if (KNOWN_SITES[clean]) return KNOWN_SITES[clean];
  if (KNOWN_SITES[baseKey]) return KNOWN_SITES[baseKey];
  const domainMatch = clean.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(com|org|net|io|ai|dev|app|in|co|so|me|tech))(?:\/[^\s]*)?$/i);
  if (domainMatch) {
    return { url: `https://${clean}`, label: domainMatch[1] };
  }
  return null;
}

export function parseWhatsAppRequest(value) {
  const clean = String(value || '')
    .replace(/^(?:(?:hey|hi|ok|hello)\s+)?(?:jarvis[, ]+)?(?:(?:can|could|would|will)\s+(?:you|u)\s+)?(?:please\s+)?/i, '')
    .replace(/[.!?]+$/, '')
    .trim();

  // Format 1: send (a) (whatsapp) (message|text|dm) to <recipient> [on whatsapp] [saying/that/: <message>]
  let m = clean.match(/^send\s+(?:a\s+)?(?:whatsapp\s+message|whatsapp|message|text|dm)\s+to\s+([^,:]+?)(?:\s+(?:on|via|through)\s+whatsapp)?(?:\s*[:]\s*|\s+(?:saying|that|with\s+(?:the\s+)?message)\s+)(.+)$/i) ||
          clean.match(/^send\s+(?:a\s+)?(?:whatsapp\s+message|whatsapp)\s+to\s+([^,:]+?)$/i) ||
          clean.match(/^send\s+(?:a\s+)?(?:message|text|dm)\s+to\s+([^,:]+?)\s+(?:on|via|through)\s+whatsapp$/i) ||
          clean.match(/^send\s+([^,:]+?)\s+(?:a\s+)?(?:whatsapp\s+message|whatsapp|message|text|dm)(?:\s+(?:on|via|through)\s+whatsapp)?(?:\s*[:]\s*|\s+(?:saying|that|with\s+(?:the\s+)?message)\s+)(.+)$/i);
  if (m) return { recipient: m[1].trim(), message: m[2]?.trim() || '' };

  // Format 2: (message|text|dm) <recipient> on whatsapp (:|saying|that)? (message)?
  m = clean.match(/^(?:message|text|dm)\s+([^,:]+?)\s+(?:on|via|through)\s+whatsapp(?:\s*[:]\s*|\s+(?:saying|that|with\s+(?:the\s+)?message)\s+)(.+)$/i) ||
      clean.match(/^(?:message|text|dm)\s+([^,:]+?)\s+(?:on|via|through)\s+whatsapp$/i);
  if (m) return { recipient: m[1].trim(), message: m[2]?.trim() || '' };

  // Format 3: whatsapp <recipient> (:|saying|that)? (message)?
  m = clean.match(/^whatsapp\s+([^,:]+?)(?:\s*[:]\s*|\s+(?:saying|that|with\s+(?:the\s+)?message)\s+)(.+)$/i) ||
      clean.match(/^whatsapp\s+([^,:]+?)$/i);
  if (m) return { recipient: m[1].trim(), message: m[2]?.trim() || '' };

  // Fallback for general whatsapp requests
  if (/\bwhatsapp\b/i.test(clean) && /\b(message|text|dm|send)\b/i.test(clean)) {
    const recipMatch = clean.match(/\b(?:to|message|text|dm)\s+([a-zA-Z0-9_-]+)/i);
    return { recipient: recipMatch ? recipMatch[1].trim() : '', message: '' };
  }

  return null;
}

export function routeRequest(text) {
  const value = String(text).trim();
  const timerMatch = value.match(/^(?:jarvis[, ]+)?(?:set\s+(?:a\s+)?timer\s+(?:for\s+)?|timer\s+(?:for\s+)?|start\s+(?:a\s+)?(?:timer\s+for\s+)?)(\d{1,4})\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)(?:\s+(?:for|to|called)\s+(.{1,100}))?[.!]?$/i);
  if (timerMatch) {
    const count = Number(timerMatch[1]);
    const unitStr = timerMatch[2].toLowerCase();
    const unit = unitStr.startsWith('sec') ? 1_000 : unitStr.startsWith('hour') || unitStr.startsWith('hr') ? 3_600_000 : 60_000;
    if (count > 0) {
      const customLabel = (timerMatch[3] || '').trim();
      const title = customLabel || `Timer (${count} ${unitStr})`;
      return { route: 'TOOL_CALL', capability: 'reminders.create', args: { title, dueAt: new Date(Date.now() + count * unit).toISOString(), category: 'timer' }, confidence: 0.99 };
    }
  }
  const alarmMatch = value.match(/^(?:jarvis[, ]+)?(?:wake\s+me\s+up\s+at|set\s+(?:an?\s+)?alarm\s+(?:for|at))\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)[.!]?$/i);
  if (alarmMatch) {
    const hour = Number(alarmMatch[1]), minute = Number(alarmMatch[2] || 0);
    if (hour >= 1 && hour <= 12 && minute <= 59) {
      const due = new Date();
      due.setHours(hour % 12 + (alarmMatch[3].toLowerCase() === 'pm' ? 12 : 0), minute, 0, 0);
      if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
      return { route: 'TOOL_CALL', capability: 'reminders.create', args: { title: `Alarm (${hour}:${String(minute).padStart(2, '0')} ${alarmMatch[3].toUpperCase()})`, dueAt: due.toISOString(), category: 'alarm' }, confidence: 0.99 };
    }
  }
  const relativeReminder = value.match(/^(?:jarvis[, ]+)?remind me in (\d{1,4}) (minutes?|hours?|days?)\s+(?:to|about)\s+(.{1,300})$/i);
  if (relativeReminder) {
    const count = Number(relativeReminder[1]);
    const unit = relativeReminder[2].toLowerCase().startsWith('minute') ? 60_000 : relativeReminder[2].toLowerCase().startsWith('hour') ? 3_600_000 : 86_400_000;
    if (count > 0) return { route: 'TOOL_CALL', capability: 'reminders.create', args: { title: relativeReminder[3], dueAt: new Date(Date.now() + count * unit).toISOString(), category: 'reminder' }, confidence: 0.99 };
  }
  const clockReminder = value.match(/^(?:jarvis[, ]+)?remind me at (\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+(?:to|about)\s+(.{1,300})$/i);
  if (clockReminder) {
    const hour = Number(clockReminder[1]), minute = Number(clockReminder[2] || 0);
    if (hour >= 1 && hour <= 12 && minute <= 59) {
      const due = new Date(); due.setHours(hour % 12 + (clockReminder[3].toLowerCase() === 'pm' ? 12 : 0), minute, 0, 0);
      if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
      return { route: 'TOOL_CALL', capability: 'reminders.create', args: { title: clockReminder[4], dueAt: due.toISOString(), category: 'reminder' }, confidence: 0.99 };
    }
  }
  const snoozeMatch = value.match(/^(?:jarvis[, ]+)?snooze(?:\s+the)?\s+(?:reminder|alarm|timer)?(?:\s+(?:for\s+)?(\d{1,3})\s*(?:minutes?|mins?))?[.!]?$/i);
  if (snoozeMatch) {
    const minutes = Number(snoozeMatch[1] || 10);
    return { route: 'TOOL_CALL', capability: 'reminders.snooze', args: { snoozeMinutes: minutes }, confidence: 0.99 };
  }
  const dismissMatch = value.match(/^(?:jarvis[, ]+)?(?:dismiss|stop|turn\s+off)(?:\s+(?:the\s+)?(?:ringing|current|due)?\s*(?:reminder|alarm|timer))[.!]?$/i);
  if (dismissMatch) {
    return { route: 'TOOL_CALL', capability: 'reminders.complete', args: {}, confidence: 0.99 };
  }
  if (/^(?:show|list|what are)\s+(?:my\s+)?(?:reminders|alarms|timers)\??$/i.test(value)) return { route: 'TOOL_CALL', capability: 'reminders.list', args: {}, confidence: 0.99 };
  const calendarCreateMatch = value.match(/^(?:jarvis[, ]+)?(?:schedule|create|add)(?:\s+(?:a|an))?\s+(?:calendar\s+event|meeting|event|appointment)\s+(?:called\s+|titled\s+|for\s+|named\s+)?(.+?)\s+(?:at|on|for)\s+(.+?)[.!]?$/i) ||
    value.match(/^(?:jarvis[, ]+)?(?:add\s+to\s+(?:my\s+)?calendar)\s+(.+?)\s+(?:at|on|for)\s+(.+?)[.!]?$/i);
  if (calendarCreateMatch) {
    const summary = calendarCreateMatch[1].trim();
    const timeStr = calendarCreateMatch[2].trim();
    let startTime = timeStr;
    const parsedDate = Date.parse(timeStr);
    if (!isNaN(parsedDate)) {
      startTime = new Date(parsedDate).toISOString();
    }
    return {
      route: 'TOOL_CALL',
      capability: 'calendar.create',
      args: {
        summary,
        startTime,
        endTime: !isNaN(parsedDate) ? new Date(parsedDate + 3600000).toISOString() : startTime
      },
      confidence: 0.99
    };
  }
  const gmailSendMatch = value.match(/^(?:jarvis[, ]+)?(?:send\s+(?:an?\s+)?(?:email|gmail)\s+to|email)\s+([^\s,]+@[^\s,]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\S+)(?:\s+(?:with\s+)?subject\s+([^,]+?))?(?:\s+(?:and\s+)?(?:body|message|saying)\s+(.+))?[.!]?$/i);
  if (gmailSendMatch) {
    const to = gmailSendMatch[1].trim();
    const subject = (gmailSendMatch[2] || 'No subject').trim();
    const body = (gmailSendMatch[3] || '').trim();
    return { route: 'TOOL_CALL', capability: 'gmail.send', args: { to, subject, body }, confidence: 0.99 };
  }
  const gmailColonMatch = value.match(/^(?:jarvis[, ]+)?(?:send\s+(?:an?\s+)?(?:email|gmail)\s+to|email)\s+([^\s:]+@[^\s:]+):\s*(.+)$/i);
  if (gmailColonMatch) {
    const to = gmailColonMatch[1].trim();
    const body = gmailColonMatch[2].trim();
    return { route: 'TOOL_CALL', capability: 'gmail.send', args: { to, subject: body.slice(0, 50), body }, confidence: 0.99 };
  }
  const targetedType = value.match(/^(?:jarvis[, ]+)?type\s+(.{1,500}?)\s+into\s+(.{2,120})[.!]?$/i);
  if (targetedType) return { route: 'TOOL_CALL', capability: 'computer.type', args: { text: targetedType[1], target: { name: targetedType[2].trim() } }, confidence: 0.99 };
  const targetedPress = value.match(/^(?:jarvis[, ]+)?press\s+([A-Za-z0-9+ ]{1,60})\s+in\s+(.{2,120})[.!]?$/i);
  if (targetedPress) return { route: 'TOOL_CALL', capability: 'computer.keypress', args: { keys: targetedPress[1].trim(), target: { name: targetedPress[2].trim() } }, confidence: 0.99 };
  const typeText = value.match(/^(?:jarvis[, ]+)?type\s*:\s*([^\r\n]+)$/i);
  if (typeText && typeText[1].length <= 500) return { route: 'TOOL_CALL', capability: 'computer.type', args: { text: typeText[1] }, confidence: 1 };
  const pressKey = value.match(/^(?:jarvis[, ]+)?press\s+(?:(?:the\s+)?(?:key|keys)\s+)?([A-Za-z0-9+ ]{1,60})[.!]?$/i);
  if (pressKey) return { route: 'TOOL_CALL', capability: 'computer.keypress', args: { keys: pressKey[1].trim() }, confidence: 0.99 };
  const setVolume = value.match(/^(?:set\s+(?:the\s+)?(?:system\s+)?volume\s+(?:to\s+)?|volume\s+)(\d{1,3})%?\s*[.!]?$/i);
  if (setVolume && Number(setVolume[1]) <= 100) return { route: 'TOOL_CALL', capability: 'audio.set_volume', args: { volume: Number(setVolume[1]) }, confidence: 0.99 };
  if (/^(?:mute|mute audio|mute volume)[.!]?$/i.test(value)) return { route: 'TOOL_CALL', capability: 'audio.mute', args: {}, confidence: 0.99 };
  if (/^(?:unmute|unmute audio|unmute volume)[.!]?$/i.test(value)) return { route: 'TOOL_CALL', capability: 'audio.unmute', args: {}, confidence: 0.99 };
  const adjustVolume = value.match(/^(?:turn\s+)?volume\s+(up|down)(?:\s+by\s+(\d{1,2}))?\s*[.!]?$/i);
  if (adjustVolume) return { route: 'TOOL_CALL', capability: `audio.volume_${adjustVolume[1].toLowerCase()}`, args: adjustVolume[2] ? { step: Math.min(25, Number(adjustVolume[2])) } : {}, confidence: 0.99 };
  if (/^(?:what(?:'s| is) (?:the )?(?:system )?volume|show (?:system )?volume|volume status)\??$/i.test(value)) return { route: 'TOOL_CALL', capability: 'audio.get_volume', args: {}, confidence: 0.99 };
  const mediaAction = value.match(/^(play|pause|resume|skip|next|previous|toggle)(?:\s+(?:the\s+)?(?:music|song|track|media))?\s*[.!]?$/i);
  if (mediaAction) return { route: 'TOOL_CALL', capability: `media.${({ resume: 'play', skip: 'next' })[mediaAction[1].toLowerCase()] || mediaAction[1].toLowerCase()}`, args: {}, confidence: 0.99 };
  if (/^(?:what(?:'s| is) playing|media status|current song)\??$/i.test(value)) return { route: 'TOOL_CALL', capability: 'media.status', args: {}, confidence: 0.99 };
  if (/^(?:which|what|list|show).{0,35}\bmodels?\b.{0,30}(?:available|configured|connected)?\??$/i.test(value)) return { route: 'TOOL_CALL', capability: 'models.list', args: {}, confidence: 0.99 };
  if (/\b(?:mcp servers?|connected mcp|mcp tools?)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'mcp.servers', args: {}, confidence: 0.99 };
  if (/\b(?:project status|what changed in (?:the )?project|what is happening in (?:the )?project|status of (?:the )?project)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'projects.status', args: {}, confidence: 0.98 };
  const projectQuestion = value.match(/^(?:what(?:'s| is) happening in|what changed in|status of)\s+(.+?)\??$/i);
  if (projectQuestion) return { route: 'TOOL_CALL', capability: 'projects.status', args: { name: projectQuestion[1].replace(/\?$/, '').trim() }, confidence: 0.96 };
  const research = value.match(/^(?:please\s+)?research\s+(.+?)\??$/i);
  if (research) return { route: 'TOOL_CALL', capability: 'research.plan', args: { topic: research[1].replace(/\?$/, '').trim() }, confidence: 0.97 };
  const media = value.match(/^(?:please\s+)?(?:make|generate|create)\s+(?:me\s+)?(?:an?\s+)?(image|picture|video|clip)\b[\s:,-]*(.*)$/i);
  if (media) return { route: 'TOOL_CALL', capability: 'media.generate', args: { kind: /video|clip/i.test(media[1]) ? 'video' : 'image', prompt: media[2] || value }, confidence: 0.99 };
  const browserSignIn = value.match(/^(?:jarvis[, ]+)?(?:open|launch)\s+(?:the\s+)?(?:headless\s+)?browser\s+(?:so\s+i\s+can\s+|to\s+)?(?:sign|log)\s*in(?:to|\s+to)?(?:\s+(.+?))?[.!]?$/i) ||
    value.match(/^(?:jarvis[, ]+)?(?:sign|log)\s*in(?:to|\s+to)?\s+(.+?)\s+(?:in|using|via)\s+(?:the\s+)?(?:headless\s+)?browser[.!]?$/i);
  if (browserSignIn) {
    const rawTarget = (browserSignIn[1] || '').trim();
    let url = rawTarget;
    if (url && !/^https?:\/\//i.test(url)) {
      url = `https://${url.replace(/^www\./i, '')}`;
    }
    return { route: 'TOOL_CALL', capability: 'browser.handoff', args: { url: url || null }, confidence: 0.99 };
  }
  const browserResume = value.match(/^(?:jarvis[, ]+)?(?:resume(?:\s+the)?\s+browser|continue(?:\s+the)?\s+browser|(?:(?:i\s+(?:have\s+)?)?(?:solved|completed)\s+(?:the\s+)?(?:captcha|challenge|verification))|(?:(?:the\s+)?(?:captcha|challenge|verification)\s+(?:is\s+)?(?:solved|completed|passed|done))|(?:(?:i\s+(?:have\s+)?)?(?:signed|logged)\s*in))[.!]?$/i);
  if (browserResume) {
    return { route: 'TOOL_CALL', capability: 'browser.resume', args: {}, confidence: 0.99 };
  }
  const windowAction = value.match(/^(focus|minimize|maximize|restore|close)\s+(.{2,120})[.!]?$/i);
  if (windowAction) return { route: 'TOOL_CALL', capability: `windows.${windowAction[1].toLowerCase()}`, args: { target: { name: windowAction[2].trim() } }, confidence: 0.99 };
  if (/^(?:what(?:'s| is) (?:the )?active window|which window is active)\??$/i.test(value)) return { route: 'TOOL_CALL', capability: 'windows.get_active', args: {}, confidence: 0.99 };

  const wa = parseWhatsAppRequest(value);
  if (wa) {
    return {
      route: 'TOOL_CALL',
      capability: 'browser.handoff',
      args: {
        url: 'https://web.whatsapp.com',
        recipient: wa.recipient || null,
        message: wa.message || null,
        isWhatsAppMessage: true,
      },
      confidence: 0.99,
    };
  }

  const siteOnBrowserMatch = value.match(/^(?:(?:hey|hi|ok)\s+)?(?:jarvis[, ]+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:open|launch|start|go\s+to|navigate\s+to|browse\s+to|visit)\s+(?:the\s+)?(.+?)\s+(?:on|in|using|with)\s+(?:the\s+)?(.+?)(?:\s+(?:browser|app))?[.!?]?$/i);
  if (siteOnBrowserMatch) {
    const rawSite = siteOnBrowserMatch[1].replace(/[.!?]+$/, '').trim();
    const rawBrowser = siteOnBrowserMatch[2].replace(/[.!?]+$/, '').trim().toLowerCase();
    const site = resolveKnownSiteOrDomain(rawSite);
    const targetUrl = site ? site.url : (/^https?:\/\//i.test(rawSite) ? rawSite : (/\.[a-z]{2,}/i.test(rawSite) ? `https://${rawSite.replace(/^www\./i, '')}` : null));

    const browserAliases = {
      brave: 'brave',
      'brave-browser': 'brave',
      chrome: 'chromium',
      chromium: 'chromium',
      firefox: 'firefox',
      zen: 'zen',
      safari: 'safari',
      edge: 'edge',
    };
    const browserKey = rawBrowser.replace(/\s+(?:browser|app)$/i, '').trim();
    const browserName = browserAliases[rawBrowser] || browserAliases[browserKey] || browserKey;

    if (targetUrl) {
      return {
        route: 'TOOL_CALL',
        capability: 'apps.open',
        args: {
          name: browserName,
          url: targetUrl,
          args: [targetUrl],
        },
        confidence: 0.99,
      };
    }
  }

  const webOrAppMatch = value.match(/^(?:(?:hey|hi|ok)\s+)?(?:jarvis[, ]+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:open|launch|start|go\s+to|navigate\s+to|browse\s+to|visit)\s+(?:the\s+)?(.+?)(?:\s+(?:app|application|website|web\s+page|site|page))?[.!?]?$/i);
  if (webOrAppMatch) {
    const rawTarget = webOrAppMatch[1].replace(/[.!?]+$/, '').trim();
    const site = resolveKnownSiteOrDomain(rawTarget);
    if (site) {
      if (site.label === 'YouTube') {
        return { route: 'TOOL_CALL', capability: 'browser.open', args: { url: site.url, label: site.label }, confidence: 1 };
      }
      return {
        route: 'TOOL_CALL',
        capability: 'browser.handoff',
        args: { url: site.url, label: site.label },
        confidence: 0.99
      };
    }
    if (rawTarget.length <= 120 && !/\b(https?:\/\/|[a-z0-9-]+\.(?:com|org|net|io|dev|app|ai|gov|edu)\b|\band\b)/i.test(rawTarget)) {
      return { route: 'TOOL_CALL', capability: 'apps.open', args: { name: rawTarget }, confidence: 0.99 };
    }
  }
  const latestEmail = value.match(/\b(?:latest|last|recent|newest)\s*(\d{1,2})?\s*(?:e-?mails?|mails?)\b/i);
  if (latestEmail) return { route: 'TOOL_CALL', capability: 'gmail.latest', args: { limit: Math.min(20, Math.max(1, Number(latestEmail[1] || 4))) }, confidence: 0.99 };
  const calendarQuery = value.match(/\b(?:upcoming|next|today's|scheduled)?\s*(\d{1,2})?\s*(?:calendar events?|calendar|events?|meetings?|schedules?|agenda)\b/i);
  if (calendarQuery && /^(?:show|list|what(?:'s| is| do i have)?(?: on)?|check|get|fetch|read|do i have any)\b/i.test(value)) {
    return { route: 'TOOL_CALL', capability: 'calendar.upcoming', args: { limit: Math.min(50, Math.max(1, Number(calendarQuery[1] || 10))) }, confidence: 0.99 };
  }
  if (/^(show|list|what are)\s+(my\s+)?tasks\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'tasks.list', args: {}, confidence: 0.99 };
  if (/\b(provider|model|router)\b.*\b(using|active|current)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'runtime.telemetry', args: {}, confidence: 0.98 };
  if (/^(what('?s| is) in|read)\s+(the\s+)?readme/i.test(value)) return { route: 'TOOL_CALL', capability: 'files.read', args: { path: 'README.md' }, confidence: 0.99 };
  if (/\b(health|diagnostics|system status)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'diagnostics', args: {}, confidence: 0.98 };
  if (/\b(remember|decision|architecture)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'memory.search', args: { q: value }, confidence: 0.9 };
  const activeWinVision = value.match(/^(?:jarvis[, ]+)?(?:summarize|describe|look at|what(?:'s| is) (?:on|in)|explain|inspect)\s+(?:the\s+)?(?:current\s+|active\s+)window(?:(?:\s+and\s+|\s*,\s*|\s+)(.+?))?[.!?]?$/i);
  if (activeWinVision) {
    const subPrompt = activeWinVision[1] ? activeWinVision[1].trim() : value;
    return { route: 'TOOL_CALL', capability: 'screen.describe', args: { target: 'window', prompt: subPrompt }, confidence: 0.99 };
  }
  const screenPromptVision = value.match(/^(?:jarvis[, ]+)?(?:look at (?:my |the )?screen(?:\s+and\s+|\s*,\s*|\s+)(.+)|explain (?:this |the )?error on (?:my |the )?screen(?:(?:\s+and\s+|\s*,\s*|\s+)(.+))?)[.!?]?$/i);
  if (screenPromptVision) {
    return { route: 'TOOL_CALL', capability: 'screen.describe', args: { target: 'desktop', prompt: value }, confidence: 0.99 };
  }
  if (/^(?:jarvis[, ]+)?(?:what(?:'s| is) (?:on (?:my |the )?screen(?:\s+right now)?|this)|(?:describe|look at|summarize|inspect) (?:my |the )?screen(?:\s+right now)?)\??$/i.test(value)) {
    return { route: 'TOOL_CALL', capability: 'screen.describe', args: { target: 'desktop' }, confidence: 0.99 };
  }
  if (/^(?:jarvis[, ]+)?(?:what do you see on (?:the |my )?camera|what(?:'s| is) on (?:the |my )?camera|(?:look at|describe) (?:the |my )?camera)\??$/i.test(value)) {
    return { route: 'TOOL_CALL', capability: 'camera.describe', args: {}, confidence: 0.99 };
  }
  return { route: 'MODEL', capability: null, args: {}, confidence: 0.7 };
}
