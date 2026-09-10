import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRuntimeError } from './toolErrors.js';
import { cacheDirectory } from './platform/paths.js';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const asarSegment = `${path.sep}app.asar`;
const runtimeRoot = projectRoot.endsWith(asarSegment) ? `${projectRoot}.unpacked` : projectRoot;
const workerPath = path.join(runtimeRoot, 'server', 'needle_worker.py');
const bundledPython = path.join(projectRoot, '.venv-needle', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
const safeName = (id) => id.replaceAll('.', '__');
function needleError(code, message, options = {}) { return new ToolRuntimeError(code, message, { retryable: true, ...options }); }
function schemas(tools) { return tools.map((tool) => ({ name: safeName(tool.id), description: `${tool.description} Canonical JARVIS tool: ${tool.id}.`, parameters: tool.inputSchema })); }

export class NeedleProvider {
  constructor(options = {}) { this.options = options; this.child = null; this.buffer = ''; this.pending = new Map(); this.sequence = 0; this.status = 'STOPPED'; this.lastError = null; this.startedAt = null; this.queue = Promise.resolve(); this.residentSchemas = null; }
  async pythonPath() { if (this.options.pythonPath || process.env.JARVIS_NEEDLE_PYTHON) return path.resolve(projectRoot, this.options.pythonPath || process.env.JARVIS_NEEDLE_PYTHON); try { await access(bundledPython); return bundledPython; } catch { return 'python'; } }
  async start() {
    if (this.child && this.child.exitCode === null) return this.healthCheck();
    this.status = 'STARTING'; const python = await this.pythonPath();
    const child = (this.options.spawn || spawn)(python, ['-u', workerPath], { cwd: projectRoot, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NEEDLE_TELEMETRY: process.env.NEEDLE_TELEMETRY || '0', JARVIS_NEEDLE_CACHE_DIR: process.env.JARVIS_NEEDLE_CACHE_DIR || path.join(cacheDirectory() || path.join(projectRoot, 'server', 'data'), 'needle') } });
    this.child = child; this.startedAt = new Date().toISOString(); child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => this.onData(chunk)); child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { if (process.env.JARVIS_ROUTER_DEBUG === 'true') console.warn(`[JARVIS NEEDLE] ${String(chunk).trim().slice(0, 500)}`); }); child.once('exit', (code) => this.onExit(code)); child.once('error', (error) => this.onExit(null, error));
    try { const health = await this.request('health', {}, 15_000, false); this.status = health.ok ? 'READY' : 'FAILED'; this.lastError = health.error || null; if (!health.ok) throw new Error(health.error); return this.healthCheck(); } catch (error) { await this.close(); throw needleError('NEEDLE_UNAVAILABLE', `Needle 2 could not start: ${error.message}`, { cause: error }); }
  }
  onData(chunk) { this.buffer += chunk; for (;;) { const newline = this.buffer.indexOf('\n'); if (newline < 0) break; const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1); if (!line.trim()) continue; let value; try { value = JSON.parse(line); } catch { continue; } const pending = this.pending.get(value.id); if (!pending) continue; this.pending.delete(value.id); clearTimeout(pending.timer); value.ok ? pending.resolve(value) : pending.reject(needleError('NEEDLE_INFERENCE_FAILED', value.error || 'Needle inference failed.')); } }
  onExit(code, error = null) { this.child = null; this.status = 'FAILED'; this.lastError = error?.message || `Needle worker exited with code ${code}`; for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(needleError('NEEDLE_UNAVAILABLE', this.lastError)); } this.pending.clear(); }
  async request(operation, payload = {}, timeoutMs = 10_000, ensureStarted = true) { if (ensureStarted && (!this.child || this.child.exitCode !== null)) await this.start(); if (!this.child?.stdin?.writable) throw needleError('NEEDLE_UNAVAILABLE', 'Needle worker is not writable.'); const id = `needle-${Date.now()}-${++this.sequence}`; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(needleError('NEEDLE_TIMEOUT', `Needle inference exceeded ${timeoutMs} ms.`)); }, timeoutMs); this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(`${JSON.stringify({ id, operation, ...payload })}\n`, (error) => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(needleError('NEEDLE_UNAVAILABLE', error.message)); } }); }); }
  async initialize(tools = []) { await this.start(); if (!tools.length) return this.healthCheck(); this.status = 'LOADING'; const declared = schemas(tools); try { const result = await this.request('initialize', { tools: declared }, Math.max(30_000, Number(process.env.JARVIS_NEEDLE_LOAD_TIMEOUT_MS || 120_000))); this.residentSchemas = declared; this.status = 'READY'; this.lastError = null; return result; } catch (error) { this.status = 'DEGRADED'; this.lastError = error.message; throw error; } }
  async classifyOrCall({ request, tools }) { const started = performance.now(); let release; const previous = this.queue; this.queue = new Promise((resolve) => { release = resolve; }); await previous; try { this.status = 'BUSY'; const response = await this.request('classify', { request, tools: this.residentSchemas || schemas(tools), maxNewTokens: Number(process.env.JARVIS_NEEDLE_MAX_TOKENS || 256) }, Number(process.env.JARVIS_NEEDLE_TIMEOUT_MS || 8_000)); const result = response.result || {}; this.status = 'READY'; this.lastError = null; return { ...result, latencyMs: Math.round((performance.now() - started) * 100) / 100 }; } catch (error) { this.status = 'DEGRADED'; this.lastError = error.message; throw error; } finally { release(); } }
  healthCheck() { return { status: this.status, process: this.child && this.child.exitCode === null ? 'RUNNING' : 'STOPPED', model: 'Cactus-Compute/needle2', runtime: 'cactus-needle', startedAt: this.startedAt, lastError: this.lastError }; }
  async close() { const child = this.child; this.child = null; if (child && child.exitCode === null) child.kill(); this.status = 'STOPPED'; }
}

let shared;
export function needleProvider() { shared ||= new NeedleProvider(); return shared; }
export async function closeNeedleProvider() { if (shared) await shared.close(); shared = null; }
