import { browserContext } from './browserAutomation.js';

function whatsappError(code, message) { return Object.assign(new Error(message), { code }); }
const normalizePhone = (value) => String(value || '').replace(/[^0-9]/g, '');

async function whatsappPage(options = {}) {
  const context = await browserContext({ ...options, profileName: options.profileName || 'whatsapp', headless: options.headless ?? true });
  const page = context.pages().find((item) => /web\.whatsapp\.com/i.test(item.url())) || await context.newPage();
  if (!/web\.whatsapp\.com/i.test(page.url())) await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 30000 });
  await page.waitForTimeout(1000);
  if (/login|landing/i.test(page.url()) || await page.getByText(/use whatsapp on your computer|log in|link with phone number|scan.*qr/i).count() || await page.locator('canvas[aria-label*="QR" i], [data-ref]').count()) throw whatsappError('WHATSAPP_AUTH_REQUIRED', 'WhatsApp Web login is required. Open Settings → Connections → WhatsApp sign-in and scan the QR code.');
  return page;
}

async function searchBox(page) {
  const candidates = [page.getByRole('textbox', { name: /search/i }).first(), page.locator('[contenteditable="true"][data-tab="3"]').first(), page.locator('[contenteditable="true"][role="textbox"]').first()];
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const candidate of candidates) if (await candidate.count() && await candidate.isVisible().catch(() => false)) return candidate;
    if (await page.getByText(/use whatsapp on your computer|log in|link with phone number|scan.*qr/i).count() || await page.locator('canvas[aria-label*="QR" i], [data-ref]').count()) throw whatsappError('WHATSAPP_AUTH_REQUIRED', 'WhatsApp Web login is required. Open Settings → Connections → WhatsApp sign-in and scan the QR code.');
    await page.waitForTimeout(250);
  }
  throw whatsappError('WHATSAPP_SEARCH_FAILED', 'WhatsApp Web search could not be located.');
}

const encodeIdentity = (candidate) => `whatsapp-search:${Buffer.from(JSON.stringify({ displayName: candidate.displayName, index: candidate.index })).toString('base64url')}`;
function decodeIdentity(value) { if (!String(value || '').startsWith('whatsapp-search:')) return null; try { return JSON.parse(Buffer.from(String(value).slice(16), 'base64url').toString('utf8')); } catch { return null; } }

async function visibleNamedResults(page, requested) {
  const nodes = page.locator('span[title]:visible'); const count = Math.min(await nodes.count(), 80); const needle = String(requested || '').trim().toLocaleLowerCase(); const results = [];
  for (let index = 0; index < count; index += 1) {
    const node = nodes.nth(index); const title = String(await node.getAttribute('title') || '').trim();
    if (!title || !title.toLocaleLowerCase().includes(needle)) continue;
    const row = node.locator('xpath=ancestor::*[@role="listitem" or @tabindex][1]'); if (!await row.count()) continue;
    const text = String(await row.innerText().catch(() => title)).trim();
    const secondary = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).filter((item) => item !== title).slice(0, 2).join(' · ');
    results.push({ displayName: title, username: null, index: results.length, row, disambiguationMetadata: secondary || null });
  }
  return results;
}

export async function searchWhatsAppRecipients(query, options = {}) {
  if (options.searchAdapter) return options.searchAdapter(query);
  const page = await whatsappPage(options); const box = await searchBox(page);
  await box.fill(''); await box.fill(String(query || '').trim()); await page.waitForTimeout(options.searchDelayMs || 900);
  const results = await visibleNamedResults(page, query);
  return results.map(({ row, ...candidate }) => ({ ...candidate, platform: 'whatsapp', platformIdentity: encodeIdentity(candidate), resolutionSource: 'whatsapp_web_search' }));
}

async function openSearchIdentity(page, identity, options = {}) {
  const decoded = decodeIdentity(identity); if (!decoded) return false;
  const box = await searchBox(page); await box.fill(''); await box.fill(decoded.displayName); await page.waitForTimeout(options.searchDelayMs || 900);
  const selected = (await visibleNamedResults(page, decoded.displayName))[decoded.index];
  if (!selected || selected.displayName !== decoded.displayName) throw whatsappError('WHATSAPP_RECIPIENT_NOT_FOUND', `WhatsApp recipient “${decoded.displayName}” is no longer available in search results.`);
  await selected.row.click(); return true;
}

export async function sendWhatsAppWeb({ target, message } = {}, options = {}) {
  if (options.adapter) return options.adapter({ target, message });
  const phone = normalizePhone(target);
  const searchIdentity = decodeIdentity(target);
  if (!searchIdentity && (phone.length < 8 || phone.length > 15)) throw whatsappError('WHATSAPP_RECIPIENT_NOT_FOUND', 'WhatsApp recipient identity is invalid.');
  const text = String(message || '').trim();
  if (!text) throw whatsappError('INVALID_ARGUMENTS', 'A message is required.');
  const page = await whatsappPage(options);
  if (searchIdentity) await openSearchIdentity(page, target, options);
  else await page.goto(`https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}`, { waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 30000 });
  const composer = page.locator('[contenteditable="true"][role="textbox"]').last();
  await composer.waitFor({ state: 'visible', timeout: 30000 }).catch(() => { throw whatsappError('WHATSAPP_COMPOSER_NOT_FOUND', 'WhatsApp message composer did not become available.'); });
  await composer.fill(text);
  const before = await page.locator('.message-out').count();
  await composer.press('Enter');
  const outgoing = page.locator('.message-out').filter({ hasText: text }).last();
  await outgoing.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw whatsappError('WHATSAPP_SEND_UNVERIFIED', 'WhatsApp did not show a matching outgoing message.'); });
  const after = await page.locator('.message-out').count(); const outgoingText = String(await outgoing.innerText()).trim();
  if (after <= before || !outgoingText.includes(text)) throw whatsappError('WHATSAPP_SEND_UNVERIFIED', 'WhatsApp outgoing message could not be verified against the frozen text.');
  return { success: true, verified: true, acknowledged: true, provider: 'whatsapp-web', messageId: await outgoing.getAttribute('data-id'), recipient: searchIdentity?.displayName || phone, outgoingText: text, deliveryStatus: 'sent', url: page.url() };
}
