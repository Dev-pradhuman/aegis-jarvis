import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRuntimeError } from './toolErrors.js';
import { HeadlessModelTransport, drainDomStream, emitTextDelta, installDomStream, stopDomStream } from './headlessModelTransport.js';
import { findBrowserExecutable } from './platform/browserExecutable.js';
import { dataDirectory } from './platform/paths.js';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultProfile = path.join(dataDirectory(projectRoot), 'chatgpt-browser-profile');
export const DEFAULT_JARVIS_CHATGPT_URL = 'https://chatgpt.com/g/g-p-6a9ed38ea1c8819182eb991a96e4fc1c-jarvis-chat/c/6aa171a5-72fc-83e8-ac5f-1a3b70424a6a';

export const CHATGPT_SELECTORS = Object.freeze({
  composer: ['[data-testid="prompt-textarea"]', '#prompt-textarea', 'textarea[placeholder*="Message"]', '[contenteditable="true"][role="textbox"]'],
  assistant: ['[data-message-author-role="assistant"]', 'article[data-turn="assistant"]', 'article:has([data-message-author-role="assistant"])'],
  submit: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'],
  stop: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop"]'],
  sidebarToggle: ['button[aria-label*="sidebar" i]', 'button[data-testid="open-sidebar-button"]'],
});

function webError(code, message, options = {}) { return new ToolRuntimeError(code, message, options); }

async function firstVisible(page, selectors, timeout = 1000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    try { await locator.waitFor({ state: 'visible', timeout }); return locator; } catch {}
  }
  return null;
}

export function projectNamePattern(projectName = 'jarvis-chat') { return new RegExp(`^${String(projectName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'); }

export function matchesConfiguredProjectUrl(currentUrl, configuredUrl, projectName = 'jarvis-chat') {
  try {
    const current = new URL(currentUrl); const configured = new URL(configuredUrl);
    if (current.protocol !== 'https:' || current.hostname !== 'chatgpt.com' || configured.protocol !== 'https:' || configured.hostname !== 'chatgpt.com') return false;
    const projectRoot = configured.pathname.replace(/\/(?:project|c\/[^/]+)\/?$/, '').replace(/\/$/, '');
    const slug = String(projectName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return /^\/g\/g-p-[a-z0-9-]+$/i.test(projectRoot) && projectRoot.toLowerCase().endsWith(`-${slug}`) && (current.pathname === configured.pathname || current.pathname === `${projectRoot}/project` || current.pathname.startsWith(`${projectRoot}/`));
  } catch { return false; }
}

export function classifyChatGPTPage(body = '') {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (/log in|sign up|welcome back/i.test(text)) return { code: 'CHATGPT_LOGIN_REQUIRED', message: 'ChatGPT login is required.' };
  if (/too many requests|rate limit|you(?:'|’)ve reached.*limit|try again later/i.test(text)) return { code: 'CHATGPT_RATE_LIMITED', message: 'ChatGPT Web is currently rate limited.' };
  if (/verify you are human|checking your browser|cloudflare/i.test(text)) return { code: 'CHATGPT_WEB_UNAVAILABLE', message: 'ChatGPT requires an interactive browser verification.' };
  if (/^(?:try again|reload)$/i.test(text) || /something went wrong|unable to load|failed to load/i.test(text)) return { code: 'CHATGPT_WEB_UNAVAILABLE', message: 'ChatGPT returned a temporary load-error page.' };
  return null;
}

async function recoverTransientPage(page) {
  let body = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  let signal = classifyChatGPTPage(body);
  if (signal?.code !== 'CHATGPT_WEB_UNAVAILABLE' || !/load-error/i.test(signal.message)) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 0) {
      const retry = page.getByRole('button', { name: /try again|reload/i }).first();
      if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
      else await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    } else await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    const composer = await firstVisible(page, CHATGPT_SELECTORS.composer, 2500);
    if (composer) return composer;
    body = await page.locator('body').innerText({ timeout: 3000 }).catch(() => ''); signal = classifyChatGPTPage(body);
    if (signal && signal.code !== 'CHATGPT_WEB_UNAVAILABLE') throw webError(signal.code, signal.message, { retryable: signal.code === 'CHATGPT_RATE_LIMITED' });
  }
  throw webError('CHATGPT_WEB_UNAVAILABLE', 'ChatGPT kept returning its “Try again” load-error page after bounded recovery.', { retryable: true });
}

async function assistantTexts(page) {
  for (const selector of CHATGPT_SELECTORS.assistant) {
    const values = await page.locator(selector).allInnerTexts().catch(() => []);
    if (values.length) return values.map((value) => value.trim()).filter(Boolean);
  }
  return [];
}

export class ChatGPTTransport extends HeadlessModelTransport {}

export class PlaywrightChatGPTTransport extends ChatGPTTransport {
  constructor(options = {}) {
    super();
    this.options = options;
    this.profileDir = path.resolve(options.profileDir || process.env.JARVIS_CHATGPT_PROFILE_DIR || defaultProfile);
    this.headless = options.headless ?? /^true$/i.test(process.env.JARVIS_CHATGPT_HEADLESS || 'true');
    this.timeoutMs = Math.max(10_000, Number(options.timeoutMs || process.env.JARVIS_CHATGPT_TIMEOUT_MS || 120_000));
    this.targetUrl = options.targetUrl || process.env.JARVIS_CHATGPT_URL || DEFAULT_JARVIS_CHATGPT_URL;
    this.context = null; this.page = null; this.status = 'STOPPED'; this.lastError = null; this.sessionUrl = null; this.projectState = 'UNKNOWN'; this.projectUrl = null; this.launchHeadless = null; this.loginProcess = null;
    this.queue = Promise.resolve();
  }

  async start(options = {}) {
    const headed = options.headed === true;
    const desiredHeadless = headed ? false : this.headless;
    if (this.context && this.launchHeadless !== desiredHeadless) await this.close();
    if (this.context) return this.health();
    this.status = 'STARTING';
    try {
      await mkdir(this.profileDir, { recursive: true });
      const executablePath = this.options.executablePath || await findBrowserExecutable();
      this.context = await chromium.launchPersistentContext(this.profileDir, { executablePath, headless: desiredHeadless, viewport: null, args: ['--no-first-run', '--no-default-browser-check'] });
      this.launchHeadless = desiredHeadless;
      this.context.on('close', () => { this.context = null; this.page = null; this.status = 'STOPPED'; });
      this.page = this.context.pages().find((page) => page.url().includes('chatgpt.com')) || this.context.pages()[0] || await this.context.newPage();
      this.status = 'READY'; this.lastError = null;
      return this.health();
    } catch (error) {
      this.status = 'FAILED'; this.lastError = error.message;
      throw webError('CHATGPT_WEB_UNAVAILABLE', `ChatGPT browser could not start: ${error.message}`, { cause: error, retryable: true });
    }
  }

  async ensureProject({ projectName = 'jarvis-chat', projectUrl = null, force = false } = {}) {
    const page = this.page;
    if (!page) throw webError('CHATGPT_WEB_UNAVAILABLE', 'ChatGPT browser page is unavailable.');
    if (!force && this.projectState === 'PROJECT_VERIFIED' && this.projectUrl && (!projectUrl || this.projectUrl === projectUrl)) return { projectName, projectUrl: this.projectUrl };
    this.projectState = 'LOCATING_PROJECT';
    if (projectUrl && !page.url().includes('/c/')) {
      await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(this.timeoutMs, 45_000) }).catch(() => {});
      const directBody = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
      const directSignal = classifyChatGPTPage(directBody);
      if (directSignal?.code === 'CHATGPT_WEB_UNAVAILABLE' && /load-error/i.test(directSignal.message)) {
        // A valid saved project URL can temporarily render ChatGPT's empty
        // “Try again” shell. Fall back to semantic sidebar discovery rather
        // than blessing the URL alone or silently selecting another project.
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: Math.min(this.timeoutMs, 45_000) }).catch(() => {});
      }
    }
    if (projectUrl && matchesConfiguredProjectUrl(page.url(), projectUrl, projectName)) {
      this.projectUrl = projectUrl; this.projectState = 'PROJECT_VERIFIED';
      return { projectName, projectUrl };
    }
    const exact = projectNamePattern(projectName);
    let projectLink = page.getByRole('link', { name: exact }).first();
    if (!await projectLink.isVisible().catch(() => false)) {
      const toggle = await firstVisible(page, CHATGPT_SELECTORS.sidebarToggle, 800);
      if (toggle) await toggle.click().catch(() => {});
      projectLink = page.getByRole('link', { name: exact }).first();
    }
    if (!await projectLink.isVisible().catch(() => false)) {
      projectLink = page.locator('a').filter({ hasText: exact }).first();
    }
    if (!await projectLink.isVisible().catch(() => false)) {
      const escapedName = String(projectName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const optionsButton = page.getByRole('button', { name: new RegExp(`^Open project options for ${escapedName}$`, 'i') }).first();
      if (await optionsButton.isVisible().catch(() => false)) {
        const relativeHomes = [
          optionsButton.locator('xpath=preceding-sibling::button[@aria-label="Open project home"][1]'),
          optionsButton.locator('xpath=../button[@aria-label="Open project home"]'),
          optionsButton.locator('xpath=../../button[@aria-label="Open project home"]'),
        ];
        for (const home of relativeHomes) {
          if (await home.first().isVisible().catch(() => false)) { projectLink = home.first(); break; }
        }
        if (!await projectLink.isVisible().catch(() => false)) {
          const optionButtons = page.locator('button[aria-label^="Open project options for "]');
          const optionCount = await optionButtons.count(); let projectIndex = -1;
          for (let index = 0; index < optionCount; index += 1) if (projectNamePattern(`Open project options for ${projectName}`).test(await optionButtons.nth(index).getAttribute('aria-label') || '')) { projectIndex = index; break; }
          const homes = page.locator('button[aria-label="Open project home"]');
          if (projectIndex >= 0 && await homes.count() > projectIndex) projectLink = homes.nth(projectIndex);
        }
      }
    }
    if (!await projectLink.isVisible().catch(() => false)) projectLink = page.getByText(exact, { exact: true }).first();
    if (!await projectLink.isVisible().catch(() => false)) {
      this.projectState = 'UNKNOWN';
      throw webError('CHATGPT_PROJECT_NOT_FOUND', `The ChatGPT Project “${projectName}” was not found. JARVIS did not use another project.`);
    }
    let discoveredUrl = await projectLink.getAttribute('href').then((href) => href ? new URL(href, 'https://chatgpt.com').href : null).catch(() => null);
    if (projectUrl && discoveredUrl && new URL(projectUrl).pathname !== new URL(discoveredUrl).pathname) { this.projectState = 'UNKNOWN'; throw webError('CHATGPT_PROJECT_NOT_FOUND', `The active browser session did not match ChatGPT Project “${projectName}”.`); }
    if (!page.url().includes('/c/') && (!discoveredUrl || page.url() !== discoveredUrl)) {
      await projectLink.click({ timeout: 10_000 }).catch((error) => { throw webError('CHATGPT_PROJECT_NOT_FOUND', `ChatGPT exposed “${projectName}” but its project home could not be opened: ${error.message}`); });
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    }
    if (!discoveredUrl && matchesConfiguredProjectUrl(page.url(), page.url(), projectName)) discoveredUrl = page.url();
    const visibleExactName = await page.getByText(exact, { exact: true }).first().isVisible().catch(() => false);
    const verifiedProjectUrl = discoveredUrl && matchesConfiguredProjectUrl(discoveredUrl, discoveredUrl, projectName);
    if (!visibleExactName || !verifiedProjectUrl) { this.projectState = 'UNKNOWN'; throw webError('CHATGPT_PROJECT_NOT_FOUND', `Could not verify that ChatGPT Project “${projectName}” is active.`); }
    this.projectUrl = discoveredUrl || projectUrl || (page.url().includes('/g/') ? page.url() : null);
    this.projectState = 'PROJECT_VERIFIED';
    return { projectName, projectUrl: this.projectUrl };
  }

  async ensurePage(sessionUrl, options = {}) {
    await this.start();
    if (!this.page || this.page.isClosed()) this.page = await this.context.newPage();
    if (options.newSession) { this.sessionUrl = null; this.projectState = 'UNKNOWN'; }
    const wanted = options.newSession
      ? (options.targetUrl || this.targetUrl || options.projectUrl || this.projectUrl)
      : (sessionUrl || options.targetUrl || this.sessionUrl || this.targetUrl);
    if (options.newSession || !this.page.url().includes('chatgpt.com') || (sessionUrl && this.page.url() !== sessionUrl)) {
      await this.page.goto(wanted, { waitUntil: 'domcontentloaded', timeout: Math.min(this.timeoutMs, 45_000) });
    }
    const projectName = options.projectName || 'jarvis-chat';
    const verifiedTarget = options.targetUrl && matchesConfiguredProjectUrl(this.page.url(), options.targetUrl, projectName) ? options.targetUrl : null;
    let project = await this.ensureProject({ projectName, projectUrl: verifiedTarget || options.projectUrl, force: options.forceProject === true || options.newSession === true });
    let composer = await firstVisible(this.page, CHATGPT_SELECTORS.composer, 5000);
    if (!composer) {
      try { composer = await recoverTransientPage(this.page); }
      catch (error) {
        if (error.code !== 'CHATGPT_WEB_UNAVAILABLE') throw error;
        // Last safe recovery: leave the failing deep link, load the root UI,
        // and rediscover the exact project by name. Never send from root.
        await this.page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: Math.min(this.timeoutMs, 45_000) }).catch(() => {});
        const rootBody = await this.page.locator('body').innerText({ timeout: 3000 }).catch(() => ''); const rootSignal = classifyChatGPTPage(rootBody);
        if (rootSignal) throw webError(rootSignal.code, rootSignal.message, { retryable: rootSignal.code !== 'CHATGPT_LOGIN_REQUIRED' });
        this.projectState = 'UNKNOWN'; this.projectUrl = null;
        project = await this.ensureProject({ projectName, projectUrl: null, force: true });
        composer = await firstVisible(this.page, CHATGPT_SELECTORS.composer, 5000);
      }
    }
    if (!composer) {
      const body = await this.page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
      const signal = classifyChatGPTPage(body);
      if (signal) {
        if (signal.code === 'CHATGPT_LOGIN_REQUIRED') this.status = 'WAITING_FOR_CHATGPT';
        throw webError(signal.code, signal.code === 'CHATGPT_LOGIN_REQUIRED' ? 'ChatGPT login is required. Run npm run chatgpt:login and sign in manually.' : signal.message, { retryable: signal.code !== 'CHATGPT_LOGIN_REQUIRED' });
      }
      throw webError('CHATGPT_UI_CHANGED', 'The ChatGPT message composer could not be located. The web UI may have changed.');
    }
    return { page: this.page, composer, project };
  }

  async send(message, options = {}) {
    let release; const previous = this.queue; this.queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      this.status = 'BUSY';
      const { page, composer, project } = await this.ensurePage(options.sessionUrl, options);
      const before = await assistantTexts(page);
      await installDomStream(page, CHATGPT_SELECTORS.assistant);
      await composer.fill(String(message));
      const submit = await firstVisible(page, CHATGPT_SELECTORS.submit, 1500);
      if (submit) await submit.click(); else await composer.press('Enter');
      const deadline = Date.now() + this.timeoutMs;
      let lastText = ''; let streamedText = ''; let stableSince = 0; let sawNew = false;
      while (Date.now() < deadline) {
        if (options.signal?.aborted) { await this.cancel(); throw webError('EXECUTION_CANCELLED', 'ChatGPT generation was cancelled.'); }
        const current = await assistantTexts(page); const snapshots = await drainDomStream(page);
        const latest = snapshots.at(-1) || current.at(-1) || '';
        if (current.length > before.length || (latest && latest !== before.at(-1))) sawNew = true;
        const stopping = Boolean(await firstVisible(page, CHATGPT_SELECTORS.stop, 150).catch(() => null));
        if (sawNew && latest) {
          streamedText = emitTextDelta(streamedText, latest, options.onDelta);
          if (latest === lastText) stableSince ||= Date.now(); else { lastText = latest; stableSince = Date.now(); }
          if (!stopping && Date.now() - stableSince >= 650) {
            this.sessionUrl = page.url().includes('/c/') ? page.url() : this.sessionUrl;
            this.status = 'READY'; this.lastError = null;
            await stopDomStream(page); return { text: latest, sessionUrl: this.sessionUrl || page.url(), projectUrl: project.projectUrl, partial: false };
          }
        }
        const body = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
        const signal = classifyChatGPTPage(body);
        if (signal) throw webError(signal.code, signal.message, { retryable: signal.code !== 'CHATGPT_LOGIN_REQUIRED' });
        await page.waitForTimeout(250);
      }
      throw webError('CHATGPT_TIMEOUT', sawNew ? 'ChatGPT generation did not finish before the timeout.' : 'ChatGPT did not produce a response before the timeout.', { retryable: true, details: { partial: sawNew ? lastText : null } });
    } catch (error) {
      if (!(error instanceof ToolRuntimeError) && options.recovery !== false) {
        this.lastError = error.message; await this.close(); release();
        return this.send(message, { ...options, recovery: false });
      }
      this.lastError = error.message; this.status = error.code === 'CHATGPT_LOGIN_REQUIRED' ? 'WAITING_FOR_CHATGPT' : 'FAILED';
      if (error instanceof ToolRuntimeError) throw error;
      throw webError('CHATGPT_WEB_UNAVAILABLE', `ChatGPT Web request failed: ${error.message}`, { cause: error, retryable: true });
    } finally { if (this.page && !this.page.isClosed()) await stopDomStream(this.page); release(); }
  }

  async cancel() {
    if (!this.page || this.page.isClosed()) return { cancelled: false };
    const stop = await firstVisible(this.page, CHATGPT_SELECTORS.stop, 300);
    if (stop) { await stop.click().catch(() => {}); this.status = 'READY'; return { cancelled: true }; }
    return { cancelled: false };
  }

  async openLogin() {
    if (this.loginProcess && this.loginProcess.exitCode === null) return this.health();
    await this.close(); await mkdir(this.profileDir, { recursive: true });
    const executablePath = this.options.executablePath || await findBrowserExecutable();
    const projectName = process.env.JARVIS_CHATGPT_PROJECT_NAME || 'jarvis-chat';
    const configuredProject = process.env.JARVIS_CHATGPT_PROJECT_URL;
    const configuredTarget = process.env.JARVIS_CHATGPT_URL || this.targetUrl;
    const startUrl = configuredTarget && matchesConfiguredProjectUrl(configuredTarget, configuredTarget, projectName) ? configuredTarget : configuredProject && matchesConfiguredProjectUrl(configuredProject, configuredProject, projectName) ? configuredProject : 'https://chatgpt.com/';
    const child = spawn(executablePath, [`--user-data-dir=${this.profileDir}`, '--no-first-run', '--no-default-browser-check', '--new-window', startUrl], { stdio: 'ignore', windowsHide: false });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    this.loginProcess = child; child.once('exit', () => { this.loginProcess = null; }); child.unref();
    this.status = 'WAITING_FOR_CHATGPT'; this.lastError = null;
    return this.health();
  }

  async verifyLogin() {
    if (this.loginProcess && this.loginProcess.exitCode === null) throw webError('CHATGPT_SESSION_BUSY', 'Close the ChatGPT login browser window before verifying the saved session.');
    await this.start();
    await this.ensurePage(this.sessionUrl, { projectName: process.env.JARVIS_CHATGPT_PROJECT_NAME || 'jarvis-chat', projectUrl: process.env.JARVIS_CHATGPT_PROJECT_URL || this.projectUrl, targetUrl: process.env.JARVIS_CHATGPT_URL || this.targetUrl });
    this.status = 'READY';
    return this.health();
  }

  async diagnose() {
    if (!this.page || this.page.isClosed()) return { browser: 'STOPPED', url: null, title: null, composerCandidates: [] };
    const page = this.page;
    const candidates = await page.locator('textarea, [contenteditable="true"], [role="textbox"]').evaluateAll((nodes) => nodes.slice(0, 12).map((node) => ({ tag: node.tagName.toLowerCase(), id: node.id || null, role: node.getAttribute('role'), label: node.getAttribute('aria-label'), placeholder: node.getAttribute('placeholder'), testId: node.getAttribute('data-testid'), visible: Boolean(node.getClientRects().length) }))).catch(() => []);
    const body = await page.locator('body').innerText({ timeout: 3000 }).catch(() => ''); const pageSignal = classifyChatGPTPage(body);
    const navigationCandidates = await page.locator('a,button').evaluateAll((nodes) => nodes.map((node) => ({ tag: node.tagName.toLowerCase(), text: (node.innerText || node.getAttribute('aria-label') || '').trim().slice(0, 120), href: node.getAttribute('href'), expanded: node.getAttribute('aria-expanded'), visible: Boolean(node.getClientRects().length) })).filter((item) => /jarvis|project|sidebar/i.test(`${item.text} ${item.href || ''}`)).slice(0, 40)).catch(() => []);
    return { browser: 'RUNNING', url: page.url(), title: await page.title().catch(() => ''), composerCandidates: candidates, navigationCandidates, signals: { login: /log in|sign up|welcome back/i.test(body), googleRejected: /couldn.t sign you in|browser or app may not be secure/i.test(body), challenge: /verify you are human|checking your browser|cloudflare/i.test(body), unavailable: pageSignal?.code === 'CHATGPT_WEB_UNAVAILABLE', genericRetry: /^(?:try again|reload)$/i.test(String(body).trim()) } };
  }

  async reset(options = {}) {
    await this.start(); this.sessionUrl = null; this.projectState = 'UNKNOWN';
    if (!this.page || this.page.isClosed()) this.page = await this.context.newPage();
    const targetUrl = options.targetUrl || this.targetUrl;
    await this.page.goto(targetUrl || options.projectUrl || this.projectUrl || 'https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: Math.min(this.timeoutMs, 45_000) });
    await this.ensureProject({ projectName: options.projectName || 'jarvis-chat', projectUrl: targetUrl || options.projectUrl || this.projectUrl, force: true });
    return this.health();
  }

  async health() {
    if (this.loginProcess && this.loginProcess.exitCode === null) return { status: 'WAITING_FOR_CHATGPT', browser: 'LOGIN_WINDOW', authenticated: false, mode: 'HEADED', session: this.sessionUrl ? 'ACTIVE' : 'NONE', sessionUrl: this.sessionUrl, lastError: this.lastError };
    const running = Boolean(this.context && this.page && !this.page.isClosed());
    let authenticated = false; let derivedStatus = this.status; let derivedError = this.lastError;
    if (running && this.page.url().includes('chatgpt.com')) {
      authenticated = Boolean(await firstVisible(this.page, CHATGPT_SELECTORS.composer, 600).catch(() => null));
      if (!authenticated) {
        const body = await this.page.locator('body').innerText({ timeout: 1000 }).catch(() => ''); const signal = classifyChatGPTPage(body);
        if (signal) { derivedStatus = signal.code === 'CHATGPT_LOGIN_REQUIRED' ? 'WAITING_FOR_CHATGPT' : 'FAILED'; derivedError = signal.message; }
      }
    }
    return { status: derivedStatus, browser: running ? 'RUNNING' : 'STOPPED', authenticated, mode: running ? (this.launchHeadless ? 'HEADLESS' : 'HEADED') : (this.headless ? 'HEADLESS' : 'HEADED'), session: this.sessionUrl ? 'ACTIVE' : 'NONE', sessionUrl: this.sessionUrl, project: this.projectState, projectName: 'jarvis-chat', projectUrl: this.projectUrl, lastError: derivedError };
  }

  async close() {
    const context = this.context; this.context = null; this.page = null; this.projectState = 'UNKNOWN'; this.launchHeadless = null; this.status = 'STOPPED';
    if (context) await context.close().catch(() => {});
  }
}

let shared;
export function chatGPTWebTransport() { shared ||= new PlaywrightChatGPTTransport(); return shared; }
export async function closeChatGPTWebTransport() { if (shared) await shared.close(); shared = null; }
