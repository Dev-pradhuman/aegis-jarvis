import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatSession, ensureChatSessions, sessionMessages, touchSession } from '../server/chatSessions.js';

test('new chats isolate temporary history while sharing persistent state', () => {
  const state = { conversations: [], chatSessions: [], memories: [{ id: 'shared' }] }; const first = createChatSession(state); state.conversations.push({ who: 'YOU', lines: ['first'], conversationId: first.id }); const second = createChatSession(state); state.conversations.push({ who: 'YOU', lines: ['second'], conversationId: second.id });
  assert.deepEqual(sessionMessages(state, first.id).map((item) => item.lines[0]), ['first']); assert.deepEqual(sessionMessages(state, second.id).map((item) => item.lines[0]), ['second']); assert.equal(state.memories.length, 1); assert.notEqual(first.id, second.id);
});

test('new session titles derive from the first request and old history migrates once', () => {
  const state = { conversations: [{ who: 'YOU', lines: ['legacy'] }], chatSessions: [] }; ensureChatSessions(state); const legacyId = state.activeSessionId; const session = createChatSession(state); touchSession(state, session.id, 'Inspect the current repository and summarize it'); assert.equal(session.title, 'Inspect the current repository and summarize it'); assert.equal(state.conversations[0].conversationId, legacyId);
});
