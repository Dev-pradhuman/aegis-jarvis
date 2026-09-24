import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultProfile = fileURLToPath(new URL('../data/browser/firefox-profile/', import.meta.url));

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
  async challenge() { return this.page.evaluate(() => { const title = document.title || ''; const text = (document.body?.innerText || '').trim(); const challenge = /captcha|verify you are human|checking your browser|security challenge|cloudflare challenge/i; return (challenge.test(title) || (text.length < 1800 && challenge.test(text))) && (document.querySelector('form,iframe,[id*=captcha],[class*=captcha]') || text.length < 600) ? { title, excerpt: text.slice(0, 240) } : null; }).catch(() => null); }
  async close() {
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    await this.browser?.disconnect().catch(() => {});
    if (this.process && this.process.exitCode === null) this.process.kill('SIGTERM');
    this.page = this.context = this.browser = this.process = null;
  }
}

export class FirefoxEngine {
  constructor(options = {}) { this.options = options; this.kind = 'firefox'; this.context = null; this.page = null; this.headed = false; }
  async start({ headed = false } = {}) {
    const { firefox } = await import('playwright');
    const profile = path.resolve(this.options.profileDir || process.env.BROWSER_FIREFOX_PROFILE || defaultProfile);
    this.context = await firefox.launchPersistentContext(profile, { headless: !headed, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    this.headed = headed;
    this.page = this.context.pages()[0] || await this.context.newPage();
    this.page.setDefaultTimeout(12000);
  }
  isHealthy() { return Boolean(this.context && this.page && !this.page.isClosed() && this.context.browser()?.isConnected()); }
  url() { return this.page?.url() || null; }
  async navigate(url) { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }); return { url: this.url(), title: await this.page.title() }; }
  async click(selector) { await this.page.locator(selector).click({ timeout: 12000 }); return { url: this.url(), selector }; }
  async type(selector, text) { await this.page.locator(selector).fill(text, { timeout: 12000 }); return { url: this.url(), selector, length: text.length }; }
  async evaluate(code) { return this.page.evaluate(code); }
  async read() { return this.page.evaluate(() => ({ title: document.title, text: (document.body?.innerText || '').slice(0, 30000), links: Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map((a) => ({ text: a.innerText?.trim().slice(0, 120) || '', href: a.href })) })); }
  async content() { return (await this.page.content()).slice(0, 200000); }
  async accessibility() { return this.page.evaluate(accessibilityScript); }
  async screenshot() { return { mimeType: 'image/png', data: (await this.page.screenshot({ type: 'png' })).toString('base64'), url: this.url() }; }
  async waitFor(selector, timeout = 12000) { await this.page.locator(selector).waitFor({ timeout }); return { selector, found: true }; }
  async formState() { return this.page.evaluate(safeFormScript).catch(() => []); }
  async applyFormState(fields = []) { await this.page.evaluate((values) => { for (const field of values) { const element = field.id ? document.getElementById(field.id) : Array.from(document.getElementsByName(field.name || '')).find((node) => node.tagName.toLowerCase() === field.tag); if (element && element.type !== 'password') { element.value = field.value; element.dispatchEvent(new Event('input', { bubbles: true })); } } }, fields).catch(() => {}); }
  async challenge() { return this.page.evaluate(() => { const title = document.title || ''; const text = (document.body?.innerText || '').trim(); const challenge = /captcha|verify you are human|checking your browser|security challenge|cloudflare challenge/i; return (challenge.test(title) || (text.length < 1800 && challenge.test(text))) && (document.querySelector('form,iframe,[id*=captcha],[class*=captcha]') || text.length < 600) ? { title, excerpt: text.slice(0, 240) } : null; }).catch(() => null); }
  async bringToFront() { await this.page.bringToFront(); }
  async relaunchHeaded() { const url = this.url(); const fields = this.page ? await this.formState() : []; await this.close(); await this.start({ headed: true }); if (url && /^https?:/.test(url)) { await this.navigate(url); await this.applyFormState(fields); } }
  async close() { await this.context?.close().catch(() => {}); this.context = this.page = null; this.headed = false; }
}
