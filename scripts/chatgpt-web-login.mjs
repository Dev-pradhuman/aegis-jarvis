import '../server/config.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PlaywrightChatGPTTransport } from '../server/chatgptWebTransport.js';

const transport = new PlaywrightChatGPTTransport({ headless: false });
const terminal = readline.createInterface({ input, output });
try {
  await transport.openLogin();
  output.write('\nA normal Chrome/Edge window is open with JARVIS’s private profile.\nSign in normally. Do not paste your password into this terminal.\n');
  await terminal.question('After the ChatGPT composer is visible, CLOSE that browser window, then press Enter here... ');
  const health = await transport.verifyLogin();
  if (!health.authenticated) {
    output.write('Login was not detected. Keep the window open, finish authentication, and run this command again.\n');
    process.exitCode = 2;
  } else output.write('ChatGPT Web authentication verified. You may close this command and enable ChatGPT Web in JARVIS Settings.\n');
} catch (error) {
  output.write(`ChatGPT Web login failed: ${error.code || 'ERROR'} — ${error.message}\n`);
  process.exitCode = 1;
} finally {
  terminal.close();
  await transport.close();
}
