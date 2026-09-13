import { desktopRequest } from './desktopBridge.js';

export async function listProcessesByMemory(args = {}, options = {}) {
  const platform = options.platform || process.platform;
  if (!['win32', 'linux'].includes(platform)) throw Object.assign(new Error(`Process memory inspection is unavailable on ${platform}.`), { code: 'CAPABILITY_UNAVAILABLE' });
  const limit = Math.min(100, Math.max(1, Number(args.limit || 15)));
  const minMemoryMb = Math.max(0, Number(args.minMemoryMb || 0));
  const bridge = options.bridge || desktopRequest;
  const result = await bridge('processes.list', { limit, minMemoryMb });
  if (!Array.isArray(result.processes)) {
    throw Object.assign(new Error(`${platform === 'linux' ? 'Linux' : 'Windows'} returned an invalid process inventory.`), { code: 'EXECUTION_FAILED' });
  }
  return result;
}
