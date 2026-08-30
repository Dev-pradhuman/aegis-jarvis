import crypto from 'node:crypto';

export function embed(text, dimensions = 64) {
  const vector = Array(dimensions).fill(0);
  const tokens = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const token of tokens) { const hash = crypto.createHash('sha256').update(token).digest(); for (let i = 0; i < 4; i += 1) vector[hash[i] % dimensions] += 1 / (i + 1); }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function vectorSearch(records, query, limit = 10) {
  const target = embed(query);
  return records.filter((record) => record.embedding).map((record) => ({ ...record, score: record.embedding.reduce((sum, value, index) => sum + value * target[index], 0) })).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function extractDocument(content) {
  const text = String(content).replace(/\s+/g, ' ').trim();
  const sentences = text ? text.split(/(?<=[.!?])\s+/).filter(Boolean) : [];
  return { characters: text.length, words: text ? text.split(/\s+/).length : 0, sentences: sentences.length, headings: String(content).split(/\r?\n/).filter((line) => /^#{1,6}\s|^[A-Z][^.!?]{2,80}$/.test(line.trim())).slice(0, 50), chunks: sentences.reduce((chunks, sentence, index) => { const bucket = Math.floor(index / 8); (chunks[bucket] ||= []).push(sentence); return chunks; }, []).map((chunk, index) => ({ index, text: chunk.join(' ') })) };
}

export function mcpResponse(id, result) { return { jsonrpc: '2.0', id, result }; }
export function mcpError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

export function adapterStatus() {
  const slack = Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID);
  return { calendar: { protocol: slack ? 'Slack scheduled messages' : 'REST/CalDAV adapter', configured: Boolean(process.env.CALENDAR_API_URL) || slack, endpoint: process.env.CALENDAR_API_URL || (slack ? 'https://slack.com/api/chat.scheduleMessage' : null) }, messaging: { protocol: slack ? 'Slack Web API' : 'REST/webhook adapter', configured: Boolean(process.env.MESSAGING_TOKEN) || slack, endpoint: process.env.MESSAGING_API_URL || (slack ? 'https://slack.com/api/chat.postMessage' : null) }, voice: { browserSpeechRecognition: true, browserSpeechSynthesis: true, serverTts: Boolean(process.env.VOICE_TTS_URL), serverStt: Boolean(process.env.VOICE_STT_URL) }, hardware: { protocol: process.env.HARDWARE_TRANSPORT || 'serial/mqtt adapter', configured: Boolean(process.env.HARDWARE_ENDPOINT), endpoint: process.env.HARDWARE_ENDPOINT || null }, auth: { mode: process.env.JARVIS_AUTH_TOKEN ? 'bearer-token' : 'local-trusted', configured: Boolean(process.env.JARVIS_AUTH_TOKEN), secretsPersisted: false } };
}
