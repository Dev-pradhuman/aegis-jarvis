import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data');
const file = path.join(root, 'state.json');
const seed = {
  runtime: { startedAt: new Date().toISOString(), usage: { requests: 0, tokens: 0, cost: 0 }, latency: { routerMs: 0, modelMs: 0, toolMs: 0, policyMs: 0, databaseMs: 0, totalMs: 0, samples: 0 } },
  provider: { id: 'local', label: 'Local model', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1', configured: false },
  modelRouting: { jarvisMode: 'normal', modelMode: 'auto', manualModel: 'muse-spark-1.2', manualFallbackAllowed: true, providerHealth: {}, telemetry: [] },
  tasks: [
    { id: 'task-1', title: 'Research quantum computing', sub: 'Deep research · Web sources · Papers', icon: 'cyan', svg: 'search', pct: 42, status: 'active' },
    { id: 'task-2', title: 'Message Arjun', sub: 'Follow up on project update', icon: 'orange', svg: 'chat', pct: null, status: 'pending' },
    { id: 'task-3', title: 'Review system architecture', sub: 'Check modules and dependencies', icon: 'green', svg: 'brain', pct: 65, status: 'active' },
    { id: 'task-4', title: 'Prepare meeting agenda', sub: "For tomorrow's standup", icon: 'orange', svg: 'calendar', pct: null, status: 'pending' },
  ],
  approvals: [
    { id: 'approval-1', icon: 'shield', risk: 'med', title: 'Access external API', sub: 'Service: OpenAI API', status: 'pending' },
    { id: 'approval-2', icon: 'circleCheck', risk: 'high', title: 'Install dependencies', sub: 'Project: agi-sr-core', status: 'pending' },
    { id: 'approval-3', icon: 'terminal', risk: 'high', title: 'Execute shell command', sub: 'Command: system update', status: 'pending' },
    { id: 'approval-4', icon: 'mail', risk: 'med', title: 'Send email to team', sub: 'From: Jarvis', status: 'pending' },
  ],
  activity: [],
  conversations: [],
  workflows: [
    { id: 'workflow-1', name: 'Morning intelligence brief', trigger: 'Weekdays · 08:00', runs: 42, state: 'active', steps: ['Collect', 'Verify', 'Summarize', 'Deliver'], lastRun: null },
    { id: 'workflow-2', name: 'Repository health scan', trigger: 'On push · main', runs: 118, state: 'active', steps: ['Inspect', 'Test', 'Score', 'Notify'], lastRun: null },
    { id: 'workflow-3', name: 'Meeting preparation', trigger: '30 min before event', runs: 17, state: 'paused', steps: ['Context', 'People', 'Agenda', 'Brief'], lastRun: null },
  ],
  memories: [],
  documents: [],
  integrations: [],
  runs: [],
  toolExecutions: [],
  mediaJobs: [],
};

let statePromise;
let updateQueue = Promise.resolve();

async function load() {
  await mkdir(root, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return { ...structuredClone(seed), ...parsed, runtime: { ...seed.runtime, ...(parsed.runtime || {}), usage: { ...seed.runtime.usage, ...(parsed.runtime?.usage || {}) }, latency: { ...seed.runtime.latency, ...(parsed.runtime?.latency || {}) } }, provider: { ...seed.provider, ...(parsed.provider || {}) }, modelRouting: { ...seed.modelRouting, ...(parsed.modelRouting || {}), providerHealth: parsed.modelRouting?.providerHealth || {}, telemetry: parsed.modelRouting?.telemetry || [] }, conversations: parsed.conversations || [], workflows: parsed.workflows || structuredClone(seed.workflows), runs: parsed.runs || [], toolExecutions: parsed.toolExecutions || [], mediaJobs: parsed.mediaJobs || [] };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(file, JSON.stringify(seed, null, 2));
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
    await writeFile(file, JSON.stringify(next, null, 2));
    statePromise = Promise.resolve(next);
    return next;
  });
  updateQueue = operation.catch(() => undefined);
  return operation;
}

export function activityEntry(type, message, meta = {}) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, message, meta, at: new Date().toISOString() };
}
