import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { ensureMcpConfig, ensureIsolatedAgyProfile, DEFAULT_CLI_HOME, DEFAULT_CLI_WORKSPACE } from './mcpBridge.js';
import { getState, updateState, activityEntry } from './store.js';
import { createRun, addRunStep, transitionRun, completeRun, failRun } from './runEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Strips ANSI escape codes from terminal text.
 */
export function stripAnsi(str = '') {
  return String(str).replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Strips code fences, raw markdown tokens, and URLs for natural TTS speech output.
 */
export function formatTextForSpeech(str = '') {
  let cleaned = stripAnsi(str);
  // Remove markdown code blocks completely
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' [code block omitted] ');
  // Remove inline code ticks
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
  // Remove bold / italics
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  // Remove markdown headers
  cleaned = cleaned.replace(/^#+\s+/gm, '');
  // Clean whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

export class CliAgentBridge {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || DEFAULT_PROJECT_ROOT;
    this.cliHome = options.cliHome || DEFAULT_CLI_HOME;
    this.cliWorkspace = options.cliWorkspace || DEFAULT_CLI_WORKSPACE;
    this.sessionId = options.sessionId || `ses_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.agyConversationId = options.agyConversationId || null;
    this.voicePipeline = options.voicePipeline || null;
    this.cliProvider = options.cliProvider || process.env.JARVIS_CLI_PROVIDER || 'agy'; // 'agy' | 'opencode'
    this.status = 'idle'; // 'idle' | 'running' | 'error'
    this.serverProcess = null;
    this.serverPort = options.serverPort || 4096;
    this.autoRestartServer = options.autoRestartServer !== false;
    this.lastToolsUsed = [];
    this.lastPrompt = null;
    this.lastReply = null;
  }

  setVoicePipeline(pipeline) {
    this.voicePipeline = pipeline;
  }

  /**
   * Initializes MCP configs and prepares background CLI session.
   */
  async init() {
    if (process.env.JARVIS_TEST === '1') return;
    try {
      await ensureMcpConfig(this.projectRoot);
      await ensureIsolatedAgyProfile({
        homeDir: this.cliHome,
        workspaceDir: this.cliWorkspace,
        projectRoot: this.projectRoot
      });
    } catch (err) {
      console.warn('[CliAgentBridge] Failed to ensure MCP configuration or isolated profile:', err.message);
    }
  }

  /**
   * Starts optional background opencode serve process.
   */
  startBackgroundServer() {
    if (this.serverProcess) return;
    try {
      this.serverProcess = spawn('opencode', ['serve', '--port', String(this.serverPort)], {
        cwd: this.projectRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.warn(`[CliAgentBridge] Background server exited (code: ${code}, signal: ${signal})`);
        this.serverProcess = null;
        if (this.autoRestartServer && process.env.JARVIS_TEST !== '1') {
          setTimeout(() => this.startBackgroundServer(), 2000);
        }
      });

      this.serverProcess.on('error', (err) => {
        console.warn('[CliAgentBridge] Server process error:', err.message);
      });
    } catch (err) {
      console.warn('[CliAgentBridge] Could not start opencode serve:', err.message);
    }
  }

  stopBackgroundServer() {
    if (this.serverProcess) {
      try {
        this.serverProcess.kill('SIGTERM');
      } catch {}
      this.serverProcess = null;
    }
  }

  /**
   * Resets session to start a clean new conversation.
   */
  resetSession() {
    this.sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.agyConversationId = null;
    return this.sessionId;
  }

  /**
   * Runs prompt via OpenCode CLI.
   */
  async executeWithOpencode(userText, options = {}, run = null, targetSessionId = null, executedTools = []) {
    return new Promise((resolve, reject) => {
      let proc;
      const args = [
        'run',
        '--session', targetSessionId || this.sessionId,
        '--format', 'json',
        '--auto',
        userText
      ];

      try {
        proc = spawn('opencode', args, {
          cwd: this.projectRoot,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (err) {
        return reject(err);
      }

      let assistantReply = '';
      let parsedSessionId = targetSessionId || this.sessionId;
      let hasErrorEvent = false;
      let errorEventMessage = '';

      const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });

      rl.on('line', (line) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          if (event.sessionID) {
            parsedSessionId = event.sessionID;
            this.sessionId = event.sessionID;
          }

          if (event.type === 'error') {
            hasErrorEvent = true;
            errorEventMessage = event.error?.message || 'OpenCode error';
          }

          if (event.type === 'tool_use' || event.type === 'tool') {
            const part = event.part || {};
            const toolName = part.tool || part.name || 'tool';
            const toolState = part.state || {};
            const toolInput = toolState.input || part.input || {};
            const toolOutput = toolState.output || part.output || '';
            const toolRecord = {
              id: part.id || `tool-${Date.now()}-${executedTools.length}`,
              tool: toolName,
              input: toolInput,
              output: toolOutput,
              status: toolState.status || 'completed'
            };
            executedTools.push(toolRecord);

            if (run) {
              const step = addRunStep(run, toolName, toolName, false);
              step.status = 'completed';
              step.completedAt = new Date().toISOString();
              step.result = { ok: true, output: toolOutput };
              run.toolCalls.push(toolRecord);
            }

            if (options.onEvent) options.onEvent({ type: 'tool_use', tool: toolRecord });
          } else if (event.type === 'text') {
            const chunk = event.part?.text || '';
            assistantReply += chunk;
            if (options.onToken) options.onToken(chunk);
          }
        } catch {
          if (!assistantReply && !line.startsWith('{')) {
            assistantReply += line + '\n';
          }
        }
      });

      let stderrOutput = '';
      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
      });

      const timer = setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch {}
        reject(new Error('OpenCode process timed out after 25s'));
      }, options.timeoutMs || 25000);

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if ((code !== 0 || hasErrorEvent) && !assistantReply) {
          const errMsg = errorEventMessage || stderrOutput.trim() || `OpenCode exited with code ${code}`;
          return reject(new Error(errMsg));
        }

        resolve({
          reply: assistantReply,
          sessionId: parsedSessionId,
          tools: executedTools
        });
      });
    });
  }

  /**
   * Runs prompt via agy CLI inside isolated ~/.jarvis-cli-profile/home.
   */
  async executeWithAgy(userText, options = {}, run = null, executedTools = []) {
    return new Promise((resolve, reject) => {
      const promptText = !this.agyConversationId
        ? `You are JARVIS. Reply in 1-2 concise sentences suitable for spoken TTS.\n\n${userText}`
        : userText;

      const args = [
        '-p', promptText,
        '--model', 'gemini-3.8-flash-low',
        '--effort', 'low',
        '--dangerously-skip-permissions',
        '--output-format', 'json'
      ];
      if (this.agyConversationId) {
        args.push('--conversation', this.agyConversationId);
      }

      let proc;
      try {
        proc = spawn('agy', args, {
          cwd: this.cliWorkspace,
          env: {
            ...process.env,
            HOME: this.cliHome,
            PATH: process.env.PATH || '',
            DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || '',
            XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '',
            DISPLAY: process.env.DISPLAY || '',
            WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || ''
          },
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (err) {
        return reject(err);
      }

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
        if (options.onToken) options.onToken(d.toString());
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      const timer = setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch {}
        reject(new Error('agy process timed out after 45s'));
      }, options.timeoutMs || 45000);

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          return reject(new Error(stderr.trim() || `agy exited with code ${code}`));
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.conversation_id) {
            this.agyConversationId = parsed.conversation_id;
          }
          const reply = parsed.response || stdout.trim();
          resolve({
            reply,
            sessionId: parsed.conversation_id || this.sessionId,
            tools: executedTools
          });
        } catch {
          resolve({
            reply: stdout.trim(),
            sessionId: this.sessionId,
            tools: executedTools
          });
        }
      });
    });
  }

  /**
   * Sends a user prompt into the persistent CLI agent session and processes structured output.
   */
  async prompt(userText, options = {}) {
    if (process.env.JARVIS_TEST === '1') {
      const mockReply = `Mock reply for: ${userText}`;
      if (options.onToken) {
        options.onToken('Mock reply for: ');
        options.onToken(userText);
      }
      return {
        reply: mockReply,
        spokenText: mockReply,
        audioBase64: null,
        sessionId: options.sessionId || this.sessionId,
        tools: [],
        provider: this.cliProvider,
        runId: `run-test-${Date.now()}`
      };
    }

    await this.init();

    this.status = 'running';
    this.lastPrompt = userText;
    const targetSessionId = options.sessionId || this.sessionId;
    const speak = options.speak !== false;
    const source = options.source || 'text';

    // 1. Create or bind JARVIS Run record for tracking
    const state = await getState();
    let run = null;
    try {
      run = createRun({
        type: 'agentic',
        request: userText,
        origin: source === 'voice' ? 'voice' : 'chat'
      });
      run.model = `${this.cliProvider}-cli`;
      run.provider = 'cli_agent';
      transitionRun(run, 'running');
      await updateState((draft) => {
        draft.runs ??= [];
        draft.runs.unshift(run);
        draft.runs = draft.runs.slice(0, 500);
        return draft;
      });
    } catch {}

    const executedTools = [];
    let executionResult = null;
    let providerUsed = this.cliProvider;

    try {
      if (this.cliProvider === 'opencode') {
        try {
          executionResult = await this.executeWithOpencode(userText, options, run, targetSessionId, executedTools);
        } catch (opencodeErr) {
          console.warn('[CliAgentBridge] OpenCode failed or quota reached:', opencodeErr.message, '- Falling back to agy CLI');
          providerUsed = 'agy';
          executionResult = await this.executeWithAgy(userText, options, run, executedTools);
        }
      } else {
        executionResult = await this.executeWithAgy(userText, options, run, executedTools);
      }
    } catch (err) {
      this.status = 'error';
      if (run) failRun(run, err.message);
      throw err;
    }

    this.status = 'idle';
    const cleanReply = stripAnsi(executionResult.reply).trim() || 'Command completed successfully.';
    const spokenText = formatTextForSpeech(cleanReply);
    this.lastReply = cleanReply;
    this.lastToolsUsed = executedTools;

    if (run) {
      run.reply = cleanReply;
      run.model = `${providerUsed}-cli`;
      completeRun(run);
      await updateState((draft) => {
        const stored = draft.runs?.find((r) => r.id === run.id);
        if (stored) Object.assign(stored, run);
        return draft;
      });
    }

    // Add to conversation history
    try {
      await updateState((draft) => {
        draft.conversations ??= [];
        if (source !== 'voice') {
          draft.conversations.push({
            who: 'YOU',
            time: new Date().toISOString(),
            lines: [userText],
            source: 'chat'
          });
        }
        draft.conversations.push({
          who: 'JARVIS',
          time: new Date().toISOString(),
          lines: [cleanReply],
          source: source === 'voice' ? 'voice' : 'chat',
          modelIndicator: { handledBy: `${providerUsed}-cli` }
        });
        draft.conversations = draft.conversations.slice(-100);
        return draft;
      });
    } catch {}

    // Handle speech output if requested or from voice
    let audioBase64 = null;
    if (speak && spokenText && this.voicePipeline) {
      try {
        const speakResult = await this.voicePipeline.speak(spokenText);
        audioBase64 = speakResult?.audioBase64 || null;
      } catch (speakErr) {
        console.warn('[CliAgentBridge] Failed to speak output:', speakErr.message);
      }
    }

    return {
      reply: cleanReply,
      spokenText,
      audioBase64,
      sessionId: executionResult.sessionId || targetSessionId,
      tools: executedTools,
      provider: providerUsed,
      runId: run?.id || null
    };
  }

  getStatus() {
    return {
      provider: this.cliProvider,
      sessionId: this.sessionId,
      conversationId: this.agyConversationId,
      cliHome: this.cliHome,
      cliWorkspace: this.cliWorkspace,
      status: this.status,
      serverActive: Boolean(this.serverProcess),
      lastPrompt: this.lastPrompt,
      lastToolsUsed: this.lastToolsUsed
    };
  }
}

export const cliAgentBridge = new CliAgentBridge();
