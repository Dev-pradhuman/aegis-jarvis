import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getToolDefinition, listTools } from './registry.js';
import { validateToolArguments } from './schemaValidation.js';
import { ToolRuntimeError, normalizeToolError, publicToolError } from './toolErrors.js';
import { createExactApproval, validateExactApproval, consumeExactApproval } from './policy.js';
import { findToolReplay, rememberToolResult } from './idempotency.js';
import { addRunStep, completeRun, createRun, failRun, transitionRun } from './runEngine.js';
import { activityEntry } from './store.js';
import { composioToolRisk, executeComposioTool } from './composioAdapter.js';
import { applyInstagramSyncState, readInstagramMessages } from './connectedMessages.js';
import { diagnostics, researchSearch, searchMemory } from './systemModules.js';
import { embed } from './extendedAdapters.js';
import { calendarRequest, hardwareCommand, sendMessage } from './liveAdapters.js';
import { generateMedia } from './mediaGeneration.js';
import { executeVoiceOsAction } from './voiceOs.js';
import { launchApplication, openExternalUrl } from './platformDesktop.js';
import { applicationIndex, searchApplications } from './applicationIndex.js';
import { listWindows, windowAction } from './windowControl.js';
import { desktopInput } from './desktopInput.js';
import { captureScreen } from './screenCapture.js';
import {audioControl} from './audioControl.js';
import {mediaControl} from './mediaControl.js';
import { browserAction, closeBrowserSession } from './browserAutomation.js';
import { uiAutomation } from './uiAutomation.js';
import { updateEphemeralContext } from './contextResolver.js';
import { fileTool } from './fileTools.js';
import { compareDocuments, parseDocument, searchDocument, summarizeDocument } from './documentIntelligence.js';
import { executeConnectedOperation } from './connectedCapabilities.js';
import { slackOperation } from './slackAdapter.js';
import { developerAction } from './developerTools.js';
import { searchVaultNotes, writeVaultMemory } from './memoryGraph.js';
import { researchReport } from './researchPipeline.js';
import { ingestNotification, notificationAction } from './notificationCenter.js';
import { phoneTool } from './phoneBridge.js';
import { perceiveScreen } from './screenPerception.js';
import { availableContactPlatforms, deleteContact, listContacts, resolveContact, upsertContact } from './contactBook.js';
import { listProcessesByMemory } from './processControl.js';
import { readSystemResources } from './systemResources.js';
import { permissionDecision } from './permissionPolicy.js';
import { sendWhatsAppWeb } from './whatsappWeb.js';
import { youtubeAction } from './youtubeAutomation.js';
import { autoMcpStatus, executeAutoMcpTool, refreshAutoMcpTools } from './autoMcpAdapter.js';
import { sendInstagramWeb } from './instagramWeb.js';
import { createPendingMessagingIntent, resolveMessagingRecipient, searchMessagingRecipients } from './recipientResolver.js';

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRealRootPromise = realpath(workspaceRoot);
const blockedRoots = new Set(['node_modules', 'dist', '.git', 'server/data']);
const secretKey = /(?:api.?key|token|password|secret|authorization|cookie|otp)/i;

function toolId() { return `toolcall-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; }
function nowIso() { return new Date().toISOString(); }
function safePath(input = '.') {
  const candidate = path.resolve(workspaceRoot, input);
  if (candidate !== workspaceRoot && !candidate.startsWith(`${workspaceRoot}${path.sep}`)) throw new ToolRuntimeError('PERMISSION_DENIED', 'Path is outside the JARVIS workspace');
  return candidate;
}
async function safeExistingPath(input) {
  const candidate = safePath(input);
  const [actual, root] = await Promise.all([realpath(candidate), workspaceRealRootPromise]);
  if (actual !== root && !actual.startsWith(`${root}${path.sep}`)) throw new ToolRuntimeError('PERMISSION_DENIED', 'Resolved path escapes the JARVIS workspace');
  return actual;
}
async function inspectDirectory(relative = '.', depth = 0) {
  if (depth > 2) return [];
  const current = await safeExistingPath(relative);
  const entries = await readdir(current, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || blockedRoots.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push({ path: child.replaceAll('\\', '/'), type: 'directory', children: await inspectDirectory(child, depth + 1) });
    else result.push({ path: child.replaceAll('\\', '/'), type: entry.isSymbolicLink() ? 'symlink' : 'file' });
  }
  return result;
}

function sanitize(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, secretKey.test(key) ? '[REDACTED]' : sanitize(item, depth + 1)]));
}

function recordActivity(state, type, message, meta = {}) {
  if (!state) return;
  state.activity = [activityEntry(type, message, meta), ...(state.activity || [])].slice(0, 200);
}

function dynamicApproval(definition, args, context = {}, state = {}) {
  const base = definition.requiresApproval === true || (definition.id === 'composio.execute' && composioToolRisk(args.toolSlug) !== 'READ_ONLY');
  return permissionDecision(definition, args, { requiresApproval: base, risk: effectiveRisk(definition, args), permissionMode: context.permissionMode || state.permissionMode || state.modelRouting?.permissionMode }).requiresApproval;
}

function effectiveRisk(definition, args) {
  return definition.id === 'composio.execute' ? composioToolRisk(args.toolSlug) : definition.riskLevel;
}

function enforcePermission(definition, args, permissionContext = {}) {
  const denied = new Set(permissionContext.deniedTools || []);
  const allowed = permissionContext.allowedTools ? new Set(permissionContext.allowedTools) : null;
  const risk = effectiveRisk(definition, args);
  if (denied.has(definition.id) || (allowed && !allowed.has(definition.id))) throw new ToolRuntimeError('PERMISSION_DENIED', `Permission denied for ${definition.id}`);
  if (Array.isArray(permissionContext.allowedRiskLevels) && !permissionContext.allowedRiskLevels.includes(risk)) throw new ToolRuntimeError('PERMISSION_DENIED', `Risk level ${risk} is not permitted for this caller`, { details: { riskLevel: risk } });
  return risk;
}

function ensureRun(state, call, definition, context) {
  let run = (state?.runs || []).find((item) => item.id === call.runId);
  if (!run) {
    run = createRun({ type: call.source === 'workflow' ? 'workflow' : 'tool', request: context.request || `${definition.id} execution`, workflowId: context.workflowId || null, conversationId: context.conversationId || null });
    run.plan = { goal: run.request, intent: 'tool', steps: [{ id: `${run.id}-plan-1`, index: 0, description: definition.name, capability: definition.id, requiresApproval: dynamicApproval(definition, call.arguments, context, state) }] };
    if (state) { state.runs ??= []; state.runs.unshift(run); state.runs = state.runs.slice(0, 500); }
    call.runId = run.id;
  }
  if (['completed', 'failed', 'cancelled'].includes(run.status)) {
    throw new ToolRuntimeError('INVALID_ARGUMENTS', `Cannot attach a new tool call to terminal Run ${run.id}`, { details: { runId: run.id, status: run.status } });
  }
  if (!['running', 'waiting_for_approval'].includes(run.status)) transitionRun(run, 'running');
  let step = call.stepId ? run.steps.find((item) => item.id === call.stepId) : run.steps.find((item) => item.toolCallId === call.id);
  if (!step) {
    step = addRunStep(run, definition.name, definition.id, dynamicApproval(definition, call.arguments, context, state));
    if (call.stepId) step.id = call.stepId;
  }
  call.stepId = step.id;
  step.toolCallId = call.id;
  step.status = 'running';
  step.startedAt ||= nowIso();
  run.currentStep = step.index;
  let execution = run.toolCalls.find((item) => item.id === call.id);
  if (!execution) {
    execution = { id: call.id, toolName: definition.id, arguments: definition.sensitiveInput ? { redacted: true } : sanitize(call.arguments), source: call.source, requestedBy: call.requestedBy, runId: run.id, stepId: step.id, status: 'running', provider: definition.provider, startedAt: nowIso(), completedAt: null, retryCount: 0, output: null, error: null, verified: false, verificationEvidence: null, latencyMs: 0 };
    run.toolCalls.push(execution);
  } else execution.status = 'running';
  return { run, step, execution };
}

async function resolveToolArguments(definition, args, state, context = {}) {
  if (definition.id !== 'communication.send') return args;
  if (['whatsapp', 'instagram'].includes(args.platform)) {
    const recipient = await resolveMessagingRecipient(state, args, { browserOptions: context.browserOptions, instagramDependencies: context.instagramDependencies || { fetchImpl: context.fetchImpl } });
    return { ...args, contact: recipient.displayName, contactId: recipient.canonicalContactId || undefined, endpoint: recipient.platformIdentity, resolvedDisplayName: recipient.displayName, resolutionSource: recipient.resolutionSource, resolutionConfidence: recipient.confidence };
  }
  const contact = resolveContact(state, args.contactId || args.contact);
  const endpoint = String(args.endpoint || contact.endpoints?.[args.platform] || '').trim();
  if (!endpoint) throw new ToolRuntimeError('CONTACT_DESTINATION_MISSING', `${contact.name} has no saved ${args.platform} address. Add it in Settings -> Contact library.`);
  return { ...args, contact: contact.name, contactId: contact.id, endpoint };
}

function updateTelemetry(state, result, metrics) {
  if (!state) return;
  state.runtime ??= {};
  state.runtime.latency ??= {};
  Object.assign(state.runtime.latency, { toolMs: metrics.toolMs, policyMs: metrics.policyMs, verificationMs: metrics.verificationMs, totalMs: metrics.totalMs, samples: Number(state.runtime.latency.samples || 0) + 1 });
  state.runtime.toolTelemetry ??= [];
  state.runtime.toolTelemetry = [{ toolCallId: result.toolCallId, runId: result.runId, tool: result.toolName, provider: result.provider, latencyMs: result.latencyMs, policyMs: metrics.policyMs, verificationMs: metrics.verificationMs, success: result.status === 'completed', status: result.status, verified: result.verified, retryCount: result.retryCount, errorCode: result.error?.code || null, at: nowIso() }, ...state.runtime.toolTelemetry].slice(0, 500);
}

async function withTimeout(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new ToolRuntimeError('TIMEOUT', `Tool execution exceeded ${timeoutMs} ms`, { retryable: true })), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function providerCall(operation) {
  try { return await operation(); }
  catch (error) { throw normalizeToolError(error, 'PROVIDER_ERROR'); }
}

async function executeHandler(definition, args, context, state) {
  const fetchImpl = context.fetchImpl || fetch;
  switch (definition.handler) {
    case 'auto_mcp.status': return { output: autoMcpStatus(), provider: 'auto_mcp' };
    case 'auto_mcp.refresh': return { output: await refreshAutoMcpTools(), provider: 'auto_mcp' };
    case 'tools.discover': {
      const category = String(args.category || '').toLowerCase();
      const query = String(args.query || '').toLowerCase();
      const aliases = { email: 'communication', gmail: 'communication', messaging: 'communication', contacts: 'communication', browser: 'computer', desktop: 'computer', media: 'computer', terminal: 'development', developer: 'development', git: 'development', system: 'system' };
      const wanted = aliases[category] || category;
      const matches = listTools({ includeDisabled: false }).filter((tool) => tool.id !== 'tools.discover' && (tool.module === wanted || tool.id.startsWith(`${category}.`) || (query && `${tool.id} ${tool.name} ${tool.description}`.toLowerCase().includes(query)))).slice(0, args.limit || 20);
      return { output: { category, tools: matches.map(({ id, name, description, module, riskLevel, requiresApproval, inputSchema }) => ({ id, name, description, module, riskLevel, requiresApproval: Boolean(requiresApproval), inputSchema })) }, provider: 'local-registry' };
    }
    case 'project.inspect': return { output: { root: workspaceRoot, entries: await inspectDirectory() }, provider: 'local' };
    case 'notifications.ingest': return{output:ingestNotification(state,args),provider:'local'};
    case 'phone.status': case 'phone.devices': case 'phone.command': return {output:phoneTool(definition.id.slice(6),args,state),provider:'local-phone-bridge'};
    case 'notifications.list': case 'notifications.summary': case 'notifications.mark_read': case 'notifications.dismiss': return{output:notificationAction(state,definition.id.slice(14),args),provider:'local'};
    case 'git.status': case 'git.diff': case 'git.log': case 'git.branches': case 'git.branch.create': case 'git.branch.switch': case 'git.commit': case 'git.pull': case 'git.push': case 'dev.test': case 'github.issues.list': case 'github.prs.list': case 'github.search': return{output:await developerAction(definition.id,args,context.developerOptions),provider:definition.provider};
    case 'files.read': case 'files.list': case 'files.search': case 'files.create': case 'files.write': case 'files.mkdir': case 'files.move': case 'files.rename': case 'files.copy': case 'files.delete': return {output:await fileTool(definition.id.slice(6),args),provider:'local'};
    case 'tasks.list': return { output: { tasks: structuredClone(state?.tasks || []) }, provider: 'local' };
    case 'tasks.create': {
      const task = { id: `task-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, title: args.title.trim(), sub: args.sub || 'Created by JARVIS', icon: 'cyan', svg: 'notes', pct: 0, status: 'pending', priority: args.priority || 'normal', dueAt: args.dueAt || null, createdAt: nowIso() };
      state.tasks ??= []; state.tasks.unshift(task); recordActivity(state, 'task.created', task.title, { taskId: task.id });
      return { output: { task }, provider: 'local' };
    }
    case 'tasks.update': {
      const task = (state?.tasks || []).find((item) => item.id === args.id);
      if (!task) throw new ToolRuntimeError('INVALID_ARGUMENTS', `Task not found: ${args.id}`);
      for (const key of ['title', 'status', 'pct', 'dueAt', 'priority']) if (args[key] !== undefined) task[key] = args[key];
      task.updatedAt = nowIso(); recordActivity(state, 'task.updated', task.title, { taskId: task.id });
      return { output: { task: structuredClone(task) }, provider: 'local' };
    }
    case 'memory.search': {
      const local = searchMemory(state?.memories || [], args.query);
      const vault = searchVaultNotes(args.query);
      const memories = [...local, ...vault].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 12);
      state.runtime ??= {}; state.runtime.activeMemoryIds = vault.slice(0, 6).map((item) => item.id); state.runtime.activeMemoryAt = nowIso();
      return { output: { memories }, provider: vault.length ? 'local+obsidian' : 'local' };
    }
    case 'memory.store': {
      const kind=args.kind||'project';const memory = { id: `memory-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, text: args.text.trim(), kind,memoryType:kind,source:context.requestedBy||'jarvis',projectId:context.projectId||null,taskId:context.taskId||null,runId:context.runId||null,importance:'normal',confidence:1,embedding: embed(args.text), createdAt: nowIso(),updatedAt:null };
      try {
        memory.sourcePath = await writeVaultMemory(memory);
        memory.vaultSync = memory.sourcePath ? { status: 'synced' } : { status: 'not_configured' };
      } catch (error) {
        memory.sourcePath = null;
        memory.vaultSync = { status: 'failed', code: error.code || 'EXECUTION_FAILED', message: error.message || 'Obsidian vault write failed.' };
        recordActivity(state, 'memory.vault_sync_failed', memory.text.slice(0, 120), { memoryId: memory.id, code: memory.vaultSync.code });
      }
      state.memories ??= []; state.memories.unshift(memory); recordActivity(state, 'memory.created', memory.text.slice(0, 120), { memoryId: memory.id, sourcePath: memory.sourcePath });
      return { output: { memory }, provider: 'local' };
    }
    case 'memory.update': {
      const memory=(state.memories||[]).find(item=>item.id===args.id);if(!memory)throw new ToolRuntimeError('INVALID_ARGUMENTS',`Memory not found: ${args.id}`);
      if(args.text!==undefined){memory.text=args.text.trim();memory.embedding=embed(memory.text);}if(args.importance!==undefined)memory.importance=args.importance;if(args.confidence!==undefined)memory.confidence=args.confidence;memory.updatedAt=nowIso();recordActivity(state,'memory.updated',memory.text.slice(0,120),{memoryId:memory.id});return{output:{memory:structuredClone(memory)},provider:'local'};
    }
    case 'memory.delete': {
      const index=(state.memories||[]).findIndex(item=>item.id===args.id);if(index<0)throw new ToolRuntimeError('INVALID_ARGUMENTS',`Memory not found: ${args.id}`);state.memories.splice(index,1);recordActivity(state,'memory.deleted','Memory explicitly forgotten',{memoryId:args.id});return{output:{deletedId:args.id},provider:'local'};
    }
    case 'memory.index': {
      const memory = (state.memories || []).find((item) => item.id === args.id);
      if (!memory) throw new ToolRuntimeError('INVALID_ARGUMENTS', `Memory not found: ${args.id}`);
      memory.embedding = embed(memory.text); memory.updatedAt = nowIso();
      return { output: { memory: structuredClone(memory) }, provider: 'local' };
    }
    case 'contacts.list': return { output: { contacts: listContacts(state) }, provider: 'local-contact-book' };
    case 'contacts.resolve': {
      const contact = resolveContact(state, args.query);
      return { output: { contact: structuredClone(contact), availablePlatforms: availableContactPlatforms(contact) }, provider: 'local-contact-book' };
    }
    case 'contacts.upsert': {
      const contact = upsertContact(state, args);
      recordActivity(state, 'contact.saved', contact.name, { contactId: contact.id, platforms: availableContactPlatforms(contact) });
      return { output: { contact: structuredClone(contact) }, provider: 'local-contact-book' };
    }
    case 'contacts.delete': {
      const deletedId = deleteContact(state, args.id);
      recordActivity(state, 'contact.deleted', 'Contact deleted', { contactId: deletedId });
      return { output: { deletedId }, provider: 'local-contact-book' };
    }
    case 'communication.recipients.search': {
      const candidates = await searchMessagingRecipients(args.platform, args.query, { browserOptions: context.browserOptions, instagramDependencies: context.instagramDependencies || { fetchImpl } });
      return { output: { platform: args.platform, query: args.query, candidates }, provider: args.platform === 'whatsapp' ? 'whatsapp-web' : 'composio:instagram' };
    }
    case 'communication.send': {
      const contact = args.contactId ? (() => { try { return resolveContact(state, args.contactId); } catch { return null; } })() : null;
      const address = args.endpoint;
      if (!address) throw new ToolRuntimeError('CONTACT_DESTINATION_MISSING', `${args.contact} has no resolved ${args.platform} identity.`);
      let response; let provider;
      if (args.platform === 'whatsapp') {
        try {
          if (String(address).startsWith('whatsapp-search:')) throw Object.assign(new Error('Use WhatsApp Web for platform-search identities.'), { code: 'CAPABILITY_UNAVAILABLE' });
          response = await providerCall(() => executeVoiceOsAction({ type: 'message.send', app: 'whatsapp', target: address, message: args.message }, fetchImpl));
          provider = response.provider || 'voice-os:whatsapp';
        } catch (error) {
          if (!['CAPABILITY_UNAVAILABLE', 'CONFIGURATION_MISSING', 'CONNECTION_UNAVAILABLE'].includes(error.code)) throw error;
          response = await providerCall(() => sendWhatsAppWeb({ target: address, message: args.message }, context.browserOptions || {}));
          provider = 'whatsapp-web';
        }
      } else if (args.platform === 'instagram') {
        if (String(address).startsWith('instagram-web:')) {
          response = await providerCall(() => sendInstagramWeb({ target: address, message: args.message }, context.browserOptions || {}));
          provider = 'instagram-web';
        } else {
          try {
            response = await providerCall(() => executeConnectedOperation({ toolkit: 'instagram', operation: 'send', arguments: { threadId: address, recipientId: address, userId: address, username: address, recipient: address, target: address, message: args.message } }, { fetchImpl }));
            provider = 'composio:instagram';
          } catch (error) {
            // Never fall back after an ambiguous provider execution error: it
            // could duplicate an external side effect. Browser fallback is only
            // safe when provider capability/auth was rejected before execution.
            if (!['CAPABILITY_UNAVAILABLE', 'AUTHENTICATION_REQUIRED', 'CONFIGURATION_MISSING'].includes(error.code)) throw error;
            throw new ToolRuntimeError('INSTAGRAM_SEND_FAILED', 'The resolved recipient belongs to the provider connection, but that connection cannot send messages. Resolve the recipient through Instagram Web before retrying.');
          }
        }
      } else if (args.platform === 'discord') {
        response = await providerCall(() => executeConnectedOperation({ toolkit: 'discordbot', operation: 'send', arguments: { channelId: address, message: args.message } }, { fetchImpl }));
        provider = 'composio:discordbot';
      } else if (args.platform === 'slack') {
        response = await providerCall(() => slackOperation('send', { channel: address, message: args.message }, { fetchImpl }));
        provider = 'slack';
      } else if (args.platform === 'gmail') {
        response = await providerCall(() => executeConnectedOperation({ toolkit: 'gmail', operation: 'send', arguments: { to: address, subject: args.subject || 'Message from JARVIS', body: args.message } }, { fetchImpl }));
        provider = 'composio:gmail';
      }
      return { output: { verified: response?.verified === true || response?.success === true, acknowledged: response?.verified === true || response?.success === true, contactId: contact?.id || null, contactName: args.resolvedDisplayName || contact?.name || args.contact, platform: args.platform, provider, providerReference: response?.logId || response?.ts || response?.messageId || response?.data?.id || null, deliveryStatus: response?.deliveryStatus || 'sent' }, provider };
    }
    case 'connections.auth.open': {
      const urls = { whatsapp: 'https://web.whatsapp.com/', instagram: 'https://www.instagram.com/accounts/login/', discord: 'https://discord.com/login', gmail: 'https://accounts.google.com/' };
      const url = urls[args.platform];
      const managedProfile = ['whatsapp', 'instagram'].includes(args.platform) ? args.platform : undefined;
      let output;
      try {
        // Authentication must be visible. Reopen the platform-specific profile
        // headed so a previously started headless worker cannot hide QR/login UI.
        if (!context.browserOptions?.adapter && managedProfile) await closeBrowserSession(managedProfile);
        output = await browserAction('tabs.open', { url }, { ...(context.browserOptions || {}), profileName: managedProfile, headless: false });
      }
      catch (error) {
        if (/ERR_NETWORK_ACCESS_DENIED/i.test(String(error?.message || ''))) throw new ToolRuntimeError('CONNECTION_UNAVAILABLE', 'The managed browser was denied network access. Restart JARVIS normally with Start Voice OS.bat or npm run dev:server, then try again.');
        throw error;
      }
      return { output: { ...output, platform: args.platform, authenticationRequired: true, message: 'Complete sign-in in the visible managed browser. JARVIS does not read or store your password.' }, provider: 'playwright' };
    }
    case 'documents.ingest': {
      if (args.content === undefined && !args.path) throw new ToolRuntimeError('INVALID_ARGUMENTS', 'path or content is required');
      const document = await parseDocument(args);document.embedding=embed(document.content);
      state.documents ??= []; state.documents.unshift(document);
      recordActivity(state, 'document.ingested', document.name, { documentId: document.id });
      const { content, ...metadata } = document;
      return { output: { document: metadata }, provider: 'local' };
    }
    case 'documents.read': return{output:{document:await parseDocument(args)},provider:'local'};
    case 'documents.search': case 'documents.extract': {const document=(state.documents||[]).find(item=>item.id===args.documentId);if(!document)throw new ToolRuntimeError('INVALID_ARGUMENTS',`Document not found: ${args.documentId}`);return{output:{documentId:document.id,matches:searchDocument(document,args.query,args.limit||20)},provider:'local'};}
    case 'documents.summarize': {const document=(state.documents||[]).find(item=>item.id===args.documentId);if(!document)throw new ToolRuntimeError('INVALID_ARGUMENTS',`Document not found: ${args.documentId}`);return{output:{documentId:document.id,...summarizeDocument(document,args.maxCharacters||2000)},provider:'local'};}
    case 'documents.compare': {const left=(state.documents||[]).find(item=>item.id===args.leftId),right=(state.documents||[]).find(item=>item.id===args.rightId);if(!left||!right)throw new ToolRuntimeError('INVALID_ARGUMENTS','Both ingested documents are required.');return{output:compareDocuments(left,right),provider:'local'};}
    case 'runtime.telemetry': {
      const started = Date.parse(state?.runtime?.startedAt || '') || Date.now();
      return { output: { provider: sanitize(state?.provider || {}), modelRoute: sanitize(state?.runtime?.lastModelRoute || {}), usage: state?.runtime?.usage || {}, latency: state?.runtime?.latency || {}, uptimeSeconds: Math.max(0, Math.floor((Date.now() - started) / 1000)) }, provider: 'local' };
    }
    case 'diagnostics': return { output: diagnostics(state || {}), provider: 'local' };
    case 'media.status': case 'media.play': case 'media.pause': case 'media.toggle': case 'media.next': case 'media.previous': return {output:await mediaControl(definition.id.split('.')[1],context.desktopOptions),provider:`${process.platform}-media-session`};
    case 'youtube.search': return {output:await youtubeAction('search',{...args,service:'youtube'},context.browserOptions),provider:'playwright:youtube'};
    case 'youtube.play': return {output:await youtubeAction('play',{...args,service:'youtube'},context.browserOptions),provider:'playwright:youtube'};
    case 'youtube_music.play': return {output:await youtubeAction('play',{...args,service:'youtube_music'},context.browserOptions),provider:'playwright:youtube-music'};
    case 'ui.inspect': case 'ui.find': case 'ui.click': case 'ui.type': return {output:await uiAutomation(definition.id.slice(3),args,context.desktopOptions),provider:'windows-uia'};
    case 'audio.status': case 'audio.set_volume': case 'audio.volume_up': case 'audio.volume_down': case 'audio.mute': case 'audio.unmute': case 'audio.toggle_mute': return {output:await audioControl(definition.id.split('.')[1],args,context.desktopOptions),provider:`${process.platform}-audio`};
    case 'mouse.click': case 'mouse.double_click': case 'mouse.right_click': case 'mouse.scroll': case 'mouse.drag': return {output:await desktopInput(definition.id,args,context.desktopOptions),provider:`${process.platform}-desktop`};
    case 'screen.capture': return {output:await captureScreen(args,context.desktopOptions),provider:`${process.platform}-desktop`};
    case 'screen.perceive': return {output:await perceiveScreen(args,{state,desktopOptions:context.desktopOptions,fetchImpl,timeoutMs:definition.timeout}),provider:'windows+multimodal-model'};
    case 'computer.state': case 'computer.type': case 'computer.keypress': case 'clipboard.read': case 'clipboard.write': case 'mouse.position': case 'mouse.move': case 'screen.topology': return { output: await desktopInput(definition.id, args, context.desktopOptions), provider: `${process.platform}-desktop` };
    case 'apps.list': return { output: await applicationIndex(context.desktopOptions), provider: `${process.platform}-desktop` };
    case 'apps.search': { const index = await applicationIndex(context.desktopOptions); return { output: { apps: searchApplications(args.query, index.apps), warnings: index.warnings }, provider: `${process.platform}-desktop` }; }
    case 'windows.list': return { output: await listWindows(context.desktopOptions), provider: `${process.platform}-desktop` };
    case 'windows.get_active': { const snapshot = await listWindows(context.desktopOptions); return { output: { active: snapshot.active, previousActive: snapshot.previousActive, observedAt: snapshot.observedAt }, provider: `${process.platform}-desktop` }; }
    case 'system.processes.list': return { output: await listProcessesByMemory(args, context.desktopOptions), provider: `${process.platform}-processes` };
    case 'system.resources': return { output: await readSystemResources(args), provider: 'node:os' };
    case 'apps.close': return {output:await windowAction('close',args.target,context.desktopOptions),provider:`${process.platform}-desktop`};
    case 'windows.focus': case 'windows.minimize': case 'windows.maximize': case 'windows.restore': case 'windows.close': return { output: await windowAction(definition.id.split('.')[1], args.target, context.desktopOptions), provider: `${process.platform}-desktop` };
    case 'browser.external.open': return { output: { ...(await openExternalUrl(args.url, { ...context.desktopOptions, browser: args.browser })), label: args.label || new URL(args.url).hostname }, provider: args.browser ? `${process.platform}-named-browser` : `${process.platform}-default-browser` };
    case 'browser.open': return { output: { ...(await browserAction('tabs.open', args, context.browserOptions)), label: args.label || new URL(args.url).hostname }, provider: 'playwright' };
    case 'browser.tabs.list': case 'browser.tabs.open': case 'browser.tabs.close': case 'browser.tabs.switch': case 'browser.back': case 'browser.forward': case 'browser.reload': case 'browser.read': case 'browser.search': case 'browser.scroll': case 'browser.click': case 'browser.type': case 'browser.fill': case 'browser.submit': case 'browser.upload': case 'browser.download': return { output: await browserAction(definition.id.slice('browser.'.length), args, context.browserOptions), provider: 'playwright' };
    case 'system.app.open': return { output: await launchApplication(args.app, context.desktopOptions), provider: process.platform };
    case 'hardware.command': {
      const response = await providerCall(() => hardwareCommand(args));
      if (!response.configured) throw new ToolRuntimeError('CONFIGURATION_MISSING', response.message);
      return { output: response, provider: 'configured-hardware' };
    }
    case 'gmail.latest': {
      const limit = args.limit || 4;
      const response = await providerCall(() => executeComposioTool({ toolSlug: 'GMAIL_FETCH_EMAILS', arguments: { user_id: 'me', max_results: limit, verbose: false, include_payload: false, label_ids: ['INBOX'] } }, fetchImpl));
      if (!response.successful) throw new ToolRuntimeError('PROVIDER_ERROR', response.error || 'Gmail retrieval failed', { retryable: true });
      const emails = (Array.isArray(response.data?.messages) ? response.data.messages : []).sort((a, b) => Date.parse(b.messageTimestamp || 0) - Date.parse(a.messageTimestamp || 0)).slice(0, limit);
      return { output: { emails }, provider: 'composio:gmail', meta: { logId: response.logId } };
    }
    case 'gmail.search': case 'gmail.read': case 'gmail.draft': case 'gmail.send': case 'gmail.reply': case 'gmail.archive': case 'gmail.delete': case 'gmail.labels': {const action=definition.id.slice(6);const response=await providerCall(()=>executeConnectedOperation({toolkit:'gmail',operation:action,arguments:args},{fetchImpl}));return{output:response,provider:'composio:gmail',meta:{toolSlug:response.toolSlug,logId:response.logId}};}
    case 'instagram.messages.latest': {
      const response = await providerCall(() => readInstagramMessages({ limit: args.limit || 10, unreadOnly: Boolean(args.unreadOnly) }, { fetchImpl }));
      const synced = applyInstagramSyncState(state, response);
      const contacts = listContacts(state);
      const friendly = (message) => {
        const match = contacts.find((contact) => [contact.endpoints?.instagram].filter(Boolean).some((endpoint) => [message.senderId, message.username, `@${message.username}`].filter(Boolean).some((identity) => String(endpoint).toLowerCase() === String(identity).toLowerCase())));
        return match ? { ...message, sender: match.name } : message;
      };
      for (const key of ['messages','incomingMessages','presentationMessages']) if (Array.isArray(synced[key])) synced[key] = synced[key].map(friendly);
      return { output: synced, provider: 'composio:instagram', meta: { toolSlug: response.toolSlug } };
    }
    case 'instagram.send': case 'instagram.reply': {const action=definition.id.slice(10);const response=await providerCall(()=>executeConnectedOperation({toolkit:'instagram',operation:action,arguments:args},{fetchImpl}));return{output:response,provider:'composio:instagram',meta:{toolSlug:response.toolSlug,logId:response.logId}};}
    case 'discord.channels': case 'discord.search': case 'discord.read': case 'discord.send': case 'discord.reply': case 'discord.react': {const action=definition.id.slice(8);const response=await providerCall(()=>executeConnectedOperation({toolkit:'discordbot',operation:action,arguments:args},{fetchImpl}));return{output:response,provider:'composio:discordbot',meta:{toolSlug:response.toolSlug,logId:response.logId}};}
    case 'slack.status': case 'slack.channels': case 'slack.history': case 'slack.thread': case 'slack.search': case 'slack.users': case 'slack.send': case 'slack.reply': case 'slack.react': return{output:await providerCall(()=>slackOperation(definition.id.slice(6),args,{fetchImpl})),provider:'slack'};
    case 'media.generate': {
      const media = await providerCall(() => generateMedia(args.kind, args.prompt, fetchImpl));
      if (media.kind === 'video') { state.mediaJobs ??= []; state.mediaJobs.unshift(media); state.mediaJobs = state.mediaJobs.slice(0, 100); }
      return { output: { media }, provider: 'gemini' };
    }
    case 'command.execute': {
      const command = args.command.trim();
      if (/[;&|`<>]/.test(command)) throw new ToolRuntimeError('INVALID_ARGUMENTS', 'Only a single executable command without shell operators is allowed');
      const [executable, ...commandArgs] = command.split(/\s+/);
      const result = await execFileAsync(executable, commandArgs, { cwd: workspaceRoot, timeout: definition.timeout, windowsHide: true, maxBuffer: 1_000_000 });
      return { output: { stdout: result.stdout, stderr: result.stderr, code: 0 }, provider: 'local' };
    }
    case 'research.search': {
      const response = await providerCall(() => researchSearch(args.query));
      if (!response.configured) throw new ToolRuntimeError('CONFIGURATION_MISSING', response.message);
      return { output: response, provider: 'configured-search' };
    }
    case 'research.report': {const response=await providerCall(()=>researchReport(args.question,context.researchOptions));if(!response.configured)throw new ToolRuntimeError('CONFIGURATION_MISSING',response.message);return{output:response,provider:'configured-search'};}
    case 'messages.send': {
      if (!args.message && !args.text) throw new ToolRuntimeError('INVALID_ARGUMENTS', 'message or text is required');
      const response = await providerCall(() => sendMessage(args));
      if (!response.configured) throw new ToolRuntimeError('CONFIGURATION_MISSING', response.message);
      return { output: response, provider: response.provider || 'configured-messaging' };
    }
    case 'calendar.list': {
      if(String(process.env.COMPOSIO_API_KEY||'').startsWith('ak_')){const response=await providerCall(()=>executeConnectedOperation({toolkit:'googlecalendar',operation:'list',arguments:args},{fetchImpl}));return{output:response,provider:'composio:googlecalendar',meta:{toolSlug:response.toolSlug,logId:response.logId}};}
      const response = await providerCall(() => calendarRequest('GET'));
      if (!response.configured) throw new ToolRuntimeError('CONFIGURATION_MISSING', response.message);
      return { output: {...response,verified:true}, provider: response.provider || 'configured-calendar' };
    }
    case 'calendar.create': {
      if (!args.title && !args.text) throw new ToolRuntimeError('INVALID_ARGUMENTS', 'title or text is required');
      if(String(process.env.COMPOSIO_API_KEY||'').startsWith('ak_')){const response=await providerCall(()=>executeConnectedOperation({toolkit:'googlecalendar',operation:'create',arguments:args},{fetchImpl}));return{output:response,provider:'composio:googlecalendar',meta:{toolSlug:response.toolSlug,logId:response.logId}};}
      const response = await providerCall(() => calendarRequest('POST', args));
      if (!response.configured) throw new ToolRuntimeError('CONFIGURATION_MISSING', response.message);
      return { output: {...response,verified:true}, provider: response.provider || 'configured-calendar' };
    }
    case 'calendar.search': case 'calendar.update': case 'calendar.delete': case 'calendar.availability': {const action=definition.id.slice(9);const response=await providerCall(()=>executeConnectedOperation({toolkit:'googlecalendar',operation:action,arguments:args},{fetchImpl}));return{output:response,provider:'composio:googlecalendar',meta:{toolSlug:response.toolSlug,logId:response.logId}};}
    case 'auto_mcp.execute': return { output: await providerCall(() => executeAutoMcpTool(definition, args)), provider: 'auto_mcp' };
    case 'composio.execute': {
      const response = await providerCall(() => executeComposioTool(args, fetchImpl));
      if (!response.successful) throw new ToolRuntimeError('PROVIDER_ERROR', response.error || 'Composio execution failed', { retryable: true });
      return { output: response.data, provider: `composio:${String(args.toolSlug).split('_')[0].toLowerCase()}`, meta: { toolSlug: response.toolSlug, logId: response.logId } };
    }
    case 'voice-os.action': {
      const type = definition.id.replace('communications.', '');
      const response = await providerCall(() => executeVoiceOsAction({ ...args, type }, fetchImpl));
      return { output: response, provider: response.provider || 'voice-os' };
    }
    case 'workflows.list': return { output: { workflows: structuredClone(state?.workflows || []) }, provider: 'local' };
    case 'workflows.run': {
      const workflow = (state?.workflows || []).find((item) => item.id === args.workflowId);
      if (!workflow) throw new ToolRuntimeError('INVALID_ARGUMENTS', `Workflow not found: ${args.workflowId}`);
      const { runWorkflow } = await import('./workflowEngine.js');
      return { output: { run: await runWorkflow(state, workflow, { requestedBy: context.requestedBy || 'local-operator' }) }, provider: 'local' };
    }
    default: throw new ToolRuntimeError('TOOL_NOT_FOUND', `No handler exists for ${definition.id}`);
  }
}

async function verify(definition, output, state) {
  let verified = false; let evidence = null;
  switch (definition.verifier) {
    case 'project.inspect': verified = output.root === workspaceRoot && Array.isArray(output.entries); evidence = { root: output.root, entryCount: output.entries?.length || 0 }; break;
    case 'notification.action': verified=output.verified===true;evidence={notificationId:output.notification?.id||null,count:output.notifications?.length||output.top?.length||0,deduplicated:output.deduplicated||false};break;
    case 'phone.action': verified=output.verified===true;evidence={configured:output.configured,deviceCount:output.devices?.length,commandId:output.command?.id||null,executionState:output.executionState||null};break;
    case 'screen.perception': verified=output.verified===true&&Boolean(output.perception)&&Boolean(output.artifact?.sha256);evidence={artifactId:output.artifact?.id,sha256:output.artifact?.sha256,model:output.model,provider:output.provider,untrustedVisualContent:true};break;
    case 'developer.action': verified=output.verified===true&&output.exitCode===0;evidence={exitCode:output.exitCode,stdoutBytes:Buffer.byteLength(output.stdout||'')};break;
    case 'files.read': verified = typeof output.content === 'string' && Number.isInteger(output.bytes); evidence = { path: output.path, bytes: output.bytes }; break;
    case 'file.action': verified=output.verified===true;evidence=sanitize(output);break;
    case 'tasks.list': verified = Array.isArray(output.tasks); evidence = { count: output.tasks?.length || 0 }; break;
    case 'processes.list': verified = output.verified === true && Array.isArray(output.processes); evidence = { count: output.processes?.length || 0, sortedBy: output.sortedBy, observedAt: output.observedAt }; break;
    case 'tasks.create': case 'tasks.update': verified = Boolean(output.task?.id && (state.tasks || []).some((item) => item.id === output.task.id)); evidence = { taskId: output.task?.id, persisted: verified }; break;
    case 'memory.search': verified = Array.isArray(output.memories); evidence = { count: output.memories?.length || 0 }; break;
    case 'memory.store': case 'memory.index': verified = Boolean(output.memory?.id && (state.memories || []).some((item) => item.id === output.memory.id)); evidence = { memoryId: output.memory?.id, persisted: verified }; break;
    case 'memory.delete': verified=Boolean(output.deletedId)&&!(state.memories||[]).some(item=>item.id===output.deletedId);evidence={memoryId:output.deletedId,absent:verified};break;
    case 'contacts.result': verified=Array.isArray(output.contacts)||Boolean(output.contact?.id);evidence={count:output.contacts?.length,contactId:output.contact?.id,availablePlatforms:output.availablePlatforms};break;
    case 'contacts.upsert': verified=Boolean(output.contact?.id&&(state.contacts||[]).some(item=>item.id===output.contact.id));evidence={contactId:output.contact?.id,persisted:verified};break;
    case 'contacts.delete': verified=Boolean(output.deletedId)&&!(state.contacts||[]).some(item=>item.id===output.deletedId);evidence={contactId:output.deletedId,absent:verified};break;
    case 'recipient.search': verified=Array.isArray(output.candidates);evidence={platform:output.platform,count:output.candidates?.length||0};break;
    case 'communication.send': verified=output.verified===true&&output.acknowledged===true;evidence={contactId:output.contactId,platform:output.platform,provider:output.provider,providerReference:output.providerReference};break;
    case 'documents.ingest': verified = Boolean(output.document?.id && (state.documents || []).some((item) => item.id === output.document.id)); evidence = { documentId: output.document?.id, persisted: verified }; break;
    case 'document.read': verified=Boolean(output.document?.id&&Array.isArray(output.document?.chunks)&&output.document?.format);evidence={documentId:output.document?.id,format:output.document?.format,chunks:output.document?.chunks?.length};break;
    case 'document.result': verified=Boolean(output&&typeof output==='object');evidence={documentId:output.documentId||output.leftId,result:true};break;
    case 'diagnostics': verified = output.service === 'ok'; evidence = { service: output.service, persistence: output.persistence }; break;
    case 'system.app.open': verified = output.opened === true; evidence = sanitize(output); break;
    case 'external.browser.open': verified = output.success === true && output.verified === true && ['http:', 'https:'].includes(new URL(output.url).protocol); evidence = { url: output.url, browser: output.browser?.name || `${process.platform} default`, method: output.verification?.method }; break;
    case 'browser.action': verified = output.verified === true; evidence = definition.sensitiveInput ? { accepted: output.accepted, characters: output.characters, url: output.url } : sanitize(output); break;
    case 'desktop.action': verified = output.verified === true; evidence = definition.sensitiveOutput ? { method: 'native clipboard read', characters: output.characters } : sanitize(output); break;
    case 'desktop.input': verified = output.accepted === true && output.capsLockUnchanged === true && output.modifiersReleased === true; evidence = sanitize(output); break;
    case 'media.status': verified = output.verified===true&&(output.available===false||Boolean(output.sessionId));evidence={available:output.available,sessionId:output.sessionId||null};break;
    case 'hardware.command': verified = output.configured === true && output.data !== undefined; evidence = { configured: output.configured, acknowledged: output.data !== undefined }; break;
    case 'gmail.latest': verified = Array.isArray(output.emails); evidence = { count: output.emails?.length || 0 }; break;
    case 'instagram.messages.latest': verified = Array.isArray(output.messages); evidence = { count: output.messages?.length || 0, toolSlug: output.toolSlug }; break;
    case 'youtube.play': verified=output.verified===true&&output.service&&/youtube\.com\/watch\?v=/.test(output.url||'')&&output.playback?.paused===false&&Number(output.playback?.currentTime)>0&&Number(output.playback?.readyState)>=2;evidence={service:output.service,url:output.url,title:output.title,playback:output.playback};break;
    case 'media.generate': verified = Boolean(output.media?.id && output.media?.status); evidence = { mediaId: output.media?.id, status: output.media?.status }; break;
    case 'command.execute': verified = output.code === 0; evidence = { exitCode: output.code }; break;
    case 'research.search': verified = Array.isArray(output.sources); evidence = { sourceCount: output.sources?.length || 0 }; break;
    case 'research.report': verified=output.verified===true&&Array.isArray(output.sources)&&output.sources.length>0;evidence={sourceCount:output.sources?.length||0,contentSources:output.sources?.filter(source=>source.evidenceType==='retrieved-content').length||0,conflicts:output.conflicts?.length||0};break;
    case 'messages.send': verified = output.delivered === true; evidence = { delivered: output.delivered, provider: output.provider, messageId: output.ts || output.id || null }; break;
    case 'calendar.list': verified = output.verified===true||output.configured === true; evidence = { configured: output.configured??true,toolSlug:output.toolSlug||null }; break;
    case 'calendar.create': verified = output.verified===true||(output.configured === true && Boolean(output.scheduled || output.data)); evidence = { provider: output.provider || output.toolkit||null, acknowledgement: output.logId||output.scheduled || output.data?.id || null }; break;
    case 'connected.operation': verified=output.verified===true&&output.data!==undefined;evidence={toolkit:output.toolkit,operation:output.operation,toolSlug:output.toolSlug,logId:output.logId||null};break;
    case 'slack.operation': verified=output.verified===true;evidence={method:output.method||'auth.test',acknowledged:verified};break;
    case 'composio.execute': verified = output !== undefined; evidence = { outputPresent: output !== undefined }; break;
    case 'auto_mcp.result': verified = output?.success === true && output.result !== undefined; evidence = { provider: output?.provider, tool: output?.tool, resultPresent: output?.result !== undefined }; break;
    case 'voice-os.action': verified = output.success === true && Boolean(output.state); evidence = { state: output.state, provider: output.provider }; break;
    case 'workflows.list': verified = Array.isArray(output.workflows); evidence = { count: output.workflows?.length || 0 }; break;
    case 'workflows.run': verified = ['completed', 'waiting_for_approval'].includes(output.run?.status || output.run?.state); evidence = { runId: output.run?.id, status: output.run?.status || output.run?.state }; break;
    case 'object': verified = Boolean(output && typeof output === 'object'); evidence = { object: verified }; break;
    default: verified = output !== undefined; evidence = { outputPresent: verified };
  }
  if (!verified) throw new ToolRuntimeError('VERIFICATION_FAILED', `Verification failed for ${definition.id}`, { details: evidence });
  return { verified, evidence };
}

export async function executeToolCall(rawCall = {}, context = {}) {
  const started = performance.now(); let policyMs = 0; let verificationMs = 0; let toolMs = 0;
  const state = context.state || { tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} };
  let definition; let call; let run; let step; let execution; let approval; let executionStarted = false; let approvalPrevalidated = false; let validatedArgs;
  try {
    const name = String(rawCall.toolName || rawCall.toolId || '').trim();
    definition = getToolDefinition(name);
    if (!definition) throw new ToolRuntimeError('TOOL_NOT_FOUND', `Unknown tool: ${name || '(missing)'}`);
    validatedArgs = validateToolArguments(definition.inputSchema, rawCall.arguments ?? rawCall.input ?? {});
    const args = await resolveToolArguments(definition, validatedArgs, state, context);
    if (state.runtime?.emergencyStop === true && definition.sideEffects) throw new ToolRuntimeError('PERMISSION_DENIED', 'JARVIS emergency stop is active. Resume execution in Settings -> Security before running side effects.');
    const permissionContext = rawCall.permissionContext || context.permissionContext || {};
    enforcePermission(definition, args, permissionContext);
    approval = (rawCall.approvalId ? (state.approvals || []).find((item) => item.id === rawCall.approvalId) : null) || context.approval;
    call = { id: String(rawCall.id || approval?.toolCallId || toolId()), toolName: definition.id, arguments: args, source: rawCall.source || context.source || 'api', runId: rawCall.runId || approval?.runId || context.runId || null, stepId: rawCall.stepId || approval?.stepId || context.stepId || null, requestedBy: rawCall.requestedBy || context.requestedBy || 'local-operator', sessionId: rawCall.permissionContext?.sessionId || context.sessionId || null, idempotencyKey: rawCall.idempotencyKey || null };

    // An explicitly supplied approval is always validated before any replay is
    // returned, so a consumed/expired approval cannot masquerade as a new use.
    if (approval && dynamicApproval(definition, args, context, state)) {
      validateExactApproval(approval, definition.id, args, { runId: call.runId, stepId: call.stepId, toolCallId: call.id, requestedBy: call.requestedBy, sessionId: call.sessionId });
      approvalPrevalidated = true;
    }

    if (call.idempotencyKey) {
      const replay = findToolReplay(state, call.idempotencyKey, definition.id, args);
      if (replay) {
        const previous = replay.result;
        const result = previous.toolCallId ? { ...previous, replayed: true } : { toolCallId: call.id, toolName: definition.id, runId: replay.runId || call.runId, stepId: call.stepId, status: 'completed', output: previous.data ?? previous, error: null, verified: true, verificationEvidence: { replayed: true }, latencyMs: Math.round(performance.now() - started), provider: definition.provider, retryCount: 0, replayed: true };
        updateTelemetry(state, result, { policyMs, verificationMs, toolMs, totalMs: result.latencyMs });
        return result;
      }
    }

    ({ run, step, execution } = ensureRun(state, call, definition, context));
    if (!definition.enabled) throw new ToolRuntimeError(definition.availabilityReason ? 'CONFIGURATION_MISSING' : 'TOOL_DISABLED', definition.availabilityReason || `${definition.id} is disabled`, { details: { requirements: definition.configurationRequirements || [] } });

    const policyStarted = performance.now();
    if (dynamicApproval(definition, args, context, state)) {
      if (!approval) {
        approval = createExactApproval({ toolName: definition.id, input: args, title: `Approve ${definition.name}`, runId: run.id, stepId: step.id, toolCallId: call.id, requestedBy: call.requestedBy, sessionId: call.sessionId || run.conversationId || null, originatingBackend: context.originatingBackend || run.model || null, backendConversationId: context.backendConversationId || null, idempotencyKey: call.idempotencyKey, risk: definition.riskLevel });
        state.approvals ??= []; state.approvals.unshift(approval); run.approvals ??= []; run.approvals.push(approval.id);
        transitionRun(run, 'waiting_for_approval'); step.status = 'waiting_for_approval'; execution.status = 'waiting_for_approval'; execution.approvalId = approval.id;
        policyMs = Math.round((performance.now() - policyStarted) * 100) / 100;
        const result = { toolCallId: call.id, toolName: definition.id, runId: run.id, stepId: step.id, status: 'waiting_for_approval', output: null, error: { code: 'APPROVAL_REQUIRED', message: `Approval required for ${definition.name}` }, approval, verified: false, verificationEvidence: null, latencyMs: Math.round((performance.now() - started) * 100) / 100, provider: definition.provider, retryCount: 0 };
        recordActivity(state, 'approval.requested', approval.title, { approvalId: approval.id, toolName: definition.id, runId: run.id, toolCallId: call.id });
        updateTelemetry(state, result, { policyMs, verificationMs, toolMs, totalMs: result.latencyMs });
        return result;
      }
      if (!approvalPrevalidated) validateExactApproval(approval, definition.id, args, { runId: run.id, stepId: step.id, toolCallId: call.id, requestedBy: call.requestedBy, sessionId: call.sessionId });
    }
    policyMs = Math.round((performance.now() - policyStarted) * 100) / 100;

    const retryPolicy = definition.retry || { maxAttempts: 1, retryOn: [] };
    let handled; let lastError;
    for (let attempt = 1; attempt <= Math.max(1, retryPolicy.maxAttempts); attempt += 1) {
      const toolStarted = performance.now(); executionStarted = true;
      try {
        const handler = context.handler || executeHandler;
        handled = await withTimeout(() => handler(definition, args, { ...context, requestedBy: call.requestedBy, runId:run.id, stepId:step.id }, state), Number(context.timeoutMs || definition.timeout || 30000));
        toolMs += performance.now() - toolStarted; execution.retryCount = attempt - 1; break;
      }
      catch (error) {
        toolMs += performance.now() - toolStarted; lastError = normalizeToolError(error); execution.retryCount = attempt - 1;
        if (attempt >= retryPolicy.maxAttempts || !retryPolicy.retryOn.includes(lastError.code)) throw lastError;
      }
    }
    if (!handled) throw lastError || new ToolRuntimeError('EXECUTION_FAILED', `${definition.id} produced no result`);

    step.status = 'verifying'; execution.status = 'verifying';
    const verificationStarted = performance.now();
    try { validateToolArguments(definition.outputSchema, handled.output); }
    catch (error) { throw new ToolRuntimeError('VERIFICATION_FAILED', `Invalid output from ${definition.id}: ${error.message}`, { details: error.details }); }
    const verifier = context.verifier || verify;
    const verification = await verifier(definition, handled.output, state);
    verificationMs = Math.round((performance.now() - verificationStarted) * 100) / 100;
    if (approval) consumeExactApproval(approval, { verified: true, evidence: verification.evidence });
    if (approval && definition.sensitiveInput) { approval.action = { redacted: true }; approval.originalArguments = { redacted: true }; approval.resolvedArguments = { redacted: true }; }

    const completedAt = nowIso();
    const result = { toolCallId: call.id, toolName: definition.id, runId: run.id, stepId: step.id, status: 'completed', output: handled.output, error: null, verified: true, verificationEvidence: verification.evidence, latencyMs: Math.round((performance.now() - started) * 100) / 100, provider: handled.provider || definition.provider, retryCount: execution.retryCount, meta: handled.meta || null };
    updateEphemeralContext(state,definition,handled.output);
    result.sensitiveOutput = Boolean(definition.sensitiveOutput);
    const storedOutput = definition.sensitiveOutput ? { redacted: true } : sanitize(handled.output);
    Object.assign(execution, { status: 'completed', output: storedOutput, completedAt, verified: true, verificationEvidence: verification.evidence, latencyMs: result.latencyMs, provider: result.provider });
    Object.assign(step, { status: 'completed', result: storedOutput, completedAt, error: null });
    run.currentStep = Math.min(run.steps.length, step.index + 1);
    recordActivity(state, 'tool.executed', definition.id, { toolName: definition.id, runId: run.id, toolCallId: call.id, verified: true });
    if (call.idempotencyKey && !definition.sensitiveOutput) rememberToolResult(state, { idempotencyKey: call.idempotencyKey, runId: run.id, toolId: definition.id, input: args, result });
    if (context.autoCompleteRun !== false && run.steps.every((item) => item.status === 'completed')) completeRun(run, storedOutput, { total: 0 });
    updateTelemetry(state, result, { policyMs, verificationMs, toolMs: Math.round(toolMs * 100) / 100, totalMs: result.latencyMs });
    return result;
  } catch (error) {
    const normalized = normalizeToolError(error);
    if (definition?.id === 'communication.send' && ['WHATSAPP_RECIPIENT_AMBIGUOUS', 'INSTAGRAM_RECIPIENT_AMBIGUOUS'].includes(normalized.code) && Array.isArray(error.details?.candidates)) {
      call ||= { id: String(rawCall.id || toolId()), toolName: definition.id, arguments: validatedArgs, source: rawCall.source || context.source || 'api', runId: rawCall.runId || context.runId || null, stepId: rawCall.stepId || context.stepId || null, requestedBy: rawCall.requestedBy || context.requestedBy || 'local-operator', sessionId: rawCall.permissionContext?.sessionId || context.sessionId || context.conversationId || null, idempotencyKey: rawCall.idempotencyKey || null };
      ({ run, step, execution } = ensureRun(state, call, definition, context));
      transitionRun(run, 'paused', { waitingReason: 'recipient_clarification' });
      step.status = 'waiting_for_clarification'; execution.status = 'waiting_for_clarification';
      const pendingIntent = createPendingMessagingIntent(state, { runId: run.id, stepId: step.id, toolCallId: call.id, idempotencyKey: call.idempotencyKey || `${run.id}:${call.id}`, jarvisSessionId: call.sessionId || run.conversationId, originatingBackend: context.originatingBackend || run.model, arguments: validatedArgs, candidates: error.details.candidates });
      const publicCandidates = pendingIntent.candidates.map(({ platformIdentity, ...candidate }) => candidate);
      const result = { toolCallId: call.id, toolName: definition.id, runId: run.id, stepId: step.id, status: 'waiting_for_clarification', output: null, error: { code: normalized.code, message: normalized.message, details: { pendingIntentId: pendingIntent.id, candidates: publicCandidates } }, pendingIntent: { ...pendingIntent, message: '[REDACTED]', originalArguments: { redacted: true }, candidates: publicCandidates }, verified: false, verificationEvidence: null, latencyMs: Math.round((performance.now() - started) * 100) / 100, provider: definition.provider, retryCount: 0 };
      updateTelemetry(state, result, { policyMs, verificationMs, toolMs, totalMs: result.latencyMs });
      return result;
    }
    if (approval && executionStarted && approval.status === 'approved') consumeExactApproval(approval, { error: normalized.message, code: normalized.code });
    if (approval && executionStarted && definition?.sensitiveInput) { approval.action = { redacted: true }; approval.originalArguments = { redacted: true }; approval.resolvedArguments = { redacted: true }; }
    const completedAt = nowIso();
    if (execution) Object.assign(execution, { status: normalized.code === 'VERIFICATION_FAILED' ? 'failed_verification' : 'failed', error: publicToolError(normalized), completedAt, verified: false, latencyMs: Math.round((performance.now() - started) * 100) / 100 });
    if (step) Object.assign(step, { status: normalized.code === 'VERIFICATION_FAILED' ? 'failed_verification' : 'failed', error: publicToolError(normalized), completedAt });
    if (run && context.continueOnError !== true) failRun(run, normalized);
    const result = { toolCallId: call?.id || rawCall.id || null, toolName: definition?.id || rawCall.toolName || rawCall.toolId || null, runId: run?.id || rawCall.runId || null, stepId: step?.id || rawCall.stepId || null, status: normalized.code === 'VERIFICATION_FAILED' ? 'failed_verification' : 'failed', output: null, error: publicToolError(normalized), verified: false, verificationEvidence: normalized.details || null, latencyMs: Math.round((performance.now() - started) * 100) / 100, provider: definition?.provider || null, retryCount: execution?.retryCount || 0 };
    recordActivity(state, 'tool.failed', result.toolName || 'unknown', { toolName: result.toolName, runId: result.runId, toolCallId: result.toolCallId, code: normalized.code });
    updateTelemetry(state, result, { policyMs, verificationMs, toolMs: Math.round(toolMs * 100) / 100, totalMs: result.latencyMs });
    return result;
  }
}

// Compatibility adapter for existing internal callers. It still traverses the
// canonical runtime and cannot bypass validation, policy, verification, or Runs.
export async function executeTool(toolName, input = {}, context = {}) {
  const result = await executeToolCall({ id: context.toolCallId, toolName, arguments: input, source: context.source || 'compatibility', runId: context.runId, stepId: context.stepId, approvalId: context.approval?.id || context.approvalId, requestedBy: context.requestedBy, idempotencyKey: context.idempotencyKey }, context);
  if (result.status === 'waiting_for_approval') throw Object.assign(new ToolRuntimeError('APPROVAL_REQUIRED', result.error.message, { details: { approval: result.approval, result } }), { approval: result.approval, result });
  if (result.status !== 'completed') throw Object.assign(new ToolRuntimeError(result.error.code, result.error.message, { details: result.error.details }), { result });
  return { ok: true, toolId: toolName, data: result.output, meta: { ...result.meta, canonical: result } };
}

export { workspaceRoot };
