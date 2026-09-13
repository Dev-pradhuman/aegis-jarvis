import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxArguments, normalizeInstagramMessages, readInstagramMessages, selectInstagramInboxTool } from '../server/connectedMessages.js';

const tools = [
  { slug: 'INSTAGRAM_GET_MEDIA_INSIGHTS', toolkit: 'instagram', description: 'Get media insight data', inputSchema: {} },
  { slug: 'INSTAGRAM_LIST_DIRECT_MESSAGES', toolkit: 'instagram', description: 'List inbox conversations and messages', inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } }, version: 'latest' },
];

test('Instagram inbox discovery selects a read-only messaging tool', () => {
  const selected = selectInstagramInboxTool(tools);
  assert.equal(selected.slug, 'INSTAGRAM_LIST_DIRECT_MESSAGES');
  assert.deepEqual(inboxArguments(selected, 7), { limit: 7 });
});

test('Instagram inbox arguments do not misuse the optional contact user_id filter', () => {
  const tool = { inputSchema: { properties: { limit: { type: 'integer' }, user_id: { type: 'string' }, ig_user_id: { type: 'string' } } } };
  assert.deepEqual(inboxArguments(tool, 5), { limit: 5, ig_user_id: 'me' });
});

test('Instagram reads use the active account and return grounded messages', async () => {
  let executed;
  const result = await readInstagramMessages({ limit: 4 }, {
    listAccounts: async () => [{ id: 'account-1', status: 'ACTIVE', toolkit: 'instagram' }],
    listTools: async () => tools,
    execute: async (input) => { executed = input; return { successful: true, data: { messages: [{ id: 'm1', username: 'alex', text: 'Hello', is_unread: true }] } }; },
  });
  assert.equal(executed.connectedAccountId, 'account-1');
  assert.equal(result.messages[0].sender, 'alex');
  assert.equal(result.messages[0].unread, true);
});

test('Instagram inbox discovery falls back to the full toolkit catalog', async () => {
  const calls = [];
  const result = await readInstagramMessages({ limit: 1 }, {
    listAccounts: async () => [{ id: 'account-1', status: 'ACTIVE' }],
    listTools: async (input) => {
      calls.push(input);
      return input.query ? [] : [
        { slug: 'INSTAGRAM_LIST_ALL_MESSAGES', toolkit: 'instagram', inputSchema: { properties: { conversation_id: { type: 'string' } }, required: ['conversation_id'] } },
        { slug: 'INSTAGRAM_LIST_ALL_CONVERSATIONS', toolkit: 'instagram', inputSchema: { properties: {} } },
      ];
    },
    execute: async () => ({ successful: true, data: { conversations: [{ id: 'conversation-1', username: 'person', message: 'hello' }] } }),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].query, undefined);
  assert.equal(result.toolSlug, 'INSTAGRAM_LIST_ALL_CONVERSATIONS');
  assert.equal(result.messages.length, 1);
});

test('Instagram read fails clearly when no account is connected', async () => {
  await assert.rejects(() => readInstagramMessages({}, { listAccounts: async () => [] }), /Instagram is not connected/);
});

test('Instagram response normalization does not invent previews', () => {
  assert.deepEqual(normalizeInstagramMessages({ items: [{ id: '1', sender_name: 'Sam' }] }, 1)[0], { id: '1', threadId: '1', senderId: null, sender: 'Sam', username: null, text: '', contentType: 'unknown', unread: null, at: null });
});

test('Instagram sender normalization understands nested thread and last-message shapes', () => {
  const [message] = normalizeInstagramMessages({ data: { threads: [{ thread_id: 'thread-1', participants: [{ user: { id: 'u1', username: 'arjun.dev', full_name: 'Arjun' } }], last_message: { item_id: 'm1', text: 'hey bro', timestamp: '2026-09-08T09:00:00Z' }, unread_count: 1 }] } }, 10);
  assert.deepEqual(message, { id: 'm1', threadId: 'thread-1', senderId: 'u1', sender: 'Arjun', username: 'arjun.dev', text: 'hey bro', contentType: 'text', unread: true, at: '2026-09-08T09:00:00Z' });
});

test('Instagram unread filtering returns only actually unread normalized messages', async () => {
  const result = await readInstagramMessages({ limit: 10, unreadOnly: true }, { listAccounts: async()=>[{id:'a1',status:'ACTIVE'}], listTools: async()=>tools, execute: async()=>({successful:true,data:{messages:[{id:'1',username:'read',text:'old',unread:false},{id:'2',username:'new',text:'new',is_unread:true}]}}) });
  assert.deepEqual(result.messages.map(item=>item.id), ['2']);
});

test('Instagram conversation-only responses are hydrated with per-thread messages',async()=>{
  const catalog=[{slug:'INSTAGRAM_LIST_ALL_CONVERSATIONS',toolkit:'instagram',inputSchema:{properties:{limit:{type:'integer'}}}},{slug:'INSTAGRAM_LIST_ALL_MESSAGES',toolkit:'instagram',inputSchema:{properties:{conversation_id:{type:'string'},limit:{type:'integer'}},required:['conversation_id']}}];
  const calls=[];const result=await readInstagramMessages({limit:2},{listAccounts:async()=>[{id:'a1',status:'ACTIVE'}],listTools:async()=>catalog,execute:async(input)=>{calls.push(input);return input.toolSlug.includes('CONVERSATIONS')?{successful:true,data:{data:[{id:'thread-1'}]}}:{successful:true,data:{data:[{id:'message-1',from:{id:'u1',username:'alex'},message:'hello',created_time:'2026-09-08T10:00:00Z'}]}};}});
  assert.equal(calls.length,2);assert.equal(calls[1].arguments.conversation_id,'thread-1');assert.equal(result.messages[0].sender,'alex');assert.equal(result.messages[0].text,'hello');
});
