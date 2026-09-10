import crypto from 'node:crypto';

const sessions = new Map();

export function createSession(user = 'local-operator') {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, createdAt: Date.now() });
  return { token, user, expiresIn: 86400 };
}
export function validSession(token) { const item = sessions.get(token); return item && Date.now() - item.createdAt < 86_400_000; }

export async function calendarRequest(method, payload = {}) {
  const endpoint = process.env.CALENDAR_API_URL;
  // Slack scheduled messages are reminder delivery, not calendar events.
  if (false && !endpoint && process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID && method === 'POST') {
    const response = await fetch('https://slack.com/api/chat.scheduleMessage', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }, body: JSON.stringify({ channel: process.env.SLACK_CHANNEL_ID, text: payload.text || `${payload.title || 'Calendar reminder'}${payload.when ? ` · ${payload.when}` : ''}`, post_at: Number(payload.post_at || Math.floor(new Date(payload.start || payload.when).getTime() / 1000)) }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(`Slack calendar scheduling failed: ${data.error || response.status}`);
    return { configured: true, provider: 'slack', scheduled: data.scheduled_message_id, data };
  }
  if (!endpoint) return { configured: false, message: 'CALENDAR_API_URL is not configured' };
  const response = await fetch(endpoint, { method, headers: { 'content-type': 'application/json', ...(process.env.CALENDAR_API_KEY ? { authorization: `Bearer ${process.env.CALENDAR_API_KEY}` } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Calendar provider returned HTTP ${response.status}`);
  return { configured: true, data: await response.json() };
}

export async function sendMessage(payload = {}) {
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
    const response = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }, body: JSON.stringify({ channel: payload.channel || process.env.SLACK_CHANNEL_ID, text: payload.text || payload.message }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(`Slack message failed: ${data.error || response.status}`);
    return { configured: true, provider: 'slack', delivered: true, ts: data.ts };
  }
  const endpoint = process.env.MESSAGING_API_URL || process.env.SLACK_WEBHOOK_URL;
  if (!endpoint) return { configured: false, message: 'MESSAGING_API_URL or SLACK_WEBHOOK_URL is not configured' };
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.MESSAGING_TOKEN ? { authorization: `Bearer ${process.env.MESSAGING_TOKEN}` } : {}) }, body: JSON.stringify(process.env.SLACK_WEBHOOK_URL ? { text: payload.text || payload.message } : payload) });
  if (!response.ok) throw new Error(`Messaging provider returned HTTP ${response.status}`);
  return { configured: true, delivered: true, status: response.status };
}

export async function hardwareCommand(payload = {}) {
  const endpoint = process.env.HARDWARE_ENDPOINT;
  if (!endpoint) return { configured: false, message: 'HARDWARE_ENDPOINT is not configured' };
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.HARDWARE_TOKEN ? { authorization: `Bearer ${process.env.HARDWARE_TOKEN}` } : {}) }, body: JSON.stringify({ command: payload.command, args: payload.args || {} }) });
  if (!response.ok) throw new Error(`Hardware endpoint returned HTTP ${response.status}`);
  return { configured: true, data: await response.json().catch(() => ({})) };
}
