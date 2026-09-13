import { composioToolRisk, executeComposioTool, listComposioAccounts, listComposioTools } from './composioAdapter.js';

function schemaProperties(schema = {}) { return schema.properties || schema.input_schema?.properties || {}; }
function requiredFields(schema = {}) { return Array.isArray(schema.required) ? schema.required : []; }

export function selectInstagramInboxTool(tools = []) {
  return tools
    .filter((tool) => String(tool.toolkit || '').toLowerCase() === 'instagram')
    .filter((tool) => composioToolRisk(tool.slug) === 'READ_ONLY')
    .map((tool) => {
      const haystack = `${tool.slug} ${tool.name || ''} ${tool.description || ''}`.toLowerCase();
      const required = requiredFields(tool.inputSchema || {});
      let score = 0;
      if (/message|conversation|inbox|thread|direct|\bdm\b/.test(haystack)) score += 8;
      if (/list|fetch|get|read|search/.test(haystack)) score += 3;
      if (/list_all_conversations/.test(haystack)) score += 6;
      score -= required.length * 8;
      if (/insight|media|comment|post|profile/.test(haystack)) score -= 5;
      return { tool, score };
    })
    .filter((entry) => entry.score >= 8)
    .sort((left, right) => right.score - left.score)[0]?.tool || null;
}

function selectConversationMessageTool(tools = []) {
  return tools.filter((tool)=>String(tool.toolkit||'').toLowerCase()==='instagram'&&composioToolRisk(tool.slug)==='READ_ONLY')
    .filter((tool)=>requiredFields(tool.inputSchema||{}).some((key)=>/^conversation_id$/i.test(key)))
    .map((tool)=>({tool,score:/list.*messages|messages.*conversation/i.test(`${tool.slug} ${tool.description||''}`)?10:/message/i.test(`${tool.slug} ${tool.description||''}`)?4:0}))
    .sort((left,right)=>right.score-left.score)[0]?.tool||null;
}

function selectSelfIdentityTool(tools = []) {
  return tools.find((tool) => String(tool.slug || '').toUpperCase() === 'INSTAGRAM_GET_USER_INFO') || null;
}

function nestedList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data!=='object') return [];
  for (const key of ['data','messages','items','conversations']) { const found=nestedList(data[key]);if(found.length)return found; }
  return [];
}

export function inboxArguments(tool = {}, limit = 10) {
  const schema = tool.inputSchema || {};
  const properties = schemaProperties(schema);
  const args = {};
  for (const key of Object.keys(properties)) {
    if (/^(limit|count|first|max_results|page_size)$/i.test(key)) args[key] = Math.min(20, Math.max(1, Number(limit || 10)));
    else if (/^ig_user_id$/i.test(key)) args[key] = 'me';
  }
  const unsupported = requiredFields(schema).filter((key) => args[key] === undefined && properties[key]?.default === undefined);
  if (unsupported.length) throw Object.assign(new Error(`The connected Instagram inbox tool requires additional fields: ${unsupported.join(', ')}`), { code: 'CAPABILITY_UNAVAILABLE' });
  return args;
}

function arraysIn(value, depth = 0) {
  if (depth > 4 || value == null) return [];
  if (Array.isArray(value)) return [value, ...value.flatMap((item) => arraysIn(item, depth + 1))];
  if (typeof value !== 'object') return [];
  return Object.values(value).flatMap((item) => arraysIn(item, depth + 1));
}

function firstString(...values) {
  for (const value of values.flat(Infinity)) {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
}

function participant(item = {}) {
  const candidates = [item.sender, item.from, item.user, item.owner, item.participant, ...(Array.isArray(item.participants) ? item.participants : [])];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const nested = candidate.user && typeof candidate.user === 'object' ? candidate.user : candidate;
    const username = firstString(nested.username, nested.user_name, nested.handle, nested.id);
    const name = firstString(nested.name, nested.full_name, nested.display_name, username);
    if (name || username) return { id: firstString(nested.id, nested.user_id), name, username };
  }
  return { id: '', name: firstString(item.sender_name, item.username), username: firstString(item.username) };
}

function messageBody(item = {}) {
  const message = [item.last_message, item.latest_message, item.message, item.item].find((value) => value && typeof value === 'object') || {};
  const text = firstString(item.text, item.body, item.snippet, item.preview, typeof item.message==='string'?item.message:'', message.text, message.body, message.message, message.snippet);
  const attachment=item.attachments||message.attachments;
  const shared=item.share||message.share||item.reel||message.reel||item.story||message.story;
  const inferred=item.reaction||message.reaction?'reaction':item.story_reply||message.story_reply?'story_reply':item.voice||message.voice?'voice':item.image||message.image?'image':item.video||message.video?'video':item.audio||message.audio?'voice':shared?(String(shared?.type||'').toLowerCase().includes('reel')?'reel':'post'):item.link||message.link?'link':item.sticker||message.sticker?'sticker':attachment?'attachment':'';
  const contentType = firstString(item.content_type, item.item_type, message.content_type, message.item_type, message.type, item.type, inferred) || (text ? 'text' : 'unknown');
  return { message, text, contentType };
}

export function normalizeInstagramMessages(data, limit = 10, selfIdentity = {}) {
  const candidates = arraysIn(data).filter((items) => items.some((item) => item && typeof item === 'object'));
  const scored = candidates.map((items) => ({ items, score: items.reduce((score, item) => score + (/message|thread|conversation/i.test(Object.keys(item || {}).join(' ')) ? 4 : 0) + (messageBody(item).text ? 6 : 0) + (participant(item).name ? 3 : 0), 0) }));
  const items = scored.sort((left, right) => right.score - left.score || right.items.length - left.items.length)[0]?.items || [];
  return items.slice(0, limit).map((item, index) => {
    const sender = participant(item); const body = messageBody(item);
    const senderId = sender.id || null; const username = sender.username || null;
    const isSelf = item.sender_is_self === true || item.is_from_me === true || (selfIdentity.id && senderId === String(selfIdentity.id)) || (selfIdentity.username && username && username.toLowerCase() === String(selfIdentity.username).toLowerCase());
    return {
      id: firstString(body.message.id, body.message.message_id, body.message.item_id, item.message_id, item.id, item.thread_id, index + 1),
      threadId: firstString(item.thread_id, item.threadId, item.conversation_id, item.conversationId, item.id),
      senderId,
      sender: sender.name || sender.username || 'Unknown',
      username,
      text: body.text.slice(0, 500),
      contentType: body.contentType,
      unread: item.unread!==undefined?Boolean(item.unread):item.is_unread!==undefined?Boolean(item.is_unread):item.has_unread!==undefined?Boolean(item.has_unread):item.unread_count!==undefined?Number(item.unread_count||0)>0:null,
      at: body.message.created_at || body.message.created_time || body.message.timestamp || item.created_at || item.created_time || item.timestamp || item.updated_at || item.updated_time || null,
      ...(selfIdentity.id || selfIdentity.username || item.sender_is_self !== undefined || item.is_from_me !== undefined ? { isSelf: Boolean(isSelf), direction: isSelf ? 'outgoing' : 'incoming' } : {}),
    };
  });
}

export async function readInstagramMessages(input = {}, dependencies = {}) {
  const listAccounts = dependencies.listAccounts || listComposioAccounts;
  const listTools = dependencies.listTools || listComposioTools;
  const execute = dependencies.execute || executeComposioTool;
  const accounts = await listAccounts({ toolkit: 'instagram', userId: input.userId }, dependencies.fetchImpl);
  const account = accounts.find((item) => String(item.status || '').toUpperCase() === 'ACTIVE');
  if (!account) throw Object.assign(new Error('Instagram is not connected. Connect it in Settings, then try again.'), { code: 'CONFIG_REQUIRED' });
  let tools = await listTools({ toolkit: 'instagram', query: 'list unread direct messages inbox conversations', limit: 100 }, dependencies.fetchImpl);
  let tool = selectInstagramInboxTool(tools);
  // Composio's semantic tool search can omit valid Instagram inbox tools for
  // narrow natural-language queries. Fall back to the complete toolkit catalog
  // and perform our own read-only selection before declaring the capability absent.
  if (!tool) {
    tools = await listTools({ toolkit: 'instagram', limit: 100 }, dependencies.fetchImpl);
    tool = selectInstagramInboxTool(tools);
  }
  if (!tool) throw Object.assign(new Error('The connected Instagram account does not expose a read-messages capability through Composio.'), { code: 'CAPABILITY_UNAVAILABLE' });
  if (!selectConversationMessageTool(tools)) {
    const catalog=await listTools({toolkit:'instagram',limit:100},dependencies.fetchImpl);
    if(catalog.length)tools=catalog;
  }
  let selfIdentity = {};
  const selfTool = selectSelfIdentityTool(tools);
  if (selfTool) {
    const selfResult = await execute({ toolSlug: selfTool.slug, version: selfTool.version, arguments: { ig_user_id: 'me' }, connectedAccountId: account.id, userId: input.userId }, dependencies.fetchImpl).catch(() => null);
    if (selfResult?.successful) selfIdentity = { id: firstString(selfResult.data?.id, selfResult.data?.data?.id), username: firstString(selfResult.data?.username, selfResult.data?.data?.username) };
  }
  const limit = Math.min(20, Math.max(1, Number(input.limit || 10)));
  const result = await execute({ toolSlug: tool.slug, version: tool.version, arguments: inboxArguments(tool, limit), connectedAccountId: account.id, userId: input.userId }, dependencies.fetchImpl);
  if (!result.successful) throw Object.assign(new Error(result.error || 'Instagram message retrieval failed'), { code: 'PROVIDER_ERROR' });
  let source=result.data;
  const conversations=nestedList(result.data).filter((item)=>item&&typeof item==='object'&&firstString(item.id,item.thread_id,item.conversation_id));
  const messagesTool=selectConversationMessageTool(tools);
  if (messagesTool && conversations.length && !normalizeInstagramMessages(result.data,limit).some((item)=>item.text)) {
    const batches=await Promise.all(conversations.slice(0,Math.min(limit,10)).map(async(conversation)=>{
      const conversationId=firstString(conversation.id,conversation.thread_id,conversation.conversation_id);
      const response=await execute({toolSlug:messagesTool.slug,version:messagesTool.version,arguments:{conversation_id:conversationId,...inboxArguments({...messagesTool,inputSchema:{...(messagesTool.inputSchema||{}),required:[],properties:{...schemaProperties(messagesTool.inputSchema||{}),conversation_id:undefined}}},limit)},connectedAccountId:account.id,userId:input.userId},dependencies.fetchImpl);
      if(!response.successful)return[];
      return nestedList(response.data).map((message)=>({...message,thread_id:conversationId,participants:message.participants||conversation.participants}));
    }));
    source={messages:batches.flat().sort((left,right)=>Date.parse(right.created_time||right.timestamp||0)-Date.parse(left.created_time||left.timestamp||0))};
  }
  const normalized = normalizeInstagramMessages(source, limit, selfIdentity);
  const unreadAvailable=normalized.some((item)=>item.unread!==null);
  const messages = input.unreadOnly&&unreadAvailable ? normalized.filter((item) => item.unread).slice(0, limit) : normalized;
  return { accountId: account.id, toolSlug: tool.slug, messages, unreadOnly: Boolean(input.unreadOnly), unreadStatus: unreadAvailable?'available':'provider_unavailable', selfIdentity: { id: selfIdentity.id || null, username: selfIdentity.username || null }, directionReliable: Boolean(selfIdentity.id || selfIdentity.username), data: result.data };
}

export async function searchInstagramRecipients(query, dependencies = {}) {
  if (dependencies.searchAdapter) return dependencies.searchAdapter(query);
  const inbox = await readInstagramMessages({ limit: 20 }, dependencies);
  const unique = new Map();
  for (const message of inbox.messages) {
    if (message.isSelf || !message.senderId) continue;
    const key = String(message.senderId);
    if (!unique.has(key)) unique.set(key, { platform: 'instagram', platformIdentity: key, displayName: message.sender || message.username || key, username: message.username || null, resolutionSource: 'instagram_conversation_search', disambiguationMetadata: message.username ? `@${message.username}` : null });
  }
  return [...unique.values()];
}

function newestByConversation(messages = []) {
  const cursors = {};
  for (const message of messages) {
    const key = message.threadId || 'unknown'; const existing = cursors[key];
    const timestamp = Date.parse(message.at || 0) || 0;
    if (!existing || timestamp >= existing.timestamp) cursors[key] = { conversationId: key, lastObservedMessageId: message.id || null, lastObservedTimestamp: message.at || null, timestamp };
  }
  return cursors;
}

export function applyInstagramSyncState(state, response) {
  const previous = state.instagramSyncState?.conversations || {}; const current = newestByConversation(response.messages);
  const incoming = response.messages.filter((message) => response.directionReliable ? !message.isSelf : true);
  const firstSync = !state.instagramSyncState?.updatedAt;
  const newIncoming = firstSync ? [] : incoming.filter((message) => {
    const cursor = previous[message.threadId || 'unknown'];
    if (!cursor) return true;
    if (message.id && message.id === cursor.lastObservedMessageId) return false;
    const at = Date.parse(message.at || 0) || 0; const previousAt = Date.parse(cursor.lastObservedTimestamp || 0) || 0;
    return at > previousAt;
  });
  state.instagramSyncState = { conversations: { ...previous, ...current }, updatedAt: new Date().toISOString() };
  return { ...response, incomingMessages: incoming, presentationMessages: firstSync ? incoming : newIncoming, syncStatus: firstSync ? 'baseline' : 'incremental', newSinceLastCheck: firstSync ? null : newIncoming.length };
}
