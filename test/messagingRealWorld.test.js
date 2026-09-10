import test from 'node:test';
import assert from 'node:assert/strict';
import { executeToolCall } from '../server/toolExecutor.js';
import { applyInstagramSyncState, normalizeInstagramMessages } from '../server/connectedMessages.js';
import { pendingMessagingResolution, rankRecipientCandidates, resolveMessagingRecipient, resolvedIntentArguments } from '../server/recipientResolver.js';
import { scoreYouTubeResult } from '../server/youtubeAutomation.js';
import { formatToolReply } from '../server/toolResponses.js';
import { routeRequest } from '../server/router.js';

function state(mode = 'normal') { return { permissionMode: mode, tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {}, toolExecutions: [], contacts: [{ id: 'contact-mma', name: 'Mma', aliases: ['mma'], endpoints: {} }], pendingMessagingIntents: [], instagramSyncState: { conversations: {}, updatedAt: null } }; }
const whatsappCandidate = { platform: 'whatsapp', platformIdentity: 'whatsapp-search:one', displayName: 'Mma', index: 0, resolutionSource: 'whatsapp_web_search' };

test('whatsapp_missing_endpoint_falls_back_to_platform_search and freezes resolution before approval', async () => {
  const value = state();
  const result = await executeToolCall({ toolName: 'communication.send', arguments: { contact: 'Mma', platform: 'whatsapp', message: 'kese ho?' } }, { state: value, browserOptions: { searchAdapter: async () => [whatsappCandidate] } });
  assert.equal(result.status, 'waiting_for_approval');
  assert.equal(result.approval.resolvedArguments.message, 'kese ho?');
  assert.equal(result.approval.resolvedArguments.endpoint, whatsappCandidate.platformIdentity);
});

test('whatsapp_non_jarvis_contact_can_be_resolved', async () => {
  const value = state('skip_permissions'); let sent;
  const result = await executeToolCall({ toolName: 'communication.send', arguments: { contact: 'Platform Person', platform: 'whatsapp', message: 'exact text' } }, { state: value, browserOptions: { searchAdapter: async () => [{ ...whatsappCandidate, displayName: 'Platform Person' }], adapter: async (args) => { sent = args; return { success: true, verified: true, messageId: 'm1' }; } } });
  assert.equal(result.status, 'completed'); assert.equal(sent.message, 'exact text');
});

test('whatsapp_ambiguous_contact_requires_clarification and preserves pending message', async () => {
  const value = state('skip_permissions');
  const candidates = [{ ...whatsappCandidate, platformIdentity: 'one' }, { ...whatsappCandidate, platformIdentity: 'two' }];
  const result = await executeToolCall({ toolName: 'communication.send', arguments: { contact: 'Mma', platform: 'whatsapp', message: 'kese ho?' } }, { state: value, conversationId: 'chat-1', browserOptions: { searchAdapter: async () => candidates } });
  assert.equal(result.status, 'waiting_for_clarification');
  const choice = pendingMessagingResolution(value, 'the second one', { sessionId: 'chat-1' });
  assert.equal(choice.candidate.platformIdentity, 'two');
  assert.equal(resolvedIntentArguments(choice.intent, choice.candidate).message, 'kese ho?');
});

test('instagram username/display matching prioritizes exact username and reports ambiguity', () => {
  const candidates = [{ username: 'navya_one', displayName: 'Navya' }, { username: 'navya_two', displayName: 'Navya' }];
  assert.equal(rankRecipientCandidates('@navya_two', candidates)[0].username, 'navya_two');
  assert.equal(rankRecipientCandidates('Navya', candidates).length, 2);
});

test('instagram_username_resolution and display-name ambiguity preserve the pending message', async () => {
  const exact = await resolveMessagingRecipient(state(), { contact: '@navya_two', platform: 'instagram', message: 'hello' }, { instagramDependencies: { searchAdapter: async () => [{ platformIdentity: 'one', username: 'navya_one', displayName: 'Navya' }, { platformIdentity: 'two', username: 'navya_two', displayName: 'Navya' }] } });
  assert.equal(exact.endpoint, 'two');
  const value = state('skip_permissions');
  const ambiguous = await executeToolCall({ toolName: 'communication.send', arguments: { contact: 'Navya', platform: 'instagram', message: 'kal aa rahi hai?' } }, { state: value, conversationId: 'chat-ig', instagramDependencies: { searchAdapter: async () => [{ platformIdentity: 'one', username: 'navya_one', displayName: 'Navya' }, { platformIdentity: 'two', username: 'navya_two', displayName: 'Navya' }] } });
  assert.equal(ambiguous.status, 'waiting_for_clarification');
  const choice = pendingMessagingResolution(value, '2', { sessionId: 'chat-ig' });
  assert.equal(resolvedIntentArguments(choice.intent, choice.candidate).message, 'kal aa rahi hai?');
});

test('instagram recipient resolution falls back from conversation history to managed web search', async () => {
  const resolved = await resolveMessagingRecipient(state(), { contact: 'Navya', platform: 'instagram', message: 'hello' }, {
    instagramDependencies: { searchAdapter: async () => [{ platformIdentity: 'old', username: 'someone_else', displayName: 'Someone Else' }] },
    browserOptions: { instagramWebSearchAdapter: async () => [{ platformIdentity: 'instagram-web:navya', username: 'navya', displayName: 'Navya', resolutionSource: 'instagram_web_search' }] },
  });
  assert.equal(resolved.endpoint, 'instagram-web:navya'); assert.equal(resolved.resolutionSource, 'instagram_web_search');
});

test('instagram web send uses the frozen exact text through the canonical executor', async () => {
  const value = state('skip_permissions'); let sent;
  const result = await executeToolCall({ toolName: 'communication.send', arguments: { contact: '@navya', platform: 'instagram', message: 'exact text' } }, { state: value, instagramDependencies: { searchAdapter: async () => [] }, browserOptions: { instagramWebSearchAdapter: async () => [{ platformIdentity: 'instagram-web:navya', username: 'navya', displayName: 'Navya', resolutionSource: 'instagram_web_search' }], instagramWebAdapter: async (input) => { sent = input; return { success: true, verified: true, messageId: 'ig-1' }; } } });
  assert.equal(result.status, 'completed'); assert.equal(result.verified, true); assert.equal(sent.message, 'exact text');
});

test('instagram self messages are excluded and first sync does not mark history new', () => {
  const messages = normalizeInstagramMessages({ data: [{ id: 'm2', conversation_id: 'c1', from: { id: 'self', username: 'me' }, message: 'mine', created_time: '2026-01-02T00:00:00Z' }, { id: 'm1', conversation_id: 'c1', from: { id: 'other', username: 'navya' }, message: 'hello', created_time: '2026-01-01T00:00:00Z' }] }, 10, { id: 'self', username: 'me' });
  const value = state(); const first = applyInstagramSyncState(value, { messages, directionReliable: true });
  assert.deepEqual(first.incomingMessages.map((item) => item.id), ['m1']); assert.equal(first.newSinceLastCheck, null);
  const secondMessages = normalizeInstagramMessages({ data: [{ id: 'm3', conversation_id: 'c1', from: { id: 'other', username: 'navya' }, message: 'new', created_time: '2026-01-03T00:00:00Z' }, ...messages] }, 10, { id: 'self' });
  const second = applyInstagramSyncState(value, { messages: secondMessages, directionReliable: true });
  assert.deepEqual(second.presentationMessages.map((item) => item.id), ['m3']);
});

test('instagram content is humanized and grouped instead of dumped', () => {
  const result = { status: 'completed', toolName: 'instagram.messages.latest', output: { syncStatus: 'baseline', directionReliable: true, presentationMessages: [{ sender: 'Arjun', contentType: 'reel', text: '' }, { sender: 'Navya', contentType: 'text', text: 'ya' }, { sender: 'Navya', contentType: 'text', text: 'kal aaungi' }] } };
  const reply = formatToolReply(result);
  assert.match(reply, /Arjun shared a reel/); assert.match(reply, /Navya sent 2 messages/); assert.doesNotMatch(reply, /1\.|recent Instagram messages/);
});

test('youtube explicit service is preserved and result scoring avoids Shorts/reactions', () => {
  const route = routeRequest('play Seven Nation Army on YouTube');
  assert.equal(route.capability, 'youtube.play'); assert.equal(route.args.service, 'youtube');
  const official = scoreYouTubeResult({ title: 'The White Stripes - Seven Nation Army (Official Music Video)', href: '/watch?v=1', channel: 'The White Stripes' }, 'Seven Nation Army');
  const reaction = scoreYouTubeResult({ title: 'Seven Nation Army reaction', href: '/watch?v=2', channel: 'Reaction' }, 'Seven Nation Army');
  const unrelatedLive = scoreYouTubeResult({ title: "Seven Nation Army / Rockin'1000 That's Live Official", href: '/watch?v=3', channel: 'Rockin 1000' }, 'Seven Nation Army');
  assert.ok(official > reaction); assert.ok(official > unrelatedLive);
});

test('youtube verifier rejects navigation-only false positives', async () => {
  const result = await executeToolCall({ toolName: 'youtube.play', arguments: { query: 'Seven Nation Army', service: 'youtube' } }, { state: state('skip_permissions'), browserOptions: { adapter: async () => ({ service: 'youtube', title: 'Seven Nation Army', url: 'https://www.youtube.com/watch?v=x', playback: { paused: false, currentTime: 0, readyState: 1 }, verified: true }) } });
  assert.equal(result.status, 'failed_verification');
});
