import crypto from 'node:crypto';

const allowedEvents = new Set(['device.status', 'call.incoming', 'call.active', 'call.ended', 'notification.received']);
const allowedCapabilities = new Set(['battery', 'network', 'call_events', 'notifications']);
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function pairDevice(state, input, pairingCode = process.env.JARVIS_DEVICE_PAIRING_CODE) {
  if (!pairingCode || typeof input.pairingCode !== 'string' || !safeEqual(input.pairingCode, pairingCode)) throw Object.assign(new Error('Valid device pairing code required'), { code: 'DEVICE_PAIRING_DENIED' });
  const id = String(input.deviceId || '').trim();
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(id)) throw Object.assign(new Error('Invalid device ID'), { code: 'DEVICE_ID_INVALID' });
  const token = crypto.randomBytes(32).toString('hex');
  state.devices ??= [];
  const device = { id, name: String(input.name || id).slice(0, 80), tokenHash: hash(token), capabilities: [], pairedAt: new Date().toISOString(), lastSeenAt: null, lastEvent: null, revoked: false };
  state.devices = [device, ...state.devices.filter((item) => item.id !== id)].slice(0, 10);
  return { token, device: publicDevice(device) };
}

function safeEqual(a, b) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function publicDevice(device) {
  const { tokenHash, ...publicFields } = device;
  return { ...publicFields, connected: !device.revoked && Boolean(device.lastSeenAt) && Date.now() - Date.parse(device.lastSeenAt) < 60_000 };
}

export function deviceStatus(state) {
  return { configured: Boolean(process.env.JARVIS_DEVICE_PAIRING_CODE), devices: (state.devices || []).map(publicDevice), events: (state.deviceEvents || []).slice(0, 30) };
}

export function ingestDeviceEvent(state, token, input) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('Paired device token required'), { code: 'DEVICE_UNAUTHORIZED' });
  const device = (state.devices || []).find((item) => item.id === input.deviceId && !item.revoked && safeEqual(item.tokenHash, hash(token)));
  if (!device) throw Object.assign(new Error('Unknown or revoked device'), { code: 'DEVICE_UNAUTHORIZED' });
  const type = String(input.type || '');
  if (!allowedEvents.has(type)) throw Object.assign(new Error('Unsupported device event'), { code: 'DEVICE_EVENT_INVALID' });
  const at = new Date().toISOString();
  if (type === 'device.status') {
    device.capabilities = (Array.isArray(input.capabilities) ? input.capabilities : []).filter((capability) => allowedCapabilities.has(capability));
    device.battery = Number.isFinite(input.battery) ? Math.max(0, Math.min(100, input.battery)) : null;
    device.network = typeof input.network === 'string' ? input.network.slice(0, 40) : null;
  }
  const event = { id: crypto.randomUUID(), deviceId: device.id, type, at, ...(type.startsWith('call.') ? { number: String(input.number || '').slice(0, 40) || null, contactName: String(input.contactName || '').slice(0, 100) || null } : {}), ...(type === 'notification.received' ? { app: String(input.app || '').slice(0, 80), title: String(input.title || '').slice(0, 160) } : {}) };
  device.lastSeenAt = at; device.lastEvent = type;
  state.deviceEvents = [event, ...(state.deviceEvents || [])].slice(0, 100);
  return { accepted: true, event };
}

export function revokeDevice(state, id) {
  const device = (state.devices || []).find((item) => item.id === id);
  if (!device) return false;
  device.revoked = true; device.tokenHash = null;
  return true;
}
