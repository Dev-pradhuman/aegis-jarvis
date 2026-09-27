import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { failRun } from './runEngine.js';
import { DEFAULT_APPROVAL_POLICY } from './approvalPolicy.js';
import { expirePendingApprovals } from './approvalExpiry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data');
const file = path.join(root, 'state.json');
const seed = {
  runtime: { startedAt: new Date().toISOString(), usage: { requests: 0, tokens: 0, cost: 0 }, latency: { routerMs: 0, modelMs: 0, toolMs: 0, policyMs: 0, databaseMs: 0, totalMs: 0, samples: 0 } },
  provider: { id: 'local', label: 'Local model', model: 'qwen3:4b', baseUrl: 'http://127.0.0.1:11434/v1', configured: false },
  modelRouting: { jarvisMode: 'normal', modelMode: 'auto', manualModel: 'muse-spark-1.2', manualFallbackAllowed: true, providerHealth: {}, telemetry: [] },
  tasks: [],
  reminders: [],
  approvals: [],
  approvalPolicy: DEFAULT_APPROVAL_POLICY,
  activity: [],
  conversations: [],
  workflows: [],
  memories: [],
  documents: [],
  integrations: [],
  runs: [],
  toolExecutions: [],
  mediaJobs: [],
};

let statePromise;
let updateQueue = Promise.resolve();

export async function writeJsonAtomically(target, value) {
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
    await chmod(target, 0o600);
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export function recoverInterruptedRuns(runs = []) {
  let recovered = 0;
  for (const run of runs) {
    if (!['queued', 'planning', 'running'].includes(run.status)) continue;
    failRun(run, new Error('JARVIS stopped before this Run completed'));
    run.errors.at(-1).code = 'SERVICE_RESTARTED';
    recovered += 1;
  }
  return recovered;
}

async function load() {
  await mkdir(root, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    await chmod(file, 0o600);
    const interrupted = recoverInterruptedRuns(parsed.runs);
    const expiredApprovals = expirePendingApprovals(parsed);
    let removedDemoSeed = false;
    if (!parsed.demoSeedRemoved) {
      const demoTasks = new Map([['task-1', 'Research quantum computing'], ['task-2', 'Message Arjun'], ['task-3', 'Review system architecture'], ['task-4', 'Prepare meeting agenda']]);
      const demoApprovals = new Map([['approval-1', 'Access external API'], ['approval-2', 'Install dependencies'], ['approval-3', 'Execute shell command'], ['approval-4', 'Send email to team']]);
      const demoWorkflows = new Map([['workflow-1', 'Morning intelligence brief'], ['workflow-2', 'Repository health scan'], ['workflow-3', 'Meeting preparation']]);
      parsed.tasks = (parsed.tasks || []).filter((item) => demoTasks.get(item.id) !== item.title);
      parsed.approvals = (parsed.approvals || []).filter((item) => demoApprovals.get(item.id) !== item.title);
      parsed.workflows = (parsed.workflows || []).filter((item) => demoWorkflows.get(item.id) !== item.name);
      parsed.demoSeedRemoved = true;
      removedDemoSeed = true;
    }
    if (interrupted || removedDemoSeed || expiredApprovals.length) await writeJsonAtomically(file, parsed);
    return { ...structuredClone(seed), ...parsed, approvalPolicy: { ...DEFAULT_APPROVAL_POLICY, ...(parsed.approvalPolicy || {}) }, reminders: parsed.reminders || [], runtime: { ...seed.runtime, ...(parsed.runtime || {}), usage: { ...seed.runtime.usage, ...(parsed.runtime?.usage || {}) }, latency: { ...seed.runtime.latency, ...(parsed.runtime?.latency || {}) } }, provider: { ...seed.provider, ...(parsed.provider || {}) }, modelRouting: { ...seed.modelRouting, ...(parsed.modelRouting || {}), providerHealth: parsed.modelRouting?.providerHealth || {}, telemetry: parsed.modelRouting?.telemetry || [] }, conversations: parsed.conversations || [], workflows: parsed.workflows || structuredClone(seed.workflows), runs: parsed.runs || [], toolExecutions: parsed.toolExecutions || [], mediaJobs: parsed.mediaJobs || [] };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeJsonAtomically(file, seed);
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
    await writeJsonAtomically(file, next);
    statePromise = Promise.resolve(next);
    return next;
  });
  updateQueue = operation.catch(() => undefined);
  return operation;
}

export function activityEntry(type, message, meta = {}) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, message, meta, at: new Date().toISOString() };
}
