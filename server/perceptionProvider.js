import os from 'node:os';
import { getVisionSettings } from './visionState.js';

import fs from 'node:fs';

export function defaultMemoryProbe() {
  let freeBytes = os.freemem();
  if (process.platform === 'linux') {
    try {
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
      const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (match) {
        freeBytes = parseInt(match[1], 10) * 1024;
      }
    } catch {}
  }
  return {
    freeBytes,
    totalBytes: os.totalmem(),
  };
}

export class LocalOllamaMultimodalProvider {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.modelName = options.modelName || 'moondream';
    this.keepAlive = options.keepAlive || process.env.VISION_MODEL_KEEP_ALIVE || '30s';
    this.minFreeMemoryBytes = Number(options.minFreeMemoryBytes || process.env.VISION_MIN_FREE_MEMORY_BYTES || 1.5 * 1024 * 1024 * 1024);
    this.memoryProbe = options.memoryProbe || (process.env.JARVIS_TEST === '1'
      ? () => ({ freeBytes: 16 * 1024 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 * 1024 })
      : defaultMemoryProbe);
    this.status = 'unloaded'; 
  }

  checkMemoryBudget() {
    if (this.status === 'idle') return;
    const memory = this.memoryProbe();
    if (memory.freeBytes < this.minFreeMemoryBytes) {
      const freeMB = Math.round(memory.freeBytes / (1024 * 1024));
      const requiredMB = Math.round(this.minFreeMemoryBytes / (1024 * 1024));
      throw new Error(`Insufficient memory to load perception model: available ${freeMB} MB is below the required ${requiredMB} MB threshold`);
    }
  }

  async generate(prompt, imageBuffer, fetchImpl = fetch) {
    if (!fetchImpl) fetchImpl = fetch;
    this.checkMemoryBudget();

    try {
      this.status = 'loaded';
      const response = await fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: prompt,
          images: [imageBuffer.toString('base64')],
          keep_alive: this.keepAlive,
          stream: false
        })
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Model not installed');
        }
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      this.status = 'idle';
      return { reply: data.response };
    } catch (err) {
      this.status = 'unloaded';
      if (err.message === 'fetch failed' || err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        throw new Error('Local perception provider unreachable (no model installed or running)');
      }
      throw err;
    }
  }

  async unload(fetchImpl = fetch) {
    if (!fetchImpl) fetchImpl = fetch;
    try {
      await fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          keep_alive: 0
        })
      });
    } catch {}
    finally {
      this.status = 'unloaded';
    }
    return { ok: true, status: this.status };
  }
}

export class FakePerceptionProvider {
  constructor(options = {}) {
    this.minFreeMemoryBytes = Number(options.minFreeMemoryBytes || 1.5 * 1024 * 1024 * 1024);
    this.memoryProbe = options.memoryProbe || (() => ({ freeBytes: 16 * 1024 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 * 1024 }));
    this.status = 'unloaded';
  }

  checkMemoryBudget() {
    const memory = this.memoryProbe();
    if (memory.freeBytes < this.minFreeMemoryBytes) {
      const freeMB = Math.round(memory.freeBytes / (1024 * 1024));
      const requiredMB = Math.round(this.minFreeMemoryBytes / (1024 * 1024));
      throw new Error(`Insufficient memory to load perception model: available ${freeMB} MB is below the required ${requiredMB} MB threshold`);
    }
  }

  async generate(prompt, imageBuffer) {
    this.checkMemoryBudget();
    this.status = 'idle';
    return { reply: 'Fake perception response' };
  }

  async unload() {
    this.status = 'unloaded';
    return { ok: true, status: this.status };
  }
}

export class CloudPerceptionProvider {
  constructor(options = {}) {
    this.status = 'unloaded';
  }
  
  async generate(prompt, imageBuffer, fetchImpl = fetch) {
    this.status = 'loaded';
    try {
      const { executeModelPool } = await import('./modelPool.js');
      const result = await executeModelPool({
        logicalModel: 'perception',
        requiredModality: 'image',
        allowFallback: true,
        sourceTier: 'all', 
        messagesOverride: [
          { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBuffer.toString('base64')}` } }] }
        ],
        fetchImpl
      });
      return { reply: result.reply || result.message?.content || '', model: result.model || 'cloud_perception', provider: result.provider || 'cloud' };
    } finally {
      this.status = 'idle';
    }
  }
  
  async unload() {
    this.status = 'unloaded';
    return { ok: true, status: this.status };
  }
}

let defaultLocalProvider = null;

export async function perceive(prompt, imageBuffer, options = {}) {
  const { fetchImpl = fetch, testMode = false } = options;
  const settings = getVisionSettings();
  
  if (testMode) {
    const provider = new FakePerceptionProvider(options);
    return provider.generate(prompt, imageBuffer, fetchImpl);
  }

  const useCloud = settings.cloudPerceptionEnabled || process.env.DISABLE_LOCAL_MODELS === 'true';
  if (useCloud) {
    const cloudProvider = new CloudPerceptionProvider(options);
    return cloudProvider.generate(prompt, imageBuffer, fetchImpl);
  }

  let localProvider = (options.memoryProbe || options.minFreeMemoryBytes)
    ? new LocalOllamaMultimodalProvider(options)
    : (defaultLocalProvider ||= new LocalOllamaMultimodalProvider(options));

  try {
    return await localProvider.generate(prompt, imageBuffer, fetchImpl);
  } catch (err) {
    if (err.message?.includes('unreachable') || err.message?.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED' || err.message?.includes('not installed') || err.message?.includes('Insufficient memory')) {
      try {
        const cloudProvider = new CloudPerceptionProvider(options);
        return await cloudProvider.generate(prompt, imageBuffer, fetchImpl);
      } catch (fallbackErr) {
        throw err;
      }
    }
    throw err;
  }
}
