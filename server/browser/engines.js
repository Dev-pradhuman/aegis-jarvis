import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const defaultProfile = fileURLToPath(new URL('../data/browser-profile/', import.meta.url));

export function ensureDisplayEnvironment(env = process.env) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const runtimeDir = env.XDG_RUNTIME_DIR || `/run/user/${uid}`;
  if (!env.XDG_RUNTIME_DIR && fs.existsSync(runtimeDir)) {
    env.XDG_RUNTIME_DIR = runtimeDir;
  }

  // 1. Detect WAYLAND_DISPLAY if not set
  if (!env.WAYLAND_DISPLAY && fs.existsSync(runtimeDir)) {
    try {
      const files = fs.readdirSync(runtimeDir);
      const waylandSocket = files.find((f) => /^wayland-\d+$/.test(f));
      if (waylandSocket) {
        env.WAYLAND_DISPLAY = waylandSocket;
      }
    } catch {}
  }

  // 2. Detect DISPLAY if not set
  if (!env.DISPLAY) {
    const x11Dir = '/tmp/.X11-unix';
    if (fs.existsSync(x11Dir)) {
      try {
        const xFiles = fs.readdirSync(x11Dir);
        const xSocket = xFiles.find((f) => /^X\d+$/.test(f));
        if (xSocket) {
          const displayNum = xSocket.slice(1);
          env.DISPLAY = `:${displayNum}`;
        }
      } catch {}
    }
  }

  // 3. Detect HYPRLAND_INSTANCE_SIGNATURE if not set
  if (!env.HYPRLAND_INSTANCE_SIGNATURE && fs.existsSync(runtimeDir)) {
    try {
      const hyprDir = path.join(runtimeDir, 'hypr');
      if (fs.existsSync(hyprDir)) {
        const entries = fs.readdirSync(hyprDir);
        const sigs = entries.filter((e) => !e.startsWith('.'));
        if (sigs.length > 0) {
          env.HYPRLAND_INSTANCE_SIGNATURE = sigs[0];
        }
      }
    } catch {}
  }

  return {
    WAYLAND_DISPLAY: env.WAYLAND_DISPLAY || null,
    DISPLAY: env.DISPLAY || null,
    HYPRLAND_INSTANCE_SIGNATURE: env.HYPRLAND_INSTANCE_SIGNATURE || null,
    XDG_RUNTIME_DIR: env.XDG_RUNTIME_DIR || null,
  };
}

export function focusBrowserWindow() {
  try {
    ensureDisplayEnvironment();
    if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
      execFile('hyprctl', ['dispatch', 'focuswindow', 'class:(?i)chromium|chrome|firefox'], () => {});
    }
  } catch {}
}

function safeFormScript() {
  return Array.from(document.querySelectorAll('input,textarea,select')).slice(0, 30).map((element) => ({
    id: element.id || null,
    name: element.name || null,
    tag: element.tagName.toLowerCase(),
    type: element.type || null,
    autocomplete: element.autocomplete || null,
    value: element.value?.slice(0, 1000) || '',
  })).filter((field) => field.value && !['password', 'hidden', 'file'].includes(field.type) && !/(pass|token|secret|otp|card|cvv|auth|security)/i.test(`${field.id || ''} ${field.name || ''} ${field.autocomplete || ''}`) && (field.id || field.name));
}

function accessibilityScript() {
  return Array.from(document.querySelectorAll('a,button,input,select,textarea,[role]')).slice(0, 180).map((element) => ({
    role: element.getAttribute('role') || element.tagName.toLowerCase(),
    name: element.getAttribute('aria-label') || element.innerText?.trim().slice(0, 180) || element.getAttribute('placeholder') || '',
    href: element.tagName === 'A' ? element.href : undefined,
  }));
}

function challengeScript() {
  const title = document.title || '';
  const text = (document.body?.innerText || '').trim();
  const botPattern = /captcha|turnstile|verify you are human|checking your browser|security challenge|cloudflare challenge|just a moment\.\.\.|human verification|attention required/i;
  const otpPattern = /enter (?:one-time |verification |security )?code|enter otp|2-step verification|two-factor|authenticator code|confirm your identity/i;
  const loginPattern = /sign in to continue|log in to continue|please sign in|login required/i;

  const hasBot = botPattern.test(title) || (text.length < 2500 && botPattern.test(text)) || Boolean(document.querySelector('iframe[src*="cloudflare"], iframe[src*="turnstile"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .cf-turnstile, #cf-challenge, .g-recaptcha, .h-captcha'));
  const hasOtp = otpPattern.test(title) || (text.length < 2500 && otpPattern.test(text));
  const hasLogin = loginPattern.test(title) || (text.length < 2500 && loginPattern.test(text));

  if (hasBot) return { type: 'BOT_WALL', title, excerpt: text.slice(0, 240) };
  if (hasOtp) return { type: 'OTP_2FA', title, excerpt: text.slice(0, 240) };
  if (hasLogin) return { type: 'LOGIN_WALL', title, excerpt: text.slice(0, 240) };
  return null;
}

export class LightpandaEngine {
  constructor(options = {}) { this.options = options; this.kind = 'lightpanda'; this.process = null; this.browser = null; this.context = null; this.page = null; }
  async start() {
    const [{ lightpanda }, { default: puppeteer }] = await Promise.all([import('@lightpanda/browser'), import('puppeteer-core')]);
    const port = Number(this.options.port || process.env.BROWSER_LIGHTPANDA_PORT || 9327);
    this.process = await lightpanda.serve({ host: '127.0.0.1', port });
    try {
      this.browser = await puppeteer.connect({ browserWSEndpoint: `ws://127.0.0.1:${port}`, protocolTimeout: 15000 });
      this.context = await this.browser.createBrowserContext();
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(12000);
    } catch (error) { await this.close(); throw error; }
  }
  isHealthy() { return Boolean(this.process && this.process.exitCode === null && this.browser?.connected && this.page && !this.page.isClosed()); }
  url() { return this.page?.url() || null; }
  async navigate(url) { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); return { url: this.url(), title: await this.page.title() }; }
  async click(selector) { await this.page.click(selector, { timeout: 12000 }); return { url: this.url(), selector }; }
  async type(selector, text) { await this.page.locator(selector).fill(text, { timeout: 12000 }); return { url: this.url(), selector, length: text.length }; }
  async evaluate(code) { return this.page.evaluate(code); }
  async read() { return this.page.evaluate(() => ({ title: document.title, text: (document.body?.innerText || '').slice(0, 30000), links: Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map((a) => ({ text: a.innerText?.trim().slice(0, 120) || '', href: a.href })) })); }
  async content() { return (await this.page.content()).slice(0, 200000); }
  async accessibility() { return this.page.evaluate(accessibilityScript); }
  async waitFor(selector, timeout = 12000) { await this.page.waitForSelector(selector, { timeout }); return { selector, found: true }; }
  async formState() { return this.page.evaluate(safeFormScript).catch(() => []); }
  async challenge() { return this.page.evaluate(challengeScript).catch(() => null); }
  async close() {
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    await this.browser?.disconnect().catch(() => {});
    if (this.process && this.process.exitCode === null) this.process.kill('SIGTERM');
    this.page = this.context = this.browser = this.process = null;
  }
}

export class PatchrightEngine {
  constructor(options = {}) {
    this.options = options;
    this.kind = options.kind || 'firefox';
    this.context = null;
    this.page = null;
    this.headed = false;
    this.authenticatedDomains = new Set();
  }

  async start({ headed = false } = {}) {
    ensureDisplayEnvironment();
    const { chromium } = await import('patchright');
    const profile = path.resolve(this.options.profileDir || process.env.BROWSER_PROFILE_DIR || defaultProfile);
    const args = [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ];
    if (headed) {
      args.push('--ozone-platform-hint=auto');
      if (process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) {
        args.push('--ozone-platform=wayland');
      }
    }
    this.context = await chromium.launchPersistentContext(profile, {
      headless: !headed,
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
      args,
      env: process.env,
    });
    this.headed = headed;
    this.page = this.context.pages()[0] || await this.context.newPage();
    this.page.setDefaultTimeout(15000);
  }

  isHealthy() {
    return Boolean(this.context && this.page && !this.page.isClosed() && (this.context.browser?.() ? this.context.browser().isConnected() : true));
  }

  url() {
    return this.page?.url() || null;
  }

  async navigate(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    return { url: this.url(), title: await this.page.title() };
  }

  async click(selector) {
    await this.page.locator(selector).click({ timeout: 12000 });
    return { url: this.url(), selector };
  }

  async type(selector, text) {
    await this.page.locator(selector).fill(text, { timeout: 12000 });
    return { url: this.url(), selector, length: text.length };
  }

  async evaluate(code) {
    return this.page.evaluate(code);
  }

  async read() {
    return this.page.evaluate(() => ({
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 30000),
      links: Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map((a) => ({
        text: a.innerText?.trim().slice(0, 120) || '',
        href: a.href,
      })),
    }));
  }

  async content() {
    return (await this.page.content()).slice(0, 200000);
  }

  async accessibility() {
    return this.page.evaluate(accessibilityScript);
  }

  async screenshot() {
    return {
      mimeType: 'image/png',
      data: (await this.page.screenshot({ type: 'png' })).toString('base64'),
      url: this.url(),
    };
  }

  async waitFor(selector, timeout = 12000) {
    await this.page.locator(selector).waitFor({ timeout });
    return { selector, found: true };
  }

  async formState() {
    return this.page.evaluate(safeFormScript).catch(() => []);
  }

  async applyFormState(fields = []) {
    await this.page.evaluate((values) => {
      for (const field of values) {
        const element = field.id ? document.getElementById(field.id) : Array.from(document.getElementsByName(field.name || '')).find((node) => node.tagName.toLowerCase() === field.tag);
        if (element && element.type !== 'password') {
          element.value = field.value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, fields).catch(() => {});
  }

  async challenge() {
    return this.page.evaluate(challengeScript).catch(() => null);
  }

  async bringToFront() {
    if (this.page) {
      await this.page.bringToFront().catch(() => {});
    }
    focusBrowserWindow();
  }

  async relaunchHeaded() {
    const url = this.url();
    const fields = this.page ? await this.formState() : [];
    await this.close();
    await this.start({ headed: true });
    if (url && /^https?:/.test(url)) {
      await this.navigate(url);
      await this.applyFormState(fields);
    }
    await this.bringToFront();
  }

  async relaunchHeadless() {
    const url = this.url();
    const fields = this.page ? await this.formState() : [];
    await this.close();
    await this.start({ headed: false });
    if (url && /^https?:/.test(url)) {
      await this.navigate(url);
      await this.applyFormState(fields);
    }
  }

  async close() {
    await this.context?.close().catch(() => {});
    this.context = this.page = null;
    this.headed = false;
  }
}

export const FirefoxEngine = PatchrightEngine;
