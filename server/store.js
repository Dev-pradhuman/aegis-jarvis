import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDirectory } from './platform/paths.js';
import { ensureStarterContacts } from './contactBook.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const root = dataDirectory(path.dirname(serverDir));
const file = path.join(root, 'state.json');
const CURRENT_SCHEMA_VERSION = 12;
const seed = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  migrationHistory: [],
  runtime: { startedAt: new Date().toISOString(), usage: { requests: 0, tokens: 0, cost: 0 }, latency: { routerMs: 0, modelMs: 0, toolMs: 0, policyMs: 0, verificationMs: 0, databaseMs: 0, totalMs: 0, samples: 0 }, toolTelemetry: [] },
  provider: { id: 'local', label: 'Local model', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1', configured: false },
  modelRouting: { jarvisMode: 'normal', modelMode: 'auto', manualModel: 'muse-spark-1.2', manualFallbackAllowed: true, providerHealth: {}, telemetry: [] },
  permissionMode: 'normal',
  permissionAudit: [],
  pendingMessagingIntents: [],
  instagramSyncState: { conversations: {}, updatedAt: null },
  chatgptWeb: { enabled: false, useAsDefault: false, sessionUrl: null, turns: 0, bootstrapped: false, projectName: 'jarvis-chat', projectUrl: null, lastSuccessAt: null, lastError: null },
  geminiWeb: { enabled: false, sessionUrl: null, turns: 0, bootstrapped: false, lastSuccessAt: null, lastError: null },
  brainBackends: { defaultBackend: 'auto', fallbackBackend: 'gemini-web', streaming: true },
  voiceOs: { settings: { enabled: true, topIsland: true, globalHotkeys: false, pushToTalkKey: 'Alt', dictationKey: 'Ctrl+Shift', notifications: { enabled: false, allApps: true, apps: ['gmail', 'whatsapp', 'slack', 'discord', 'instagram', 'calendar'] } } },
  tasks: [],
  approvals: [],
  activity: [],
  conversations: [],
  chatSessions: [],
  activeSessionId: null,
  credentialMetadata: {},
  workflows: [],
  memories: [],
  contacts: ensureStarterContacts([]),
  notifications: [],
  eventReceipts: [],
  phoneBridge: { devices: [], pairings: [], commands: [], receipts: [] },
  documents: [],
  integrations: [],
  runs: [],
  toolExecutions: [],
  mediaJobs: [],
};

const migrations = [
  { version: 1, description: 'Introduce persisted schema versioning without changing existing records.', apply: (state) => state },
  { version: 2, description: 'Add canonical tool-execution telemetry and Run-compatible defaults.', apply: (state) => ({ ...state, runtime: { ...(state.runtime || {}), toolTelemetry: state.runtime?.toolTelemetry || [] }, toolExecutions: state.toolExecutions || [], runs: state.runs || [], approvals: state.approvals || [] }) },
  { version: 3, description: 'Classify durable memories and attach source/link/confidence metadata.', apply: (state) => ({ ...state, memories: (state.memories || []).map((memory) => ({ source: 'legacy', memoryType: memory.kind || 'project', projectId: null, taskId: null, runId: null, importance: 'normal', confidence: 1, createdAt: memory.createdAt || new Date().toISOString(), updatedAt: memory.updatedAt || null, ...memory })) }) },
  { version: 4, description: 'Add normalized durable notification storage.', apply: (state) => ({ ...state, notifications: state.notifications || [] }) },
  { version: 5, description: 'Add durable workflow event receipts for duplicate-delivery protection.', apply: (state) => ({ ...state, eventReceipts: state.eventReceipts || [] }) },
  { version: 6, description: 'Add paired phone devices and durable command/anti-replay state.', apply: (state) => ({ ...state, phoneBridge: state.phoneBridge || { devices: [], pairings: [], commands: [], receipts: [] } }) },
  { version: 7, description: 'Add the durable contact library with user-requested aliases and platform endpoints.', apply: (state) => ({ ...state, contacts: ensureStarterContacts(state.contacts || []) }) },
  { version: 8, description: 'Add isolated ChatGPT Web brain session metadata without storing browser credentials.', apply: (state) => ({ ...state, chatgptWeb: state.chatgptWeb || { enabled: false, useAsDefault: false, sessionUrl: null, turns: 0, bootstrapped: false, lastSuccessAt: null, lastError: null } }) },
  { version: 9, description: 'Add durable isolated chat sessions and non-secret credential labels/verification state.', apply: (state) => { const now = new Date().toISOString(), id = `chat-legacy-${Date.now()}`; const sessions = state.chatSessions?.length ? state.chatSessions : [{ id, title: (state.conversations || []).length ? 'Previous conversation' : 'New chat', createdAt: now, updatedAt: now, chatgptConversationUrl: null }]; return { ...state, chatSessions: sessions, activeSessionId: state.activeSessionId || sessions[0].id, credentialMetadata: state.credentialMetadata || {}, conversations: (state.conversations || []).map((message) => ({ ...message, conversationId: message.conversationId || sessions[0].id })) }; } },
  { version: 10, description: 'Add Gemini Headless and shared browser-brain routing/stream settings without storing authentication data.', apply: (state) => ({ ...state, geminiWeb: state.geminiWeb || { enabled: false, sessionUrl: null, turns: 0, bootstrapped: false, lastSuccessAt: null, lastError: null }, brainBackends: state.brainBackends || { defaultBackend: state.chatgptWeb?.useAsDefault ? 'chatgpt-web' : 'auto', fallbackBackend: 'gemini-web', streaming: true }, chatSessions: (state.chatSessions || []).map((session) => ({ geminiConversationUrl: null, geminiBootstrapped: false, geminiTurns: 0, ...session })) }) },
  { version: 11, description: 'Add persisted centralized permission mode and non-sensitive policy audit history.', apply: (state) => ({ ...state, permissionMode: ['normal','skip_permissions','full_permissions'].includes(state.permissionMode) ? state.permissionMode : 'normal', permissionAudit: state.permissionAudit || [], approvals: (state.approvals || []).map((approval) => ({ originalArguments: approval.action, resolvedArguments: approval.action, jarvisSessionId: approval.sessionId || null, idempotencyKey: approval.runId && approval.toolCallId ? `${approval.runId}:${approval.toolCallId}` : approval.toolCallId || null, executionResult: approval.result || null, ...approval })) }) },
  { version: 12, description: 'Add durable messaging recipient-clarification transactions and Instagram observation cursors.', apply: (state) => ({ ...state, pendingMessagingIntents: state.pendingMessagingIntents || [], instagramSyncState: state.instagramSyncState || { conversations: {}, updatedAt: null } }) },
];

function applyMigrations(input) {
  let state = structuredClone(input); let changed = false;
  let version = Number(state.schemaVersion || 0);
  state.migrationHistory = Array.isArray(state.migrationHistory) ? state.migrationHistory : [];
  for (const migration of migrations) {
    if (version >= migration.version) continue;
    state = migration.apply(state);
    version = migration.version; changed = true;
    state.schemaVersion = version;
    state.migrationHistory.push({ version, description: migration.description, appliedAt: new Date().toISOString() });
  }
  if (version > CURRENT_SCHEMA_VERSION) throw new Error(`State schema ${version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`);
  return { state, changed };
}

let statePromise;
let updateQueue = Promise.resolve();
async function atomicWrite(value) {
  const temporary = `${file}.${process.pid}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function load() {
  await mkdir(root, { recursive: true });
  try {
    const source = JSON.parse(await readFile(file, 'utf8'));
    const migrated = applyMigrations(source);
    const parsed = migrated.state;
    if (migrated.changed) await atomicWrite(parsed);
    return { ...structuredClone(seed), ...parsed, runtime: { ...seed.runtime, ...(parsed.runtime || {}), usage: { ...seed.runtime.usage, ...(parsed.runtime?.usage || {}) }, latency: { ...seed.runtime.latency, ...(parsed.runtime?.latency || {}) } }, provider: { ...seed.provider, ...(parsed.provider || {}) }, modelRouting: { ...seed.modelRouting, ...(parsed.modelRouting || {}), providerHealth: parsed.modelRouting?.providerHealth || {}, telemetry: parsed.modelRouting?.telemetry || [] }, chatgptWeb: { ...seed.chatgptWeb, ...(parsed.chatgptWeb || {}) }, geminiWeb: { ...seed.geminiWeb, ...(parsed.geminiWeb || {}) }, brainBackends: { ...seed.brainBackends, ...(parsed.brainBackends || {}) }, voiceOs: { ...seed.voiceOs, ...(parsed.voiceOs || {}), settings: { ...seed.voiceOs.settings, ...(parsed.voiceOs?.settings || {}), notifications: { ...seed.voiceOs.settings.notifications, ...(parsed.voiceOs?.settings?.notifications || {}) } } }, contacts: ensureStarterContacts(parsed.contacts || []), conversations: parsed.conversations || [], chatSessions: parsed.chatSessions || [], activeSessionId: parsed.activeSessionId || null, credentialMetadata: parsed.credentialMetadata || {}, workflows: parsed.workflows || structuredClone(seed.workflows), runs: parsed.runs || [], toolExecutions: parsed.toolExecutions || [], mediaJobs: parsed.mediaJobs || [], pendingMessagingIntents: parsed.pendingMessagingIntents || [], instagramSyncState: parsed.instagramSyncState || { conversations: {}, updatedAt: null } };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await atomicWrite(seed);
    return structuredClone(seed);
  }
}

export async function getState() {
  statePromise ??= load();
  return statePromise;
}

export async function updateState(mutator) {
  const operation = updateQueue.then(async () => {
    const current = await getState();
    const next = await mutator(current) || current;
    const databaseStarted = performance.now();
    await atomicWrite(next);
    next.runtime ??= {}; next.runtime.latency ??= {};
    next.runtime.latency.databaseMs = Math.round((performance.now() - databaseStarted) * 100) / 100;
    statePromise = Promise.resolve(next);
    return next;
  });
  updateQueue = operation.catch(() => undefined);
  return operation;
}

export function activityEntry(type, message, meta = {}) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, message, meta, at: new Date().toISOString() };
}
