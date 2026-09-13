import { browserContext } from './browserAutomation.js';

function instagramError(code, message, details = null) { return Object.assign(new Error(message), { code, details }); }

const encodeIdentity = (candidate) => `instagram-web:${Buffer.from(JSON.stringify({ username: candidate.username, displayName: candidate.displayName, index: candidate.index })).toString('base64url')}`;
function decodeIdentity(value) {
  if (!String(value || '').startsWith('instagram-web:')) return null;
  try { return JSON.parse(Buffer.from(String(value).slice('instagram-web:'.length), 'base64url').toString('utf8')); } catch { return null; }
}

async function instagramPage(options = {}) {
  const context = await browserContext({ ...options, profileName: options.profileName || 'instagram', headless: options.headless ?? true });
  const page = context.pages().find((item) => /instagram\.com/i.test(item.url())) || await context.newPage();
  if (!/instagram\.com/i.test(page.url())) await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 30000 });
  if (/\/accounts\/login/i.test(page.url()) || await page.locator('input[name="username"], input[name="password"]').count()) {
    throw instagramError('INSTAGRAM_AUTH_REQUIRED', 'Instagram Web login is required. Open Settings → Connections → Instagram sign-in and authenticate in the visible browser.');
  }
  return page;
}

async function openRecipientPicker(page) {
  const triggers = [page.getByRole('button', { name: /new message/i }).first(), page.locator('[aria-label="New message"]').first(), page.getByText(/new message/i, { exact: true }).first()];
  for (const trigger of triggers) {
    if (await trigger.count() && await trigger.isVisible().catch(() => false)) { await trigger.click(); break; }
  }
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw instagramError('INSTAGRAM_SEARCH_FAILED', 'Instagram recipient search dialog could not be opened.'); });
  const search = dialog.getByRole('textbox').first();
  await search.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw instagramError('INSTAGRAM_SEARCH_FAILED', 'Instagram recipient search field could not be located.'); });
  return { dialog, search };
}

async function visibleCandidates(dialog, query) {
  const needle = String(query || '').trim().replace(/^@/, '').toLowerCase();
  const rows = dialog.locator('[role="button"]:visible');
  const raw = await rows.evaluateAll((elements) => elements.slice(0, 40).map((row, index) => {
    const lines = (row.innerText || row.textContent || '').split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
    const href = row.querySelector('a[href]')?.getAttribute('href') || '';
    const pathName = href.match(/^\/([^/?#]+)\/?(?:[?#].*)?$/)?.[1] || '';
    const username = lines.find((line) => /^@?[a-z0-9._]{2,30}$/i.test(line))?.replace(/^@/, '') || pathName;
    const displayName = lines.find((line) => line.replace(/^@/, '').toLowerCase() !== String(username).toLowerCase()) || username;
    return { index, username, displayName, lines };
  }));
  const seen = new Set();
  return raw.filter((candidate) => {
    const matches = candidate.username?.toLowerCase().includes(needle) || candidate.displayName?.toLowerCase().includes(needle);
    const key = `${candidate.username}|${candidate.displayName}`.toLowerCase();
    if (!matches || seen.has(key)) return false; seen.add(key); return true;
  });
}

export async function searchInstagramWebRecipients(query, options = {}) {
  if (options.instagramWebSearchAdapter) return options.instagramWebSearchAdapter(query);
  const page = await instagramPage(options); const { dialog, search } = await openRecipientPicker(page);
  await search.fill(String(query || '').trim().replace(/^@/, ''));
  await page.waitForTimeout(options.searchDelayMs || 1000);
  const candidates = await visibleCandidates(dialog, query);
  return candidates.map((candidate) => ({ platform: 'instagram', platformIdentity: encodeIdentity(candidate), username: candidate.username || null, displayName: candidate.displayName || candidate.username, index: candidate.index, resolutionSource: 'instagram_web_search', disambiguationMetadata: candidate.username ? `@${candidate.username}` : null }));
}

export async function sendInstagramWeb({ target, message } = {}, options = {}) {
  if (options.instagramWebAdapter) return options.instagramWebAdapter({ target, message });
  const identity = decodeIdentity(target); const text = String(message || '').trim();
  if (!identity) throw instagramError('INSTAGRAM_RECIPIENT_NOT_FOUND', 'Instagram browser recipient identity is invalid.');
  if (!text) throw instagramError('INVALID_ARGUMENTS', 'A message is required.');
  const page = await instagramPage(options); const { dialog, search } = await openRecipientPicker(page);
  await search.fill(identity.username || identity.displayName); await page.waitForTimeout(options.searchDelayMs || 1000);
  const candidates = await visibleCandidates(dialog, identity.username || identity.displayName);
  const selected = candidates.find((candidate) => identity.username && candidate.username?.toLowerCase() === identity.username.toLowerCase()) || candidates[identity.index];
  if (!selected) throw instagramError('INSTAGRAM_RECIPIENT_NOT_FOUND', 'The selected Instagram recipient is no longer present in search results.');
  const row = dialog.locator('[role="button"]:visible').nth(selected.index); await row.click();
  const proceed = dialog.getByRole('button', { name: /chat|next/i }).last();
  await proceed.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw instagramError('INSTAGRAM_SEND_FAILED', 'Instagram did not enable the conversation action for the selected recipient.'); });
  await proceed.click();
  const composer = page.getByRole('textbox', { name: /message/i }).last().or(page.locator('[contenteditable="true"][role="textbox"]').last());
  await composer.waitFor({ state: 'visible', timeout: 20000 }).catch(() => { throw instagramError('INSTAGRAM_SEND_FAILED', 'Instagram message composer could not be located.'); });
  const before = await page.getByText(text, { exact: true }).count(); await composer.fill(text); await composer.press('Enter');
  await page.waitForFunction(({ expected, prior }) => {
    const matches = [...document.querySelectorAll('div, span')].filter((node) => node.children.length === 0 && node.textContent?.trim() === expected);
    return matches.length > prior;
  }, { expected: text, prior: before }, { timeout: 15000 }).catch(() => { throw instagramError('INSTAGRAM_SEND_UNVERIFIED', 'Instagram did not show a new outgoing message matching the frozen text.'); });
  return { success: true, verified: true, acknowledged: true, provider: 'instagram-web', recipient: identity.username || identity.displayName, outgoingText: text, deliveryStatus: 'sent', url: page.url() };
}
