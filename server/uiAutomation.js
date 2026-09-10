import { desktopRequest } from './desktopBridge.js';

export async function uiAutomation(action, args, options = {}) {
  const bridge=options.bridge||desktopRequest;
  const operation=action==='click'?'invoke':action==='type'?'set_value':action;
  return bridge(`ui.${operation}`,args);
}
