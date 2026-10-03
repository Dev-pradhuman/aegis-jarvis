import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let hudProcess = null;
let isVisible = false;

export function startHUDManager(onInput, onVoice) {
  const hudPath = fileURLToPath(new URL('./hud.py', import.meta.url));
  
  hudProcess = spawn('python3', [hudPath], { stdio: ['pipe', 'pipe', 'inherit'] });
  
  const reader = createInterface({ input: hudProcess.stdout });
  reader.on('line', (line) => {
    try {
      const data = JSON.parse(line);
      if (data.event === 'text_input') {
        isVisible = false;
        if (onInput) onInput(data.text);
      } else if (data.event === 'voice_listen') {
        isVisible = false;
        if (onVoice) onVoice();
      }
    } catch(e) {}
  });
  
  hudProcess.on('exit', () => { hudProcess = null; isVisible = false; });
}

export function toggleHUD() {
  if (!hudProcess) return;
  isVisible = !isVisible;
  hudProcess.stdin.write(JSON.stringify({ action: isVisible ? 'show' : 'hide' }) + '\n');
}
