import { isSpotifyInstalled } from './spotify.js';

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
    .replace(/^(?:(?:hey|hi|ok|okay|hello)\s+)?(?:jarvis[, ]+)?(?:(?:can|could|would|will)\s+(?:you|u)\s+)?(?:(?:please|pls)\s+)?/i, '')
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

export function extractSignInTargets(targetText) {
  if (!targetText) return [];
  const text = String(targetText).toLowerCase();
  const urls = [];

  const known = resolveKnownSiteOrDomain(targetText);
  if (known && known.url) {
    urls.push(known.url);
  }

  if (/insta(?:gram)?\b/.test(text) && !urls.includes('https://www.instagram.com')) urls.push('https://www.instagram.com');
  if (/discord\b/.test(text) && !urls.includes('https://discord.com/app')) urls.push('https://discord.com/app');
  if (/whatsapp\b/.test(text) && !urls.includes('https://web.whatsapp.com')) urls.push('https://web.whatsapp.com');
  if (/github\b/.test(text) && !urls.includes('https://github.com')) urls.push('https://github.com');
  if (/(?:twitter|x\.com)\b/.test(text) && !urls.includes('https://x.com')) urls.push('https://x.com');
  if (/reddit\b/.test(text) && !urls.includes('https://www.reddit.com')) urls.push('https://www.reddit.com');
  if (/(?:google|gmail)\b/.test(text) && !urls.includes('https://mail.google.com')) urls.push('https://mail.google.com');

  if (!urls.length) {
    if (/^https?:\/\//i.test(targetText)) {
      urls.push(targetText.trim());
    } else if (targetText.trim() && !/^(?:accounts?|all|my|some)$/i.test(targetText.trim())) {
      urls.push(`https://${targetText.trim().replace(/^www\./i, '')}`);
    }
  }
  return urls;
}

export function cleanConversationalPrompt(text) {
  let value = String(text || '').trim();
  // Normalize common typo opeen -> open
  value = value.replace(/\bope+n\b/gi, 'open');
  // Strip conversational prefixes and interjections
  value = value.replace(/^(?:(?:hey|yo|hi|ok|okay|hello)\s+)?(?:jarvis[, ]+)?/i, '');
  // Strip conversational preamble clauses (e.g. "my speakers are way too loud,", "it's too loud,", "it's too quiet,")
  value = value.replace(/^(?:(?:my\s+)?(?:speakers?|audio|sound)\s+(?:are|is)\s+(?:way\s+)?too\s+(?:loud|quiet|high|low)[, ]*)/i, '');
  value = value.replace(/^(?:(?:it(?:'s|\s+is))\s+(?:way\s+)?too\s+(?:loud|quiet|high|low)[, ]*)/i, '');
  // Strip secondary modal politeness prefixes (e.g. "can you", "could you please")
  value = value.replace(/^(?:(?:can|could|would|will)\s+(?:you|u)\s+)?(?:(?:please|pls)\s+)?/i, '');
  // Strip trailing punctuation
  value = value.replace(/[.!?]+$/, '').trim();
  // Strip conversational suffixes / fillers
  value = value.replace(/\s+(?:for\s+me|please|pls|right\s+now|now|real\s+quick|today)\s*$/i, '').trim();
  value = value.replace(/[.!?]+$/, '').trim();
  return value;
}

export function routeRequest(text) {
  const raw = String(text).trim();
  const value = cleanConversationalPrompt(raw);

  // Natural screen activity and vision prompts
  if (/^(?:what\s+am\s+i\s+(?:doing|working\s+on)|what(?:'s| is)\s+(?:on\s+)?(?:my\s+)?screen|look\s+at\s+(?:my\s+)?screen|check\s+(?:my\s+)?screen|inspect\s+(?:my\s+)?screen|describe\s+(?:my\s+)?screen)$/i.test(value)) {
    return { route: 'TOOL_CALL', capability: 'screen.describe', args: { target: 'desktop' }, confidence: 0.99 };
  }
  if (/^(?:take\s+a\s+look\s+at|what(?:'s| is)\s+on|describe|inspect|look\s+at)\s+(?:the\s+|my\s+)?(?:current\s+|active\s+)?window$/i.test(value)) {
    return { route: 'TOOL_CALL', capability: 'screen.describe', args: { target: 'window' }, confidence: 0.99 };
  }

  const timerMatch = value.match(/^(?:set\s+(?:a\s+)?timer\s+(?:for\s+)?|timer\s+(?:for\s+)?|start\s+(?:a\s+)?(?:timer\s+for\s+)?)(\d{1,4})\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)(?:\s+(?:for|to|called)\s+(.{1,100}))?$/i) ||
    raw.match(/^(?:jarvis[, ]+)?(?:set\s+(?:a\s+)?timer\s+(?:for\s+)?|timer\s+(?:for\s+)?|start\s+(?:a\s+)?(?:timer\s+for\s+)?)(\d{1,4})\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)(?:\s+(?:for|to|called)\s+(.{1,100}))?[.!]?$/i);
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
  const alarmMatch = value.match(/^(?:wake\s+me\s+up\s+at|set\s+(?:an?\s+)?alarm\s+(?:for|at))\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i) ||
    raw.match(/^(?:jarvis[, ]+)?(?:wake\s+me\s+up\s+at|set\s+(?:an?\s+)?alarm\s+(?:for|at))\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)[.!]?$/i);
  if (alarmMatch) {
    const hour = Number(alarmMatch[1]), minute = Number(alarmMatch[2] || 0);
    if (hour >= 1 && hour <= 12 && minute <= 59) {
      const due = new Date();
      due.setHours(hour % 12 + (alarmMatch[3].toLowerCase() === 'pm' ? 12 : 0), minute, 0, 0);
      if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
      return { route: 'TOOL_CALL', capability: 'reminders.create', args: { title: `Alarm (${hour}:${String(minute).padStart(2, '0')} ${alarmMatch[3].toUpperCase()})`, dueAt: due.toISOString(), category: 'alarm' }, confidence: 0.99 };
    }
  }
  const relativeReminder = value.match(/^remind me in (\d{1,4}) (minutes?|hours?|days?)\s+(?:to|about)\s+(.{1,300})$/i) ||
    raw.match(/^(?:jarvis[, ]+)?remind me in (\d{1,4}) (minutes?|hours?|days?)\s+(?:to|about)\s+(.{1,300})$/i);
  if (relativeReminder) {
    const count = Number(relativeReminder[1]);
    const unit = relativeReminder[2].toLowerCase().startsWith('minute') ? 60_000 : relativeReminder[2].toLowerCase().startsWith('hour') ? 3_600_000 : 86_400_000;
    if (count > 0) return { route: 'TOOL_CALL', capability: 'reminders.create', args: { title: relativeReminder[3], dueAt: new Date(Date.now() + count * unit).toISOString(), category: 'reminder' }, confidence: 0.99 };
  }
  const clockReminder = value.match(/^remind me at (\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+(?:to|about)\s+(.{1,300})$/i) ||
    raw.match(/^(?:jarvis[, ]+)?remind me at (\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+(?:to|about)\s+(.{1,300})$/i);
  if (clockReminder) {
    const hour = Number(clockReminder[1]), minute = Number(clockReminder[2] || 0);
    if (hour >= 1 && hour <= 12 && minute <= 59) {
      const due = new Date(); due.setHours(hour % 12 + (clockReminder[3].toLowerCase() === 'pm' ? 12 : 0), minute, 0, 0);
      if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
      return { route: 'TOOL_CALL', capability: 'reminders.create', args: { title: clockReminder[4], dueAt: due.toISOString(), category: 'reminder' }, confidence: 0.99 };
    }
  }
  const snoozeMatch = value.match(/^snooze(?:\s+(?:the|that|this|my))?(?:\s+(?:reminder|alarm|timer))?(?:\s+(?:for\s+)?(\d{1,3})\s*(?:more\s+)?(?:minutes?|mins?))?$/i) ||
    raw.match(/^(?:jarvis[, ]+)?snooze(?:\s+the)?(?:\s+(?:reminder|alarm|timer))?(?:\s+(?:for\s+)?(\d{1,3})\s*(?:minutes?|mins?))?[.!]?$/i);
  if (snoozeMatch) {
    const minutes = Number(snoozeMatch[1] || 10);
    return { route: 'TOOL_CALL', capability: 'reminders.snooze', args: { snoozeMinutes: minutes, minutes }, confidence: 0.99 };
  }
  const dismissMatch = value.match(/^(?:dismiss|stop|turn\s+off)(?:\s+(?:the|that|this|my)\s+)?(?:ringing|current|due)?\s*(?:reminder|alarm|timer)$/i) ||
    raw.match(/^(?:jarvis[, ]+)?(?:dismiss|stop|turn\s+off)(?:\s+(?:the\s+)?(?:ringing|current|due)?\s*(?:reminder|alarm|timer))[.!]?$/i);
  if (dismissMatch) {
    return { route: 'TOOL_CALL', capability: 'reminders.complete', args: {}, confidence: 0.99 };
  }
  if (/^(?:show|list|what are|get|check)\s+(?:all\s+)?(?:my\s+)?(?:active\s+|current\s+|pending\s+)?(?:reminders|alarms|timers)\??$/i.test(value) || /\b(?:what are my active reminders|active reminders|my reminders|what timers or reminders do i have running)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'reminders.list', args: {}, confidence: 0.99 };
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
  const setVolume = value.match(/^(?:set\s+(?:the\s+)?(?:system\s+)?volume\s+(?:to\s+)?|volume\s+)(\d{1,3})%?$/i);
  if (setVolume && Number(setVolume[1]) <= 100) return { route: 'TOOL_CALL', capability: 'audio.set_volume', args: { volume: Number(setVolume[1]) }, confidence: 0.99 };
  if (/^(?:mute|mute audio|mute volume|mute the (?:sound|audio|volume)|mute sound)$/i.test(value)) return { route: 'TOOL_CALL', capability: 'audio.mute', args: {}, confidence: 0.99 };
  if (/^(?:unmute|unmute audio|unmute volume|unmute the (?:sound|audio|volume)|unmute sound)$/i.test(value)) return { route: 'TOOL_CALL', capability: 'audio.unmute', args: {}, confidence: 0.99 };
  const adjustVolume = value.match(/(?:turn\s+(?:the\s+)?(?:speaker\s+|system\s+)?volume\s+(down|up|lower|higher)|(?:turn\s+)?(?:speaker\s+|system\s+)?volume\s+(down|up|lower|higher)|(lower|drop|decrease|raise|increase|bump)\s+(?:the\s+)?(?:speaker\s+|system\s+)?volume)(?:\s+(?:by\s+)?(\d{1,3}))?\s*(?:%|percent)?/i) ||
    raw.match(/(?:turn\s+(?:the\s+)?(?:speaker\s+|system\s+)?volume\s+(down|up|lower|higher)|(?:turn\s+)?(?:speaker\s+|system\s+)?volume\s+(down|up|lower|higher)|(lower|drop|decrease|raise|increase|bump)\s+(?:the\s+)?(?:speaker\s+|system\s+)?volume)(?:\s+(?:by\s+)?(\d{1,3}))?\s*(?:%|percent)?/i);
  if (adjustVolume) {
    const rawDir = (adjustVolume[1] || adjustVolume[2] || adjustVolume[3] || '').toLowerCase();
    const isDown = /down|lower|drop|decrease/.test(rawDir);
    const step = adjustVolume[4] ? Math.min(100, Number(adjustVolume[4])) : 5;
    return { route: 'TOOL_CALL', capability: isDown ? 'audio.volume_down' : 'audio.volume_up', args: { step }, confidence: 0.99 };
  }
  if (/^(?:what(?:'s| is) (?:the |my )?(?:system )?volume|show (?:system )?volume|volume status|whats my (?:system )?volume)\??$/i.test(value)) return { route: 'TOOL_CALL', capability: 'audio.get_volume', args: {}, confidence: 0.99 };
  const spotifyPlayMatch = value.match(/^(?:play|search\s+and\s+play|listen\s+to|put\s+on|stream)\s+(?:the\s+)?(?:song\s+|track\s+|music\s+)?(.+?)\s+(?:on|in|via|through)\s+spotify(?:\.com)?$/i) ||
    value.match(/^(?:(?:on|in|via|through)\s+)?spotify(?:\.com)?\s+(?:play|search\s+and\s+play|listen\s+to|put\s+on|stream)\s+(?:the\s+)?(?:song\s+|track\s+|music\s+)?(.+)$/i);
  if (spotifyPlayMatch) {
    const rawQuery = (spotifyPlayMatch[1] || '').trim().replace(/^[":']+|[":']+$/g, '');
    if (rawQuery) {
      return {
        route: 'TOOL_CALL',
        capability: 'spotify.play',
        args: { query: rawQuery },
        confidence: 0.99
      };
    }
  }
  const youtubePlayMatch = value.match(/^(?:play|search\s+and\s+play|listen\s+to|watch|put\s+on|open|stream)\s+(?:the\s+)?(?:song\s+|video\s+|track\s+)?(.+?)\s+(?:on|in)\s+(?:youtube|yt)(?:\.com)?$/i) ||
    value.match(/^(?:(?:on|in)\s+)?(?:youtube|yt)(?:\.com)?\s+(?:play|search\s+and\s+play|listen\s+to|watch|put\s+on|open|stream)\s+(?:the\s+)?(?:song\s+|video\s+|track\s+)?(.+)$/i);
  if (youtubePlayMatch) {
    const rawQuery = (youtubePlayMatch[1] || '').trim().replace(/^[":']+|[":']+$/g, '');
    if (rawQuery) {
      return {
        route: 'TOOL_CALL',
        capability: 'youtube.play',
        args: { query: rawQuery },
        confidence: 0.99
      };
    }
  }
  const mediaStopMatch = value.match(/^(?:stop|pause|halt)(?:\s+(?:the\s+)?(?:music|song|track|media|playback|playing))?$/i);
  if (mediaStopMatch) return { route: 'TOOL_CALL', capability: 'media.pause', args: {}, confidence: 0.99 };
  const genericMediaAction = value.match(/^(play|resume|skip|next|previous|toggle)(?:\s+(?:the\s+)?(?:music|song|track|media|playback))?$/i);
  if (genericMediaAction) return { route: 'TOOL_CALL', capability: `media.${({ resume: 'play', skip: 'next' })[genericMediaAction[1].toLowerCase()] || genericMediaAction[1].toLowerCase()}`, args: {}, confidence: 0.99 };
  const backgroundMusicMatch = value.match(/^(?:play|stream|listen\s+to|put\s+on)\s+(?:the\s+)?(?:song\s+|track\s+|music\s+)?(.+)$/i);
  if (backgroundMusicMatch) {
    const rawSong = (backgroundMusicMatch[1] || '').trim().replace(/^[":']+|[":']+$/g, '');
    if (rawSong && !/^(?:music|song|track|media|playback)$/i.test(rawSong)) {
      const preferSpotify = process.env.PREFER_SPOTIFY === 'true' || (process.env.PREFER_SPOTIFY !== 'false' && isSpotifyInstalled());
      return {
        route: 'TOOL_CALL',
        capability: preferSpotify ? 'spotify.play' : 'media.play_music',
        args: { query: rawSong },
        confidence: 0.99
      };
    }
  }
  if (/^(?:what(?:'s| is) playing|media status|current song)\??$/i.test(value) || /\b(?:what(?:'s| is) playing|what song is playing|media status|current song|playing right now|now playing)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'media.status', args: {}, confidence: 0.99 };
  if (
    /^(?:who are you|who r u|what are you|who is jarvis|identify yourself)\??$/i.test(value) ||
    /^(?:which|what|tell me which)\s+(?:model|llm|ai)\s+(?:are you|is this|do you use|are you using|running)\??$/i.test(value) ||
    /^(?:which|what)\s+model\s+(?:are you|are u)\??$/i.test(value) ||
    /^(?:which|what|list|show).{0,35}\bmodels?\b.{0,30}(?:available|configured|connected|active|running|using)?\??$/i.test(value)
  ) return { route: 'TOOL_CALL', capability: 'models.list', args: { query: value }, confidence: 0.99 };
  if (/\b(?:mcp servers?|connected mcp|mcp tools?)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'mcp.servers', args: {}, confidence: 0.99 };
  if (/\b(?:project status|what changed in (?:the )?project|what is happening in (?:the )?project|status of (?:the )?project|what files have changed in my git repo)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'projects.status', args: {}, confidence: 0.98 };
  const projectQuestion = value.match(/^(?:what(?:'s| is) happening in|what changed in|status of)\s+(.+?)\??$/i);
  if (projectQuestion) return { route: 'TOOL_CALL', capability: 'projects.status', args: { name: projectQuestion[1].replace(/\?$/, '').trim() }, confidence: 0.96 };
  const research = value.match(/^(?:please\s+)?research\s+(.+?)\??$/i);
  if (research) return { route: 'TOOL_CALL', capability: 'research.plan', args: { topic: research[1].replace(/\?$/, '').trim() }, confidence: 0.97 };
  const media = value.match(/^(?:please\s+)?(?:make|generate|create)\s+(?:me\s+)?(?:an?\s+)?(image|picture|video|clip)\b[\s:,-]*(.*)$/i);
  if (media) return { route: 'TOOL_CALL', capability: 'media.generate', args: { kind: /video|clip/i.test(media[1]) ? 'video' : 'image', prompt: media[2] || value }, confidence: 0.99 };
  const browserSignIn = value.match(/^(?:jarvis[, ]+)?(?:open|launch)\s+(?:the\s+|its\s+)?(?:headless\s+|headed\s+)?browser(?:\s*\(.*?\))?(?:\s+(?:in\s+)?(?:headed|visible|normal)(?:\s+mode)?)?\s+(?:so\s+(?:that\s+)?(?:i\s+can\s+)?|to\s+)?(?:sign|log)\s*in(?:to|\s+to)?(?:\s+(?:to|in|into|my)?\s+)?(.+?)(?:\s+so\s+(?:jarvis|you|we)\s+can\b.*|\s+accounts?.*|\s*[.!?]*$)/i) ||
    value.match(/^(?:jarvis[, ]+)?(?:open|launch)\s+(?:the\s+|its\s+)?(?:headless\s+|headed\s+)?browser(?:\s*\(.*?\))?(?:\s+(?:in\s+)?(?:headed|visible|normal)(?:\s+mode)?)?(?:\s+(?:so\s+(?:that\s+)?(?:i\s+can\s+)?|to\s+)?(?:sign|log)\s*in(?:to|\s+to)?(?:\s+(.+?))?)?[.!?]?$/i) ||
    value.match(/^(?:jarvis[, ]+)?(?:sign|log)\s*in(?:to|\s+to)?(?:\s+(?:to|in|into|on))?\s+(.+?)\s+(?:in|using|via|on)\s+(?:the\s+)?(?:headless\s+|headed\s+)?browser[.!]?$/i);
  if (browserSignIn) {
    const rawTarget = (browserSignIn[1] || '').trim();
    const urls = extractSignInTargets(rawTarget);
    let primaryUrl = urls[0] || null;
    if (!primaryUrl && rawTarget && !/^(?:accounts?|all|my|some)$/i.test(rawTarget)) {
      primaryUrl = /^https?:\/\//i.test(rawTarget) ? rawTarget : `https://${rawTarget.replace(/^www\./i, '')}`;
    }
    return {
      route: 'TOOL_CALL',
      capability: 'browser.handoff',
      args: { url: primaryUrl, urls, isSignIn: true },
      confidence: 0.99
    };
  }
  const browserResume = value.match(/^(?:jarvis[, ]+)?(?:resume(?:\s+the)?\s+browser|continue(?:\s+the)?\s+browser|(?:(?:i\s+(?:have\s+)?)?(?:solved|completed)\s+(?:the\s+)?(?:captcha|challenge|verification))|(?:(?:the\s+)?(?:captcha|challenge|verification)\s+(?:is\s+)?(?:solved|completed|passed|done))|(?:(?:i\s+(?:have\s+)?)?(?:signed|logged)\s*in))[.!]?$/i);
  if (browserResume) {
    return { route: 'TOOL_CALL', capability: 'browser.resume', args: {}, confidence: 0.99 };
  }
  const windowAction = raw.match(/^(?:jarvis[, ]+)?(focus|minimize|maximize|restore|close)\s+(.{2,120})[.!]?$/i);
  if (windowAction) return { route: 'TOOL_CALL', capability: `windows.${windowAction[1].toLowerCase()}`, args: { target: { name: windowAction[2].trim() } }, confidence: 0.99 };
  if (/\b(?:list|show|what\s+are|check\s+what)\s+(?:all\s+)?(?:my\s+)?(?:open\s+)?(?:apps\s+and\s+windows|windows\s+and\s+apps|desktop\s+windows|windows)\b/i.test(value) || /\b(?:apps\s+and\s+windows\s+i\s+have\s+open|what\s+apps\s+and\s+windows)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'windows.list', args: {}, confidence: 0.99 };
  if (/^(?:what(?:'s| is) (?:the )?active window|which window is active|what window am i (?:currently )?focused on)\??$/i.test(value) || /^(?:get|show|check) (?:the )?(?:active|focused|current) window\??$/i.test(value)) return { route: 'TOOL_CALL', capability: 'windows.get_active', args: {}, confidence: 0.99 };

  const conversationalSuffixRegex = /\s+(?:for\s+me|please|pls|right\s+now|now|real\s+quick)\s*[.!?]*$/i;

  const siteOnBrowserMatch = value.match(/^(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis[, ]+)?(?:(?:can|could|would|will)\s+(?:you|u)\s+)?(?:(?:please|pls)\s+)?(?:open|launch|start|go\s+to|navigate\s+to|browse\s+to|visit)\s+(?:the\s+)?(.+?)\s+(?:on|in|using|with)\s+(?:the\s+)?(.+?)(?:\s+(?:browser|app))?[.!?]?$/i);
  if (siteOnBrowserMatch) {
    const rawSite = siteOnBrowserMatch[1].replace(/[.!?]+$/, '').replace(conversationalSuffixRegex, '').trim();
    const rawBrowser = siteOnBrowserMatch[2].replace(/[.!?]+$/, '').replace(conversationalSuffixRegex, '').trim().toLowerCase();
    const site = resolveKnownSiteOrDomain(rawSite);
    const targetUrl = site ? site.url : (/^https?:\/\//i.test(rawSite) ? rawSite : (/\.[a-z]{2,}/i.test(rawSite) ? `https://${rawSite.replace(/^www\./i, '')}` : null));

    if (/(?:my\s+)?default(?:\s+browser)?/i.test(rawBrowser)) {
      if (targetUrl) {
        return {
          route: 'TOOL_CALL',
          capability: 'browser.open',
          args: {
            url: targetUrl,
            label: site ? site.label : targetUrl,
          },
          confidence: 1,
        };
      }
    }

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

  const webOrAppMatch = value.match(/^(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis[, ]+)?(?:(?:can|could|would|will)\s+(?:you|u)\s+)?(?:(?:please|pls)\s+)?(?:open|launch|start|go\s+to|navigate\s+to|browse\s+to|visit)\s+(?:the\s+)?(.+?)(?:\s+(?:app|application|website|web\s+page|site|page))?[.!?]?$/i);
  if (webOrAppMatch) {
    const rawTarget = webOrAppMatch[1].replace(/[.!?]+$/, '').replace(conversationalSuffixRegex, '').trim();
    const site = resolveKnownSiteOrDomain(rawTarget);
    if (site) {
      const isWhatsApp = site === KNOWN_SITES.whatsapp || site.url === 'https://web.whatsapp.com';
      return {
        route: 'TOOL_CALL',
        capability: isWhatsApp ? 'browser.handoff' : 'browser.open',
        args: { url: site.url, label: site.label },
        confidence: 1,
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
  if (/^(show|list|what are)\s+(my\s+)?tasks\b/i.test(value) || /\b(?:what are my tasks|what tasks are|show tasks|list tasks|my to-do list|tasks on my|to-do items)\b/i.test(value)) return { route: 'TOOL_CALL', capability: 'tasks.list', args: {}, confidence: 0.99 };

  const commandMatch = value.match(/^(?:jarvis[, ]+)?(?:execute|run)\s+(?:command|terminal|bash|shell)?\s*:\s*(.+)$/i) ||
    value.match(/^(?:jarvis[, ]+)?(?:execute|run)\s+(?:command|terminal)\s+(.+)$/i);
  if (commandMatch) {
    return { route: 'TOOL_CALL', capability: 'command.execute', args: { command: commandMatch[1].trim() }, confidence: 0.99 };
  }
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
