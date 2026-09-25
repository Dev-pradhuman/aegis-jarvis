import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const runDefault = promisify(execFile);
const options = { timeout: 5000, maxBuffer: 1_000_000, windowsHide: true };

function pipeToXclip(text) {
  return new Promise((resolve, reject) => {
    const child = spawn('xclip', ['-selection', 'clipboard', '-in'], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    let errorText = '';
    child.stderr.on('data', (chunk) => { errorText += chunk.toString().slice(0, 200); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(errorText || `xclip exited ${code}`)); });
    child.stdin.end(text);
  });
}

export function createLinuxClipboard({ run = runDefault, writeXclip = pipeToXclip, displayServer = process.env.XDG_SESSION_TYPE || 'unknown' } = {}) {
  const command = async (program, args) => (await run(program, args, options)).stdout;
  async function read() {
    try {
      const payload = JSON.parse(await command('busctl', ['--user', '--json=short', 'call', 'org.kde.klipper', '/klipper', 'org.kde.klipper.klipper', 'getClipboardContents']));
      if (payload.type !== 's' || typeof payload.data?.[0] !== 'string') throw new Error('Unexpected Klipper response');
      return { text: payload.data[0], backend: 'kde-klipper' };
    } catch (error) {
      if (displayServer === 'wayland') return { text: await command('wl-paste', ['--no-newline']), backend: 'wl-clipboard' };
      if (displayServer === 'x11') return { text: await command('xclip', ['-selection', 'clipboard', '-out']), backend: 'xclip' };
      throw Object.assign(new Error(`Clipboard backend unavailable: ${error.message}`), { code: 'CLIPBOARD_UNAVAILABLE' });
    }
  }
  async function write(text) {
    if (typeof text !== 'string' || text.length > 1_000_000) throw Object.assign(new Error('Clipboard text must be a string under 1 MB'), { code: 'TOOL_INPUT_INVALID' });
    let backend;
    try {
      await command('busctl', ['--user', 'call', 'org.kde.klipper', '/klipper', 'org.kde.klipper.klipper', 'setClipboardContents', 's', text]);
      backend = 'kde-klipper';
    } catch (error) {
      if (displayServer === 'wayland') { await command('wl-copy', ['--', text]); backend = 'wl-clipboard'; }
      else if (displayServer === 'x11') { await writeXclip(text); backend = 'xclip'; }
      else throw Object.assign(new Error(`Clipboard backend unavailable: ${error.message}`), { code: 'CLIPBOARD_UNAVAILABLE' });
    }
    const actual = await read();
    if (actual.text !== text) throw Object.assign(new Error('Clipboard write could not be verified'), { code: 'ACTION_NOT_VERIFIED' });
    return { written: true, characters: text.length, backend };
  }
  return { read, write };
}
