import os from 'node:os';
import path from 'node:path';

export function dataDirectory(projectRoot, env = process.env, platform = process.platform) {
  if (env.JARVIS_DATA_DIR) return path.resolve(env.JARVIS_DATA_DIR);
  if (platform === 'linux') return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'aegis-jarvis');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'A.E.G.I.S. JARVIS');
  return path.join(projectRoot, 'server', 'data');
}

export function cacheDirectory(env = process.env, platform = process.platform) {
  if (env.JARVIS_CACHE_DIR) return path.resolve(env.JARVIS_CACHE_DIR);
  if (platform === 'linux') return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'aegis-jarvis');
  return null;
}

export function configDirectory(env = process.env, platform = process.platform) {
  if (env.JARVIS_CONFIG_DIR) return path.resolve(env.JARVIS_CONFIG_DIR);
  if (platform === 'linux') return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'aegis-jarvis');
  return null;
}
