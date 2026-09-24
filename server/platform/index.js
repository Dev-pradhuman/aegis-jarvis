import { createLinuxPlatform } from './linux/index.js';
import { createWindowsPlatform } from './windows/index.js';

export function createPlatform(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return createLinuxPlatform(options);
  if (platform === 'win32') return createWindowsPlatform(options);
  throw new Error(`Unsupported desktop platform: ${platform}`);
}

export const osPlatform = createPlatform();
