import { FirefoxEngine, LightpandaEngine, ObscuraEngine, CamoufoxEngine, isObscuraAvailable } from './engines.js';

export class BrowserError extends Error {
  constructor(code, message, cause) { super(message, { cause }); this.name = 'BrowserError'; this.code = code; }
}

export const STATEFUL_WEB_DOMAINS = [
  'web.whatsapp.com',
  'instagram.com',
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'mail.google.com',
  'x.com',
  'discord.com',
  'youtube.com',
];

export function isStatefulDomain(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return STATEFUL_WEB_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

const VISUAL_ACTIONS = new Set(['screenshot']);
const VALID_ACTIONS = new Set(['navigate', 'click', 'type', 'press', 'evaluate', 'read', 'content', 'accessibility', 'screenshot', 'waitFor', 'snapshot']);

function classify(error) {
  if (error instanceof BrowserError) return error.code;
  const message = String(error?.message || error);
  if (/timeout|timed out|ECONNRESET|ECONNREFUSED|Target closed|disconnected|socket hang up/i.test(message)) return 'TRANSIENT';
  if (/selector|no node|not found|waiting for/i.test(message)) return 'TARGET_NOT_FOUND';
  return 'LIGHTPANDA_UNSUPPORTED';
}

export class BrowserManager {
  constructor(options = {}) {
    this.createLightpanda = options.createLightpanda || (() => new LightpandaEngine(options));
    this.createFirefox = options.createCamoufox || options.createFirefox || options.createPatchright || (() => new FirefoxEngine(options));
    this.createCamoufox = this.createFirefox;
    this.createObscura = options.createObscura || (() => new ObscuraEngine(options));
    this.maxRetries = Math.max(0, Math.min(3, Number(options.maxRetries ?? process.env.BROWSER_MAX_RETRIES ?? 1)));
    this.idleTimeoutMs = Math.max(100, Number(options.idleTimeoutMs ?? process.env.BROWSER_IDLE_TIMEOUT_MS ?? 120000));
    this.logger = options.logger || console;
    this.engine = null;
    this.state = 'IDLE';
    this.history = [];
    this.pending = null;
    this.pendingContinuation = null;
    this.authenticatedDomains = new Set();
    this.lastError = null;
    this.currentUrl = null;
    this.lastEngine = null;
    this.lastFields = [];
    this.lastActionAt = 0;
    this.busy = false;
    this.idleTimer = null;
    this.queue = Promise.resolve();
    this.refMap = {};
  }

  resolveSelector(selector) {
    if (typeof selector !== 'string') return selector;
    const trimmed = selector.trim();
    if (trimmed.startsWith('@')) {
      const ref = trimmed.slice(1);
      return `[data-jarvis-ref="${ref}"]`;
    }
    if (/^e\d+$/i.test(trimmed)) {
      return `[data-jarvis-ref="${trimmed}"]`;
    }
    return selector;
  }

  getStatus() {
    return {
      state: this.state,
      engine: this.engine?.kind || null,
      url: this.engine?.url?.() || this.currentUrl,
      headed: Boolean(this.engine?.headed),
      active: !['IDLE', 'ERROR', 'HUMAN_ACTION_REQUIRED'].includes(this.state) && (this.busy || Date.now() - this.lastActionAt < 8000),
      history: this.history.slice(-8),
      humanActionRequired: this.state === 'HUMAN_ACTION_REQUIRED',
      pending: this.pending,
      pendingContinuation: this.pendingContinuation,
      authenticatedDomains: Array.from(this.authenticatedDomains),
      lastError: this.lastError
    };
  }

  isDomainAuthenticated(url) {
    try {
      return this.authenticatedDomains.has(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  log(message) { this.logger.info?.(`[browser] ${message}`); }
  record(reason, from, to) { this.history.push({ at: new Date().toISOString(), reason, from, to }); this.history = this.history.slice(-16); }
  serial(task) { const next = this.queue.then(task, task); this.queue = next.catch(() => {}); return next; }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    if ((this.engine?.kind !== 'firefox' && this.engine?.kind !== 'camoufox') || this.state === 'HUMAN_ACTION_REQUIRED') return;
    this.idleTimer = setTimeout(() => { this.serial(async () => {
      if ((this.engine?.kind === 'firefox' || this.engine?.kind === 'camoufox') && this.state !== 'HUMAN_ACTION_REQUIRED') {
        this.currentUrl = this.engine.url() || this.currentUrl;
        this.lastFields = await this.engine.formState?.().catch(() => []) || [];
        this.lastEngine = 'firefox';
        await this.engine.close(); this.engine = null; this.state = 'IDLE'; this.log('Firefox idle → shutdown');
      }
    }); }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  async start(kind, headed = false) {
    this.state = (kind === 'firefox' || kind === 'camoufox') ? 'FIREFOX_STARTING' : (kind === 'obscura' ? 'OBSCURA_ACTIVE' : 'LIGHTPANDA_ACTIVE');
    const engine = (kind === 'firefox' || kind === 'camoufox')
      ? this.createFirefox()
      : (kind === 'obscura' ? this.createObscura() : this.createLightpanda());
    try {
      await engine.start({ headed });
      this.engine = engine;
      this.state = (kind === 'firefox' || kind === 'camoufox') ? 'FIREFOX_ACTIVE' : (kind === 'obscura' ? 'OBSCURA_ACTIVE' : 'LIGHTPANDA_ACTIVE');
      this.log(`${kind} started`);
      return engine;
    } catch (error) {
      await engine.close().catch(() => {});
      this.state = 'ERROR';
      this.lastError = error.message;
      throw new BrowserError((kind === 'firefox' || kind === 'camoufox') ? 'FIREFOX_START_FAILED' : 'BROWSER_UNAVAILABLE', `${kind} could not start: ${error.message}`, error);
    }
  }

  async ensure(kind) {
    if (this.engine?.kind === kind && this.engine.isHealthy()) return this.engine;
    if (this.engine) { this.currentUrl = this.engine.url() || this.currentUrl; await this.engine.close(); this.engine = null; }
    return this.start(kind);
  }

  async fallback(reason) {
    const from = this.engine?.kind || 'lightpanda';
    const url = this.engine?.url?.() || this.currentUrl;
    const fields = await this.engine?.formState?.().catch(() => []) || [];
    this.record(reason, from, 'firefox'); this.log(`${reason} → Firefox`);
    let engine;
    try { engine = await this.ensure('firefox'); if (url && /^https?:\/\//i.test(url)) { await engine.navigate(url); await engine.applyFormState?.(fields); } }
    catch (error) { this.state = 'ERROR'; throw error instanceof BrowserError ? error : new BrowserError('FIREFOX_START_FAILED', error.message, error); }
    return engine;
  }

  async recover() {
    const kind = this.engine?.kind || 'lightpanda';
    const url = this.engine?.url?.() || this.currentUrl;
    this.state = 'RECOVERING'; this.record('crash recovery', kind, kind);
    if (this.engine) { await this.engine.close().catch(() => {}); this.engine = null; }
    let engine;
    try { engine = await this.start(kind); }
    catch (error) { if (kind !== 'lightpanda') throw error; return this.fallback('Lightpanda crash'); }
    if (url && /^https?:\/\//i.test(url)) await engine.navigate(url);
    return engine;
  }

  async checkChallenge(action, args, continuation = null) {
    let challenge = await this.engine.challenge?.();
    if (!challenge) return null;
    if (this.engine.kind !== 'firefox' && this.engine.kind !== 'camoufox') {
      await this.fallback('human verification');
      challenge = await this.engine.challenge?.() || challenge;
    }
    let handoffError = null;
    if (!this.engine.headed) {
      try {
        await this.engine.relaunchHeaded();
        await this.engine.bringToFront();
      } catch (error) {
        handoffError = `Could not open headed browser: ${error.message}`;
      }
    } else {
      await this.engine.bringToFront().catch(() => {});
    }
    this.state = 'HUMAN_ACTION_REQUIRED';
    this.pendingContinuation = continuation || this.pendingContinuation || {
      toolId: `browser.${action}`,
      action,
      args,
      url: this.engine.url() || this.currentUrl,
      reason: challenge.type || challenge.title || 'CHALLENGE_DETECTED',
    };
    this.pending = {
      action,
      url: this.engine.url() || this.currentUrl,
      challenge,
      headed: Boolean(this.engine.headed),
      handoffError,
      continuation: this.pendingContinuation,
    };
    clearTimeout(this.idleTimer);
    this.log('human verification required');
    return {
      code: 'HUMAN_ACTION_REQUIRED',
      humanActionRequired: true,
      ...this.pending,
      pendingContinuation: this.pendingContinuation,
      status: this.getStatus()
    };
  }

  async perform(action, args = {}) {
    if (!VALID_ACTIONS.has(action)) throw new BrowserError('BROWSER_UNAVAILABLE', `Unsupported browser action: ${action}`);
    if (this.state === 'HUMAN_ACTION_REQUIRED') throw new BrowserError('HUMAN_ACTION_REQUIRED', 'Complete the verification in Firefox, then resume.');
    if (args.selector && typeof args.selector === 'string') {
      args = { ...args, selector: this.resolveSelector(args.selector) };
    }
    if (['click', 'type', 'waitFor'].includes(action) && (typeof args.selector !== 'string' || !args.selector.trim() || args.selector.length > 500)) throw new BrowserError('TARGET_NOT_FOUND', 'A CSS selector of 1 to 500 characters is required.');
    if (action === 'press' && (typeof args.key !== 'string' || !args.key.trim() || args.key.length > 40)) throw new BrowserError('BROWSER_ACTION_FAILED', 'A valid key name of 1 to 40 characters is required.');
    if (action === 'type' && String(args.text ?? '').length > 10000) throw new BrowserError('BROWSER_ACTION_FAILED', 'Browser text exceeds the 10,000 character limit.');
    if (action === 'evaluate' && (typeof args.code !== 'string' || !args.code.trim() || args.code.length > 20000)) throw new BrowserError('BROWSER_ACTION_FAILED', 'JavaScript source must contain 1 to 20,000 characters.');
    if (action === 'navigate') {
      let url;
      try { url = new URL(args.url); } catch { throw new BrowserError('NAVIGATION_FAILED', 'A valid HTTP or HTTPS URL is required.'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new BrowserError('NAVIGATION_FAILED', 'Only HTTP and HTTPS URLs are allowed.');
      args = { ...args, url: url.href }; this.currentUrl = url.href;
    }
    const visual = VISUAL_ACTIONS.has(action) || args.mode === 'visual';
    const isAuthDomain = this.isDomainAuthenticated(args.url || this.currentUrl);
    const isStateful = isStatefulDomain(args.url || this.currentUrl);

    if ((visual || isAuthDomain || isStateful) && (this.engine?.kind !== 'firefox' && this.engine?.kind !== 'camoufox')) {
      await this.fallback(isStateful ? 'stateful domain' : (isAuthDomain ? 'authenticated domain' : 'visual capability required'));
    } else if (!this.engine) {
      let preferred = 'lightpanda';
      if (visual || isAuthDomain || isStateful) {
        preferred = 'firefox';
      } else if (this.lastEngine && this.currentUrl) {
        preferred = this.lastEngine;
      } else if (isObscuraAvailable()) {
        preferred = 'obscura';
      } else if (process.platform === 'win32' || process.env.BROWSER_PRIMARY === 'firefox' || process.env.BROWSER_PRIMARY === 'camoufox') {
        preferred = 'firefox';
      }
      try { await this.start(preferred); }
      catch (error) {
        if (preferred !== 'lightpanda' && preferred !== 'obscura') throw error;
        this.record(`${preferred} unavailable`, preferred, 'firefox');
        await this.start('firefox');
      }
      if (action !== 'navigate' && this.currentUrl) { await this.engine.navigate(this.currentUrl); await this.engine.applyFormState?.(this.lastFields); }
    }
    if (!this.engine.isHealthy()) await this.recover();
    const invoke = () => {
      if (action === 'navigate') return this.engine.navigate(args.url);
      if (action === 'click') return this.engine.click(args.selector);
      if (action === 'type') return this.engine.type(args.selector, String(args.text ?? ''));
      if (action === 'press') return this.engine.press(args.key, args.selector);
      if (action === 'evaluate') return this.engine.evaluate(args.code);
      if (action === 'waitFor') return this.engine.waitFor(args.selector, args.timeout);
      if (action === 'snapshot') return this.engine.snapshot();
      return this.engine[action]();
    };
    let result;
    for (let attempt = 0; ; attempt++) {
      try { result = await invoke(); break; }
      catch (error) {
        const category = classify(error);
        if (this.engine.kind === 'lightpanda' && category === 'TRANSIENT' && attempt < this.maxRetries) { this.log(`Lightpanda transient failure → retry ${attempt + 1}`); if (!this.engine.isHealthy()) await this.recover(); continue; }
        if (this.engine.kind === 'lightpanda' && ['LIGHTPANDA_UNSUPPORTED', 'TARGET_NOT_FOUND', 'TRANSIENT'].includes(category)) { this.state = 'LIGHTPANDA_FAILED'; await this.fallback(category.toLowerCase()); try { result = await invoke(); break; } catch (fallbackError) { this.state = 'ERROR'; this.lastError = fallbackError.message; throw new BrowserError('BROWSER_ACTION_FAILED', fallbackError.message, fallbackError); } }
        this.state = 'ERROR'; this.lastError = error.message; throw new BrowserError(category === 'TRANSIENT' ? 'BROWSER_CRASHED' : category, error.message, error);
      }
    }
    this.currentUrl = this.engine.url() || this.currentUrl;
    if (result?.refs) {
      this.refMap = { ...this.refMap, ...result.refs };
    } else if (result?.refMap) {
      this.refMap = { ...this.refMap, ...result.refMap };
    }
    const handoff = await this.checkChallenge(action, args);
    if (handoff) return handoff;
    this.state = (this.engine.kind === 'firefox' || this.engine.kind === 'camoufox') ? 'FIREFOX_ACTIVE' : (this.engine.kind === 'obscura' ? 'OBSCURA_ACTIVE' : 'LIGHTPANDA_ACTIVE');
    this.lastError = null; this.scheduleIdle(); this.log(`${this.engine.kind} ${action} success`);
    return { result, status: this.getStatus() };
  }

  execute(action, args) { return this.serial(async () => { this.busy = true; try { return await this.perform(action, args); } finally { this.busy = false; this.lastActionAt = Date.now(); } }); }
  navigate(url, options = {}) { return this.execute('navigate', { url, ...options }); }
  click(selector, options = {}) { return this.execute('click', { selector, ...options }); }
  type(selector, text, options = {}) { return this.execute('type', { selector, text, ...options }); }
  press(key, selector, options = {}) { return this.execute('press', { key, selector, ...options }); }
  snapshot() { return this.execute('snapshot'); }
  read() { return this.execute('read'); }
  getPageContent() { return this.execute('content'); }
  getAccessibilityTree() { return this.execute('accessibility'); }
  screenshot() { return this.execute('screenshot'); }
  waitFor(selector, timeout) { return this.execute('waitFor', { selector, timeout }); }
  evaluate(code) { return this.execute('evaluate', { code }); }

  openHeaded(url) { return this.serial(async () => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new BrowserError('NAVIGATION_FAILED', 'Only HTTP and HTTPS URLs are allowed.');
    const engine = this.engine ? await this.ensure('firefox') : await this.start('firefox', true);
    if (!engine.headed) await engine.relaunchHeaded();
    await engine.navigate(parsed.href);
    await engine.bringToFront();
    this.currentUrl = engine.url();
    this.state = 'FIREFOX_ACTIVE';
    clearTimeout(this.idleTimer); // Keep the headed window open for interactive sign-in.
    return { status: this.getStatus() };
  }); }

  handoff(targetUrl = null, options = {}) { return this.serial(async () => {
    const urls = Array.isArray(options.urls) ? options.urls : (options.urls ? [options.urls] : []);
    const primaryUrl = targetUrl || urls[0] || this.pending?.url || this.currentUrl;
    if (!this.engine || !this.engine.isHealthy()) {
      if (this.engine) await this.engine.close().catch(() => {});
      this.engine = null;
      await this.start('firefox', true);
    } else if (!this.engine.headed) {
      await this.engine.relaunchHeaded();
    }
    if (primaryUrl && /^https?:\/\//i.test(primaryUrl)) {
      await this.engine.navigate(primaryUrl);
    }
    const additionalUrls = urls.filter((u) => u && u !== primaryUrl);
    if (additionalUrls.length && this.engine?.context) {
      for (const u of additionalUrls) {
        try {
          const tab = await this.engine.context.newPage();
          await tab.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        } catch {}
      }
    }
    await this.engine.bringToFront();
    if (this.state === 'HUMAN_ACTION_REQUIRED') {
      if (this.pending) {
        this.pending.headed = true;
        this.pending.handoffError = null;
        this.pending.urls = [primaryUrl, ...additionalUrls].filter(Boolean);
      }
    } else {
      this.state = 'HUMAN_ACTION_REQUIRED';
      this.pending = {
        action: 'handoff',
        url: this.engine.url() || primaryUrl,
        urls: [primaryUrl, ...additionalUrls].filter(Boolean),
        challenge: { type: 'LOGIN_SIGNIN', title: 'Interactive User Sign-in' },
        headed: true,
        handoffError: null
      };
    }
    clearTimeout(this.idleTimer);
    return { status: this.getStatus() };
  }); }

  resume() { return this.serial(async () => {
    if (this.state !== 'HUMAN_ACTION_REQUIRED') throw new BrowserError('HUMAN_ACTION_REQUIRED', 'No human verification is pending.');
    if (await this.engine.challenge()) return { code: 'HUMAN_ACTION_REQUIRED', humanActionRequired: true, status: this.getStatus() };
    const resumed = this.pending;
    const continuation = this.pendingContinuation;
    this.pending = null;
    this.pendingContinuation = null;

    // Pin authenticated domain(s)
    const currentUrl = this.engine.url() || this.currentUrl;
    if (currentUrl) {
      try {
        const domain = new URL(currentUrl).hostname;
        if (domain) {
          this.authenticatedDomains.add(domain);
          this.engine.authenticatedDomains?.add?.(domain);
        }
      } catch {}
    }
    if (this.engine?.context?.pages) {
      try {
        for (const p of this.engine.context.pages()) {
          const u = p.url();
          if (u && /^https?:\/\//i.test(u)) {
            const d = new URL(u).hostname;
            if (d) {
              this.authenticatedDomains.add(d);
              this.engine.authenticatedDomains?.add?.(d);
            }
          }
        }
      } catch {}
    }

    // Switch back to headless if currently headed
    if (this.engine.headed && typeof this.engine.relaunchHeadless === 'function') {
      try {
        await this.engine.relaunchHeadless();
      } catch (err) {
        this.log(`relaunchHeadless failed: ${err.message}`);
      }
    }

    this.state = 'FIREFOX_ACTIVE';
    this.scheduleIdle();
    this.log('resumed after human handoff');

    // Auto-continue pending action if present
    let continuationResult = null;
    if (continuation && continuation.action && continuation.action !== 'resume') {
      try {
        this.log(`auto-continuing pending action: ${continuation.action}`);
        continuationResult = await this.perform(continuation.action, continuation.args || {});
      } catch (err) {
        this.log(`continuation failed: ${err.message}`);
        continuationResult = { error: err.message };
      }
    }

    return { resumed, continuation, continuationResult, status: this.getStatus() };
  }); }

  close() { return this.serial(async () => {
    clearTimeout(this.idleTimer);
    await this.engine?.close().catch(() => {});
    this.engine = null;
    this.pending = null;
    this.pendingContinuation = null;
    this.currentUrl = null;
    this.lastEngine = null;
    this.lastFields = [];
    this.lastActionAt = 0;
    this.state = 'IDLE';
    return { status: this.getStatus() };
  }); }
}
