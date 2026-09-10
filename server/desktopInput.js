import { desktopRequest } from './desktopBridge.js';
const keys = { ctrl:17, control:17, alt:18, shift:16, win:91, windows:91, enter:13, return:13, tab:9, esc:27, escape:27, space:32, backspace:8, delete:46, insert:45, home:36, end:35, pageup:33, pagedown:34, left:37, up:38, right:39, down:40 };
export function keyCodes(chord) {
  const names = String(chord).toLowerCase().split('+').map((part) => part.trim());
  if (!names.length || names.length > 5 || new Set(names).size !== names.length) throw Object.assign(new Error('Use one valid key combination.'), { code: 'INVALID_ARGUMENTS' });
  return names.map((name) => {
    if (keys[name]) return keys[name];
    if (/^[a-z0-9]$/.test(name)) return name.toUpperCase().charCodeAt(0);
    if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(name)) return 111 + Number(name.slice(1));
    throw Object.assign(new Error(`Unsupported key: ${name}. Lock keys are intentionally not synthesized.`), { code: 'INVALID_ARGUMENTS' });
  });
}
export async function desktopInput(tool, args, options = {}) {
  if(['mouse.click','mouse.double_click','mouse.right_click','mouse.scroll','mouse.drag'].includes(tool)) return (options.bridge||desktopRequest)('mouse.action',{...args,action:tool.split('.')[1]});
  const payload = tool === 'computer.keypress' ? { ...args, codes: keyCodes(args.keys) } : args;
  return (options.bridge || desktopRequest)(tool, payload);
}
