import crypto from 'node:crypto';
import { normalizeContactName, resolveContact } from './contactBook.js';
import { searchWhatsAppRecipients } from './whatsappWeb.js';
import { searchInstagramRecipients } from './connectedMessages.js';
import { searchInstagramWebRecipients } from './instagramWeb.js';

const platformCodes = {
  whatsapp: { notFound: 'WHATSAPP_RECIPIENT_NOT_FOUND', ambiguous: 'WHATSAPP_RECIPIENT_AMBIGUOUS' },
  instagram: { notFound: 'INSTAGRAM_RECIPIENT_NOT_FOUND', ambiguous: 'INSTAGRAM_RECIPIENT_AMBIGUOUS' },
};
function failure(code, message, details = null) { return Object.assign(new Error(message), { code, details }); }
const normalized = (value) => normalizeContactName(String(value || '').replace(/^@/, ''));

export function rankRecipientCandidates(requested, candidates = []) {
  const needle = normalized(requested); const usernameRequest = String(requested || '').trim().startsWith('@');
  return candidates.map((candidate) => {
    const username = normalized(candidate.username); const display = normalized(candidate.displayName); let confidence = 0;
    if (username && username === needle) confidence = usernameRequest ? 1 : 0.98;
    else if (display && display === needle) confidence = 0.96;
    else if (username && (username.includes(needle) || needle.includes(username))) confidence = 0.82;
    else if (display && (display.includes(needle) || needle.includes(display))) confidence = 0.78;
    return { ...candidate, confidence };
  }).filter((candidate) => candidate.confidence >= 0.75).sort((left, right) => right.confidence - left.confidence);
}

export async function searchMessagingRecipients(platform, query, options = {}) {
  if (platform === 'whatsapp') return rankRecipientCandidates(query, await searchWhatsAppRecipients(query, options.browserOptions || {}));
  if (platform === 'instagram') {
    let providerCandidates = [];
    try { providerCandidates = await searchInstagramRecipients(query, options.instagramDependencies || {}); }
    catch (error) { if (!['CONFIG_REQUIRED', 'CONFIGURATION_MISSING', 'AUTHENTICATION_REQUIRED', 'CAPABILITY_UNAVAILABLE', 'PROVIDER_ERROR'].includes(error.code)) throw error; }
    const providerMatches = rankRecipientCandidates(query, providerCandidates);
    if (providerMatches.length) return providerMatches;
    return rankRecipientCandidates(query, await searchInstagramWebRecipients(query, options.browserOptions || {}));
  }
  throw failure('INVALID_ARGUMENTS', `Recipient discovery is not supported for ${platform}.`);
}

function safeSavedContact(state, query) {
  try { return resolveContact(state, query); }
  catch (error) { if (!['CONTACT_NOT_FOUND', 'CONTACT_AMBIGUOUS'].includes(error.code)) throw error; return null; }
}

export async function resolveMessagingRecipient(state, args, options = {}) {
  const platform = String(args.platform || '').toLowerCase(); const codes = platformCodes[platform];
  if (!codes) throw failure('INVALID_ARGUMENTS', `Recipient discovery is not supported for ${platform}.`);
  if (args.endpoint && args.resolutionSource) return { platform, platformIdentity: args.endpoint, endpoint: args.endpoint, displayName: args.resolvedDisplayName || args.contact, canonicalContactId: args.contactId || null, resolutionSource: args.resolutionSource, confidence: Number(args.resolutionConfidence ?? 1) };
  const contact = safeSavedContact(state, args.contactId || args.contact);
  const savedEndpoint = String(args.endpoint || contact?.endpoints?.[platform] || '').trim();
  if (savedEndpoint) return { platform, platformIdentity: savedEndpoint, endpoint: savedEndpoint, displayName: contact?.name || args.contact, canonicalContactId: contact?.id || null, resolutionSource: args.endpoint ? 'explicit_identity' : 'saved_contact', confidence: 1 };
  const requested = String(args.contact || contact?.name || '').trim();
  if (!requested) throw failure('INVALID_ARGUMENTS', 'A recipient name, username, or phone number is required.');
  const discovered = await searchMessagingRecipients(platform, requested, options);
  const ranked = rankRecipientCandidates(requested, discovered);
  if (!ranked.length) throw failure(codes.notFound, `No ${platform} recipient matched “${requested}”.`, { platform, requestedRecipient: requested });
  const strongest = ranked.filter((candidate) => candidate.confidence >= ranked[0].confidence - 0.02);
  if (strongest.length !== 1) throw failure(codes.ambiguous, `Multiple ${platform} recipients matched “${requested}”.`, { platform, requestedRecipient: requested, candidates: strongest.slice(0, 8) });
  const selected = strongest[0];
  return { platform, platformIdentity: selected.platformIdentity, endpoint: selected.platformIdentity, displayName: selected.displayName || selected.username || requested, username: selected.username || null, canonicalContactId: contact?.id || null, resolutionSource: selected.resolutionSource || 'platform_search', confidence: selected.confidence, disambiguationMetadata: selected.disambiguationMetadata || null };
}

export function createPendingMessagingIntent(state, input = {}) {
  const now = Date.now();
  const pending = { id: `message-intent-${now}-${crypto.randomBytes(3).toString('hex')}`, workflowId: input.runId, runId: input.runId, stepId: input.stepId, toolCallId: input.toolCallId, idempotencyKey: input.idempotencyKey, jarvisSessionId: input.jarvisSessionId || null, originatingBackend: input.originatingBackend || null, platform: input.arguments.platform, requestedRecipient: input.arguments.contact, message: input.arguments.message, originalArguments: structuredClone(input.arguments), candidates: structuredClone(input.candidates || []), status: 'AMBIGUOUS_RECIPIENT', createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 10 * 60_000).toISOString() };
  state.pendingMessagingIntents ??= []; state.pendingMessagingIntents.unshift(pending); state.pendingMessagingIntents = state.pendingMessagingIntents.slice(0, 50); return pending;
}

function selectedIndex(text) {
  const value = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, ''); const words = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4 };
  const word = value.match(/^(?:the\s+)?(first|second|third|fourth|fifth)(?:\s+one)?$/)?.[1]; if (word) return words[word];
  const number = value.match(/^(?:number\s*)?(\d+)$/)?.[1]; return number ? Number(number) - 1 : null;
}

export function pendingMessagingResolution(state, text, options = {}) {
  const index = selectedIndex(text); if (index === null) return null; const now = Date.now();
  const pending = (state.pendingMessagingIntents || []).filter((item) => item.status === 'AMBIGUOUS_RECIPIENT' && Date.parse(item.expiresAt) > now && (!options.sessionId || !item.jarvisSessionId || item.jarvisSessionId === options.sessionId));
  if (pending.length !== 1) return pending.length > 1 ? { multiple: pending } : null;
  const intent = pending[0]; const candidate = intent.candidates[index]; return candidate ? { intent, candidate, index } : { invalidSelection: true, intent };
}

export function resolvedIntentArguments(intent, candidate) {
  return { ...intent.originalArguments, endpoint: candidate.platformIdentity, contactId: candidate.canonicalContactId || intent.originalArguments.contactId, resolvedDisplayName: candidate.displayName || candidate.username || intent.requestedRecipient, resolutionSource: candidate.resolutionSource || 'platform_search', resolutionConfidence: candidate.confidence };
}
