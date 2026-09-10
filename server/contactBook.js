import crypto from 'node:crypto';

export const CONTACT_PLATFORMS = ['phone', 'whatsapp', 'instagram', 'email', 'gmail', 'discord', 'telegram', 'slack'];

const requestedContacts = [
  ['Papa', ['papa']],
  ['Mma', ['mma', 'maa', 'mama']],
  ['Tution Maam', ['tution maam', 'tuition maam', 'tuition mam', 'tution mam']],
  ['Arjun', ['arjun']],
  ['Aviral', ['aviral']],
  ['Vedant', ['vedant']],
  ['Ayush', ['ayush']],
  ['Ridhima', ['ridhima']],
  ['Prajakta', ['prajakta']],
];

export const normalizeContactName = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const contactId = (name) => `contact-${normalizeContactName(name).replace(/\s+/g, '-') || crypto.randomBytes(4).toString('hex')}`;

function normalizeEndpoints(value = {}) {
  return Object.fromEntries(CONTACT_PLATFORMS.flatMap((platform) => {
    const address = String(value?.[platform] || '').trim();
    return address ? [[platform, address.slice(0, 500)]] : [];
  }));
}

function normalizeAliases(name, aliases = []) {
  return [...new Set([name, ...aliases].map(normalizeContactName).filter(Boolean))].slice(0, 30);
}

export function starterContacts() {
  const now = new Date().toISOString();
  return requestedContacts.map(([name, aliases]) => ({ id: contactId(name), name, aliases: normalizeAliases(name, aliases), endpoints: {}, notes: '', createdAt: now, updatedAt: now }));
}

export function ensureStarterContacts(contacts = []) {
  const output = contacts.map((contact) => ({ ...contact, aliases: normalizeAliases(contact.name, contact.aliases), endpoints: normalizeEndpoints(contact.endpoints) }));
  if (output.length) return output;
  const names = new Set(output.flatMap((contact) => contact.aliases));
  for (const starter of starterContacts()) if (!starter.aliases.some((alias) => names.has(alias))) output.push(starter);
  return output;
}

export function listContacts(state = {}) {
  return ensureStarterContacts(state.contacts || []).sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveContact(state, query) {
  const needle = normalizeContactName(query);
  if (!needle) throw Object.assign(new Error('A contact name or alias is required.'), { code: 'INVALID_ARGUMENTS' });
  const contacts = listContacts(state);
  const exact = contacts.filter((contact) => contact.id === query || contact.aliases.includes(needle));
  const matches = exact.length ? exact : contacts.filter((contact) => contact.aliases.some((alias) => alias.includes(needle) || needle.includes(alias)));
  if (!matches.length) throw Object.assign(new Error(`No saved contact matched “${query}”. Add the contact in Settings → Contact library.`), { code: 'CONTACT_NOT_FOUND' });
  if (matches.length > 1) throw Object.assign(new Error(`Contact is ambiguous. Choose: ${matches.slice(0, 5).map((contact) => contact.name).join(', ')}`), { code: 'CONTACT_AMBIGUOUS' });
  return matches[0];
}

export function availableContactPlatforms(contact) {
  return CONTACT_PLATFORMS.filter((platform) => Boolean(contact?.endpoints?.[platform]));
}

export function upsertContact(state, input = {}) {
  state.contacts = ensureStarterContacts(state.contacts || []);
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw Object.assign(new Error('Contact name is required.'), { code: 'INVALID_ARGUMENTS' });
  const id = String(input.id || contactId(name));
  const index = state.contacts.findIndex((contact) => contact.id === id);
  const existing = index >= 0 ? state.contacts[index] : null;
  const now = new Date().toISOString();
  const contact = {
    id,
    name,
    aliases: normalizeAliases(name, input.aliases || existing?.aliases || []),
    endpoints: normalizeEndpoints(input.endpoints || existing?.endpoints || {}),
    notes: String(input.notes ?? existing?.notes ?? '').slice(0, 1000),
    category: String(input.category ?? existing?.category ?? '').trim().slice(0, 80),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (index >= 0) state.contacts[index] = contact; else state.contacts.push(contact);
  return contact;
}

export function deleteContact(state, id) {
  const before = (state.contacts || []).length;
  state.contacts = (state.contacts || []).filter((contact) => contact.id !== id);
  if (state.contacts.length === before) throw Object.assign(new Error(`Contact not found: ${id}`), { code: 'CONTACT_NOT_FOUND' });
  return id;
}
