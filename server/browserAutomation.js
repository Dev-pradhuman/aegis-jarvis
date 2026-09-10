import { chromium } from 'playwright-core';
import { mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowserExecutable } from './platform/browserExecutable.js';
import { dataDirectory } from './platform/paths.js';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataRoot = dataDirectory(projectRoot);
const profileRoot = path.join(dataRoot, 'browser-profile');
const namedProfilesRoot = path.join(dataRoot, 'browser-profiles');
const downloadRoot = path.join(dataRoot, 'downloads');

const contextPromises = new Map();
const activePages = new Map();
const profileKey = (options = {}) => String(options.profileName || 'default').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

function browserError(code, message, details) { return Object.assign(new Error(message), { code, details }); }

export function normalizeWebUrl(input) {
  let value = String(input || '').trim();
  if (!value) throw browserError('INVALID_ARGUMENTS', 'A URL is required.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw browserError('INVALID_ARGUMENTS', 'The URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw browserError('PERMISSION_DENIED', 'Only HTTP and HTTPS browser URLs are allowed.');
  if (url.username || url.password) throw browserError('PERMISSION_DENIED', 'Credentials must not be embedded in browser URLs.');
  return url.toString();
}

async function createContext(options = {}) {
  const key = profileKey(options); const selectedProfile = key === 'default' ? profileRoot : path.join(namedProfilesRoot, key);
  await Promise.all([mkdir(selectedProfile, { recursive: true }), mkdir(downloadRoot, { recursive: true })]);
  const executable = options.executablePath || await findBrowserExecutable();
  const context = await chromium.launchPersistentContext(selectedProfile, {
    executablePath: executable,
    headless: options.headless ?? /^true$/i.test(process.env.JARVIS_BROWSER_HEADLESS || ''),
    acceptDownloads: true,
    downloadsPath: downloadRoot,
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  context.on('close', () => { contextPromises.delete(key); activePages.delete(key); });
  context.on('page', (page) => { activePages.set(key, page); });
  return context;
}

export async function browserContext(options = {}) {
  if (options.context) return options.context;
  const key = profileKey(options);
  if (!contextPromises.has(key)) contextPromises.set(key, createContext(options).catch((error) => { contextPromises.delete(key); throw error; }));
  return contextPromises.get(key);
}

async function pages(options = {}) { return (await browserContext(options)).pages(); }

async function pageState(page) {
  return { url: page.url(), title: await page.title(), observedAt: new Date().toISOString() };
}

async function resolvePage(ref, options = {}) {
  const all = await pages(options);
  const activePageRef = activePages.get(profileKey(options));
  if (!ref) return activePageRef && !activePageRef.isClosed() ? activePageRef : all.at(-1) || null;
  const value = String(ref).toLowerCase();
  const exact = all.filter((page, index) => String(index) === value || page.url().toLowerCase() === value);
  if (exact.length === 1) return exact[0];
  const matches = [];
  for (const page of all) if (page.url().toLowerCase().includes(value) || (await page.title()).toLowerCase().includes(value)) matches.push(page);
  if (matches.length !== 1) throw browserError(matches.length ? 'UI_TARGET_AMBIGUOUS' : 'UI_TARGET_NOT_FOUND', matches.length ? `Multiple tabs match ${ref}.` : `No tab matches ${ref}.`);
  return matches[0];
}

async function targetLocator(page, args) {
  const target = String(args.target || '').trim();
  if (!target) throw browserError('INVALID_ARGUMENTS', 'A semantic target is required.');
  const exact = args.exact !== false;
  const candidates = args.role
    ? [page.getByRole(args.role, { name: target, exact })]
    : [page.getByRole('button', { name: target, exact }), page.getByRole('link', { name: target, exact }), page.getByLabel(target, { exact }), page.getByPlaceholder(target, { exact }), page.getByText(target, { exact })];
  for (const locator of candidates) {
    const count = await locator.count();
    if (count === 1) return locator;
    if (count > 1 && Number.isInteger(args.index) && args.index >= 0 && args.index < count) return locator.nth(args.index);
  }
  throw browserError('UI_TARGET_NOT_FOUND', `No unique visible browser target matched ${target}.`);
}

export async function browserAction(action, args = {}, options = {}) {
  const adapter = options.adapter;
  if (adapter) return adapter(action, args);
  if (action === 'tabs.list') {
    const all = await pages(options); const tabs = [];
    for (let index = 0; index < all.length; index += 1) tabs.push({ index, ...(await pageState(all[index])) });
    const activePageRef = activePages.get(profileKey(options));
    const activeIndex = activePageRef ? all.indexOf(activePageRef) : all.length - 1;
    return { tabs, activeIndex: Math.max(0, activeIndex), verified: true };
  }
  if (action === 'tabs.open') {
    const context = await browserContext(options); const page = await context.newPage(); const url = normalizeWebUrl(args.url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 20000 });
    await page.bringToFront(); activePages.set(profileKey(options), page); return { ...(await pageState(page)), opened: true, verified: page.url().startsWith('http') };
  }
  const page = await resolvePage(args.tab, options);
  if (!page) throw browserError('CONNECTION_UNAVAILABLE', 'The managed browser has no page.');
  if (action === 'tabs.close') { const before = (await pages(options)).length; await page.close(); return { closed: true, remainingTabs: Math.max(0, before - 1), verified: page.isClosed() }; }
  if (action === 'tabs.switch') { await page.bringToFront(); activePages.set(profileKey(options), page); return { ...(await pageState(page)), switched: true, verified: true }; }
  if (action === 'back') { await page.goBack({ waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 20000 }); return { ...(await pageState(page)), verified: true }; }
  if (action === 'forward') { await page.goForward({ waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 20000 }); return { ...(await pageState(page)), verified: true }; }
  if (action === 'reload') { await page.reload({ waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 20000 }); return { ...(await pageState(page)), verified: true }; }
  if (action === 'read') {
    const content = await page.locator('body').innerText({ timeout: 10000 });
    return { ...(await pageState(page)), content: content.slice(0, args.maxCharacters || 20000), characters: content.length, truncated: content.length > (args.maxCharacters || 20000), untrustedExternalContent: true, verified: true };
  }
  if (action === 'search') {
    const url = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 20000 });
    return { ...(await pageState(page)), query: args.query, verified: page.url().startsWith('https://www.google.') };
  }
  if (action === 'scroll') { await page.mouse.wheel(0, args.amount); return { ...(await pageState(page)), accepted: true, verified: true }; }
  const locator = await targetLocator(page, args);
  await locator.scrollIntoViewIfNeeded();
  if (action === 'click') { await locator.click({ timeout: 10000 }); return { ...(await pageState(page)), accepted: true, target: args.target, grounding: 'dom-accessibility', verified: true }; }
  if (action === 'type') { await locator.pressSequentially(args.text, { delay: Math.max(0, args.delayMs || 0) }); return { ...(await pageState(page)), accepted: true, target: args.target, characters: args.text.length, verified: true }; }
  if (action === 'fill') { await locator.fill(args.text); const actual = await locator.inputValue(); return { ...(await pageState(page)), accepted: true, target: args.target, characters: actual.length, verified: actual === args.text }; }
  if (action === 'submit') { await locator.press('Enter'); return { ...(await pageState(page)), accepted: true, target: args.target, verified: true }; }
  if (action === 'download') {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), locator.click({ timeout: 10000 })]);
    const failure = await download.failure(); if (failure) throw browserError('EXECUTION_FAILED', `Browser download failed: ${failure}`);
    const safeName = path.basename(download.suggestedFilename()).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) || 'download.bin';
    const destination = path.join(downloadRoot, `${Date.now()}-${safeName}`); await download.saveAs(destination);
    const info = await stat(destination);
    return { ...(await pageState(page)), accepted: true, target: args.target, artifactPath: destination, bytes: info.size, verified: info.isFile() && info.size >= 0 };
  }
  if (action === 'upload') {
    const root = await realpath(projectRoot); const supplied = path.resolve(projectRoot, args.path); const actual = await realpath(supplied);
    if (actual !== root && !actual.startsWith(`${root}${path.sep}`)) throw browserError('PERMISSION_DENIED', 'Upload path escapes the project workspace.');
    await locator.setInputFiles(actual); return { ...(await pageState(page)), accepted: true, target: args.target, file: path.relative(root, actual).replaceAll('\\', '/'), verified: true };
  }
  throw browserError('INVALID_ARGUMENTS', `Unsupported browser action: ${action}`);
}

export async function closeBrowserSession(profileName = null) {
  const keys = profileName ? [profileKey({ profileName })] : [...contextPromises.keys()];
  for (const key of keys) {
    const promise = contextPromises.get(key); if (!promise) continue;
    contextPromises.delete(key); activePages.delete(key); const context = await promise; await context.close();
  }
}
