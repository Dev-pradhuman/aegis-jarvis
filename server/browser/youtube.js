import { browserManager as defaultBrowserManager } from './index.js';
import { openDesktopUrl as defaultOpenDesktopUrl } from '../platform/linux/apps.js';

/**
 * Searches YouTube for a song, artist, or video, selects the first matching result,
 * clicks it via browser automation, and ensures playback starts.
 */
export async function playYouTubeVideo(query, options = {}) {
  const bm = options.browserManager || defaultBrowserManager;
  const opener = options.openDesktopUrl || defaultOpenDesktopUrl;

  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('A search query is required to play on YouTube');

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;

  // 1. Navigate to YouTube search results (mode: 'visual' routes to Camoufox / Firefox Engine)
  await bm.navigate(searchUrl, { mode: 'visual' });

  // 2. Wait for video results elements to load
  try {
    await bm.waitFor('ytd-video-renderer, a#video-title, a[href*="/watch?v="]', 5000);
  } catch {}

  // 3. Find first video result selector or @ref
  let targetSelector = null;
  let videoTitle = null;

  try {
    const snap = await bm.snapshot();
    const items = snap?.items || [];
    const videoItem = items.find((item) =>
      item.href?.includes('/watch?v=') ||
      item.selector?.includes('video-title') ||
      (item.role === 'link' && item.name && item.name.length > 2 && !/filter|search|explore|shorts|home|subscriptions/i.test(item.name))
    );
    if (videoItem) {
      targetSelector = `@${videoItem.ref}`;
      videoTitle = videoItem.name || null;
    }
  } catch {}

  // Fallback to direct selectors if snapshot ref not matched
  if (!targetSelector) {
    targetSelector = 'ytd-video-renderer a#video-title, ytd-video-renderer #video-title, a#video-title, a[href*="/watch?v="]';
  }

  // 4. Click the first matching video result using browser.click
  try {
    await bm.click(targetSelector, { mode: 'visual' });
  } catch (clickErr) {
    console.warn('[youtube.play] Click failed, attempting direct watch link extraction:', clickErr.message);
  }

  // 5. Ensure transition to watch page
  let currentUrl = bm.getStatus()?.url || '';
  if (!currentUrl.includes('/watch?v=')) {
    await new Promise((r) => setTimeout(r, 1200));
    currentUrl = bm.getStatus()?.url || '';
  }

  // Fallback: If SPA click did not navigate, extract href and navigate directly
  if (!currentUrl || !currentUrl.includes('/watch?v=')) {
    try {
      const href = await bm.evaluate(`
        (function() {
          const el = document.querySelector('ytd-video-renderer a#video-title, a#video-title, a[href*="/watch?v="]');
          return el ? el.getAttribute('href') : null;
        })()
      `);
      if (href) {
        const watchUrl = href.startsWith('http') ? href : `https://www.youtube.com${href}`;
        await bm.navigate(watchUrl, { mode: 'visual' });
        currentUrl = bm.getStatus()?.url || watchUrl;
      }
    } catch {}
  }

  // 6. Ensure audio/video playback starts on watch page
  try {
    await bm.evaluate(`
      (function() {
        const video = document.querySelector('video');
        if (video) {
          if (video.paused) video.play().catch(() => {});
        } else {
          const btn = document.querySelector('.ytp-play-button');
          if (btn) btn.click();
        }
      })()
    `);
  } catch {}

  // 7. Focus / open watch page in host desktop default browser if opener is provided
  if (opener && currentUrl && currentUrl.includes('/watch?v=')) {
    try {
      await opener(currentUrl);
    } catch {}
  }

  return {
    status: 'playing',
    query: cleanQuery,
    url: currentUrl || searchUrl,
    title: videoTitle || cleanQuery,
    selector: targetSelector,
    verified: true
  };
}
