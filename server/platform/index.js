import { displayEnvironment, platformError } from './common.js';
import { linuxDesktopCapabilities, linuxDesktopRequest } from './linuxDesktop.js';

export function platformInfo(platform = process.platform, env = process.env) {
  if (platform === 'linux') return linuxDesktopCapabilities(env);
  if (platform === 'win32') return { platform: 'win32', displayServer: 'windows', windows: true, globalInput: true, clipboard: true, screenshots: true, semanticUi: true, waylandRestricted: false };
  return { platform, displayServer: displayEnvironment(env), windows: false, globalInput: false, clipboard: false, screenshots: false, semanticUi: false, waylandRestricted: false };
}

export async function platformDesktopRequest(operation, args = {}, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return linuxDesktopRequest(operation, args, { ...options, platform });
  throw platformError('CAPABILITY_UNAVAILABLE', `No desktop adapter is available for ${platform}.`);
}
