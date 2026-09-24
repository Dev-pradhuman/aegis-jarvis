import { createWindowsApps } from './apps.js';

export function createWindowsPlatform(options = {}) {
  return { os: 'win32', displayServer: 'win32', desktopEnvironment: 'Windows Shell', apps: createWindowsApps(options) };
}
