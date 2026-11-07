import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { ensureLinuxDesktopEnv } from './platform/linux/env.js';

const runExec = promisify(execFile);

/**
 * Checks whether the Spotify desktop client is installed locally.
 */
export function isSpotifyInstalled() {
  if (process.platform !== 'linux') return false;
  try {
    return fs.existsSync('/usr/bin/spotify') ||
           fs.existsSync('/usr/local/bin/spotify') ||
           fs.existsSync('/var/lib/flatpak/exports/bin/com.spotify.Client') ||
           Boolean(execSync('which spotify 2>/dev/null', { stdio: 'pipe' })?.toString().trim());
  } catch {
    return false;
  }
}

/**
 * Verifies and fetches the clean track title using Spotify's public, keyless oEmbed API.
 */
export async function fetchOEmbedTitle(trackId, fallbackTitle, fetchImpl = fetch) {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;
    const res = await fetchImpl(oembedUrl, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
        'Accept': 'application/json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.title) return data.title;
    }
  } catch {}
  return fallbackTitle;
}

/**
 * Resolves a Spotify track ID, URI, URL, and clean title without requiring any API keys.
 */
export async function resolveSpotifyTrack(query, options = {}) {
  const cleanQuery = String(query || '')
    .replace(/^(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis[, ]+)?(?:(?:can|could|would|will)\s+(?:you|u)\s+)?(?:(?:please|pls)\s+)?/i, '')
    .replace(/^(?:play|search\s+and\s+play|listen\s+to|put\s+on|stream)\s+(?:the\s+)?(?:song\s+|track\s+|music\s+)?/i, '')
    .replace(/\s+(?:on|in|via|through)\s+spotify(?:\.com)?$/i, '')
    .trim()
    .replace(/^[":']+|[":']+$/g, '');

  if (!cleanQuery) throw new Error('A search query is required to resolve a Spotify track');

  const fetchImpl = options.fetchImpl || fetch;

  // Direct Spotify URI match (spotify:track:<22-char-id>)
  const directUriMatch = cleanQuery.match(/spotify:track:([a-zA-Z0-9]{22})/);
  if (directUriMatch) {
    const id = directUriMatch[1];
    const title = await fetchOEmbedTitle(id, cleanQuery, fetchImpl);
    return { id, uri: `spotify:track:${id}`, url: `https://open.spotify.com/track/${id}`, title };
  }

  // Direct Spotify URL match (open.spotify.com/track/<22-char-id>)
  const directUrlMatch = cleanQuery.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/);
  if (directUrlMatch) {
    const id = directUrlMatch[1];
    const title = await fetchOEmbedTitle(id, cleanQuery, fetchImpl);
    return { id, uri: `spotify:track:${id}`, url: `https://open.spotify.com/track/${id}`, title };
  }

  let trackId = null;

  // 1. Query Yahoo search (reliable, zero botwall on public queries)
  try {
    const yahooUrl = `https://search.yahoo.com/search?p=open.spotify.com+track+${encodeURIComponent(cleanQuery)}`;
    const res = await fetchImpl(yahooUrl, {
      signal: AbortSignal.timeout(options.timeout || 4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/open\.spotify\.com(?:%2f|\/)track(?:%2f|\/)([a-zA-Z0-9]{22})/i);
      if (match && match[1]) {
        trackId = match[1];
      }
    }
  } catch {}

  // 2. Query DuckDuckGo search fallback
  if (!trackId) {
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=site:open.spotify.com/track+${encodeURIComponent(cleanQuery)}`;
      const res = await fetchImpl(ddgUrl, {
        signal: AbortSignal.timeout(options.timeout || 3500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/i);
        if (match && match[1]) {
          trackId = match[1];
        }
      }
    } catch {}
  }

  if (!trackId) {
    throw new Error(`Could not resolve Spotify track for "${cleanQuery}"`);
  }

  // 3. Verify clean title via Spotify oEmbed
  const title = await fetchOEmbedTitle(trackId, cleanQuery, fetchImpl);

  return {
    id: trackId,
    uri: `spotify:track:${trackId}`,
    url: `https://open.spotify.com/track/${trackId}`,
    title
  };
}

/**
 * Resolves a Spotify track, launches the desktop client via xdg-open/spotify,
 * and triggers playback via playerctl.
 */
export async function playSpotifyTrack(query, options = {}) {
  const track = await resolveSpotifyTrack(query, options);
  ensureLinuxDesktopEnv();

  const runner = options.runExec || runExec;
  let launched = false;

  // 1. Launch/open Spotify with track URI
  try {
    if (options.usePlayerctl) {
      await runner('playerctl', ['-p', 'spotify', 'open', track.uri]);
      launched = true;
    } else {
      await runner('xdg-open', [track.uri], { env: process.env });
      launched = true;
    }
  } catch (err) {
    try {
      await runner('spotify', [`--uri=${track.uri}`], { env: process.env });
      launched = true;
    } catch {}
  }

  // 2. Wait 1000ms for Spotify desktop client to load the track
  const waitMs = options.waitMs ?? 1000;
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }

  // 3. Trigger playback via playerctl
  try {
    await runner('sh', ['-c', 'playerctl -p spotify play || playerctl play'], { env: process.env });
  } catch {}

  return {
    status: 'playing',
    provider: 'spotify',
    track,
    id: track.id,
    uri: track.uri,
    url: track.url,
    title: track.title,
    launched
  };
}
