import { browserAction, browserContext } from './browserAutomation.js';

function youtubeError(code, message) { return Object.assign(new Error(message), { code }); }

const words = (value) => String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
export function scoreYouTubeResult(result, query) {
  const queryWords = new Set(words(query)); const titleWords = new Set(words(result.title));
  const overlap = [...queryWords].filter((word) => titleWords.has(word)).length / Math.max(1, queryWords.size);
  let score = overlap * 20;
  const normalizedQuery = words(query).join(' '); const normalizedTitle = words(result.title).join(' ');
  if (normalizedTitle === normalizedQuery) score += 10;
  else if (normalizedTitle.startsWith(normalizedQuery)) score += 4;
  if (/\/watch\?v=/.test(result.href || '')) score += 8;
  if (/official|topic|vevo|provided to youtube/i.test(`${result.title} ${result.channel || ''}`)) score += 4;
  if (/shorts|playlist|reaction|cover|tribute|tutorial|karaoke|remix/i.test(`${result.href} ${result.title}`)) score -= 8;
  if (!/\blive\b/i.test(query) && /\blive\b/i.test(result.title || '')) score -= 5;
  if (/^ad$/i.test(result.badge || '')) score -= 20;
  return score;
}

async function dismissCommonOverlays(page) {
  for (const name of [/accept all/i, /reject all/i, /no thanks/i, /not now/i]) {
    const button = page.getByRole('button', { name }).first();
    if (await button.count() && await button.isVisible().catch(() => false)) await button.click().catch(() => {});
  }
}

async function selectYouTubeResult(page, query, service) {
  const locator = service === 'youtube_music' ? page.locator('a[href*="watch?v="]:visible') : page.locator('a#video-title[href*="watch?v="]:visible');
  await locator.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => { throw youtubeError('YOUTUBE_RESULT_NOT_FOUND', `No playable result was found for “${query}”.`); });
  // Keep extraction to one browser round-trip. Sequential DOM calls made the
  // richer YouTube Music results page exceed the canonical tool timeout.
  const candidates = await locator.evaluateAll((elements) => elements.slice(0, 30).map((item, index) => {
    const href = item.getAttribute('href') || '';
    const title = (item.getAttribute('title') || item.textContent || '').trim();
    const container = item.closest('ytd-video-renderer, ytmusic-responsive-list-item-renderer');
    return { index, href, title, channel: (container?.textContent || '').trim().slice(0, 300) };
  }).filter((item) => item.href && item.title && !item.href.includes('/shorts/')));
  const selected = candidates.sort((left, right) => scoreYouTubeResult(right, query) - scoreYouTubeResult(left, query))[0];
  if (!selected || scoreYouTubeResult(selected, query) < 10) throw youtubeError('YOUTUBE_RESULT_NOT_FOUND', `No sufficiently relevant normal video result was found for “${query}”.`);
  return selected;
}

async function verifyPlayback(page, video, options = {}) {
  const initial = await video.evaluate((element) => Number(element.currentTime || 0));
  await video.evaluate((element) => element.play()).catch(() => {});
  try {
    await page.waitForFunction(({ start }) => { const media = document.querySelector('video'); return Boolean(media && !media.paused && media.readyState >= 2 && media.currentTime > start + 0.2); }, { start: initial }, { timeout: options.playbackTimeout || 10000 });
  } catch {
    const play = page.getByRole('button', { name: /play/i }).first();
    if (await play.count() && await play.isVisible().catch(() => false)) await play.click().catch(() => {}); else await video.click({ position: { x: 20, y: 20 } }).catch(() => {});
    await page.waitForFunction(({ start }) => { const media = document.querySelector('video'); return Boolean(media && !media.paused && media.readyState >= 2 && media.currentTime > start + 0.2); }, { start: initial }, { timeout: options.playbackTimeout || 10000 }).catch(() => { throw youtubeError('YOUTUBE_PLAYBACK_UNVERIFIED', 'YouTube opened the watch page, but playback did not begin. Autoplay, consent, or an account restriction may be blocking it.'); });
  }
  return video.evaluate((element) => ({ paused: element.paused, currentTime: element.currentTime, readyState: element.readyState, ended: element.ended }));
}

export function normalizeMediaIntent(input = {}) {
  const service = String(input.service || 'youtube').toLowerCase().replace(/\s+/g, '_');
  if (!['youtube', 'youtube_music'].includes(service)) throw youtubeError('INVALID_ARGUMENTS', `Unsupported media service: ${service}`);
  return { service, query: String(input.query || '').trim(), action: String(input.action || 'play').toLowerCase() };
}

export async function youtubeAction(action, input = {}, options = {}) {
  if (options.adapter) return options.adapter(action, normalizeMediaIntent(input));
  const intent = normalizeMediaIntent({ ...input, action });
  if (!intent.query) throw youtubeError('INVALID_ARGUMENTS', 'A YouTube search query is required.');
  const searchUrl = intent.service === 'youtube_music'
    ? `https://music.youtube.com/search?q=${encodeURIComponent(intent.query)}`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(intent.query)}`;
  if (action === 'search') return browserAction('tabs.open', { url: searchUrl, label: 'YouTube' }, options);
  const context = await browserContext({ ...options, profileName: options.profileName || 'media', headless: false });
  const page = await context.newPage();
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 25000 }).catch(() => { throw youtubeError('YOUTUBE_NAVIGATION_FAILED', 'YouTube search could not be opened.'); });
  await dismissCommonOverlays(page);
  const selected = await selectYouTubeResult(page, intent.query, intent.service);
  await page.goto(new URL(selected.href, page.url()).toString(), { waitUntil: 'domcontentloaded', timeout: options.navigationTimeout || 25000 });
  await page.waitForURL(/youtube\.com\/watch\?v=/, { timeout: 20000 });
  const video = page.locator('video').first();
  await video.waitFor({ state: 'attached', timeout: 15000 });
  const playback = await verifyPlayback(page, video, options);
  return { service: intent.service, query: intent.query, title: selected.title, url: page.url(), playback, verified: /youtube\.com\/watch\?v=/.test(page.url()) && !playback.paused && playback.currentTime > 0 && playback.readyState >= 2 };
}
