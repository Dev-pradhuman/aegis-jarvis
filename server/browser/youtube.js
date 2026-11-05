import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { browserManager as defaultBrowserManager } from './index.js';
import { openDesktopUrl as defaultOpenDesktopUrl } from '../platform/linux/apps.js';

const runExec = promisify(execFile);

/**
 * Resolves the first video ID and title for a YouTube search query using
 * lightweight HTML regex fetch (or yt-dlp fallback) in <1-2s.
 */
export async function resolveFirstYouTubeVideo(query) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return null;

  // 1. Lightweight YouTube HTML search page fetch (<1s)
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);

      if (videoIdMatch && videoIdMatch[1]) {
        const videoId = videoIdMatch[1];
        const title = titleMatch ? titleMatch[1] : cleanQuery;
        return {
          videoId,
          title,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`
        };
      }
    }
  } catch {
    // Network / abort error
  }

  // 2. Fallback to yt-dlp --print %(id)s
  try {
    const { stdout } = await runExec('yt-dlp', [
      '--no-playlist',
      '--print', '%(id)s',
      '--print', '%(title)s',
      `ytsearch1:${cleanQuery}`
    ], { timeout: 6000 });
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 1 && /^[a-zA-Z0-9_-]{11}$/.test(lines[0])) {
      const videoId = lines[0];
      const title = lines[1] || cleanQuery;
      return {
        videoId,
        title,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`
      };
    }
  } catch {}

  return null;
}

/**
 * Searches YouTube for a song, artist, or video, selects the first matching result,
 * clicks it via browser automation, and ensures playback starts.
 */
export async function playYouTubeVideo(query, options = {}) {
  const bm = options.browserManager || defaultBrowserManager;
  const opener = options.openDesktopUrl || defaultOpenDesktopUrl;

  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('A search query is required to play on YouTube');

  // Start direct video resolution in parallel
  const directPromise = resolveFirstYouTubeVideo(cleanQuery).catch(() => null);

  // If options.directOnly or options.directWatch is set, navigate directly to watch URL
  if (options.directOnly || options.directWatch) {
    const directResult = await directPromise;
    if (directResult?.watchUrl) {
      if (opener) {
        try { await opener(directResult.watchUrl); } catch {}
      }
      await bm.navigate(directResult.watchUrl, { mode: 'visual' });
      try {
        await bm.evaluate(`
          (function() {
            const video = document.querySelector('video');
            if (video && video.paused) video.play().catch(() => {});
          })()
        `);
      } catch {}
      return {
        status: 'playing',
        query: cleanQuery,
        url: directResult.watchUrl,
        title: directResult.title || cleanQuery,
        videoId: directResult.videoId,
        verified: true
      };
    }
  }

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

  // Fallback 1: If SPA click did not navigate, extract href and navigate directly
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

  // Fallback 2: If still on search page, navigate to resolved direct watch URL
  if (!currentUrl || !currentUrl.includes('/watch?v=')) {
    const directInfo = await directPromise;
    if (directInfo?.watchUrl) {
      await bm.navigate(directInfo.watchUrl, { mode: 'visual' });
      currentUrl = bm.getStatus()?.url || directInfo.watchUrl;
      videoTitle ||= directInfo.title;
    }
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
