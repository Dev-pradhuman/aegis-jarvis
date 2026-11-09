import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { safeWrite, safeEnd } from './streamUtils.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
};

const defaultDistDir = fileURLToPath(new URL('../dist', import.meta.url));

/**
 * Serves production static files from dist/ with path traversal protection,
 * MIME headers, caching rules, and SPA fallback to index.html for client routes.
 */
export async function serveStatic(req, res, url, distDir = defaultDistDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  // Never serve static files for API routes
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
    return false;
  }

  // Traversal protection across both raw req.url and parsed pathname
  const rawUrl = String(req?.url || '');
  const decodedPath = decodeURIComponent(url.pathname);
  if (rawUrl.includes('..') || /%2e%2e/i.test(rawUrl) || decodedPath.includes('..') || decodedPath.includes('\0')) {
    res.writeHead(403, { 'content-type': 'application/json' });
    safeEnd(res, JSON.stringify({ error: 'Forbidden' }));
    return true;
  }

  const relativePath = path.normalize(decodedPath).replace(/^[/\\]+/, '');
  const resolvedDist = path.resolve(distDir);
  let targetPath = path.resolve(resolvedDist, relativePath);

  // Path traversal guard
  if (!targetPath.startsWith(resolvedDist)) {
    res.writeHead(403, { 'content-type': 'application/json' });
    safeEnd(res, JSON.stringify({ error: 'Forbidden' }));
    return true;
  }

  let stat = await fs.promises.stat(targetPath).catch(() => null);

  // If path is a directory, look for index.html inside
  if (stat?.isDirectory()) {
    targetPath = path.join(targetPath, 'index.html');
    stat = await fs.promises.stat(targetPath).catch(() => null);
  }

  // Fallback to public/ directory if not found in dist/
  if (!stat || !stat.isFile()) {
    const defaultPublicDir = fileURLToPath(new URL('../public', import.meta.url));
    const publicTargetPath = path.resolve(defaultPublicDir, relativePath);
    if (publicTargetPath.startsWith(path.resolve(defaultPublicDir))) {
      const pubStat = await fs.promises.stat(publicTargetPath).catch(() => null);
      if (pubStat?.isFile()) {
        targetPath = publicTargetPath;
        stat = pubStat;
      }
    }
  }

  // If file does not exist:
  if (!stat || !stat.isFile()) {
    // If it is an explicit asset or has a file extension, do not fallback to index.html
    if (url.pathname.startsWith('/assets/') || path.extname(relativePath)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      safeEnd(res, JSON.stringify({ error: 'Asset not found' }));
      return true;
    }
    // Fallback to dist/index.html for SPA routes (e.g., /, /?mode=island, /brain, /galaxy)
    targetPath = path.join(resolvedDist, 'index.html');
    stat = await fs.promises.stat(targetPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      return false;
    }
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  const isImmutableAsset = relativePath.startsWith('assets/') || relativePath.startsWith('assets\\');

  // Handle Range requests for video/audio streaming
  const range = req.headers?.range;
  if (range && stat.size > 0) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end >= stat.size || start > end) {
      res.writeHead(416, {
        'content-range': `bytes */${stat.size}`,
        'content-type': contentType,
      });
      safeEnd(res);
      return true;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'content-range': `bytes ${start}-${end}/${stat.size}`,
      'accept-ranges': 'bytes',
      'content-length': chunkSize,
      'content-type': contentType,
      'cache-control': isHtml ? 'no-cache' : isImmutableAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    });

    if (req.method === 'HEAD') {
      safeEnd(res);
      return true;
    }

    const stream = fs.createReadStream(targetPath, { start, end });
    if (typeof res.on === 'function') {
      pipeline(stream, res, (err) => {
        if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          console.warn('[static] stream error:', err.message);
        }
      });
    } else {
      stream.on('data', (chunk) => {
        safeWrite(res, chunk);
      });
      stream.on('end', () => {
        safeEnd(res);
      });
      stream.on('error', (err) => {
        if (err.code !== 'ENOENT' && err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          console.warn('[static] stream error:', err.message);
        }
        safeEnd(res);
      });
    }
    return true;
  }

  const headers = {
    'content-type': contentType,
    'content-length': stat.size,
    'accept-ranges': 'bytes',
    'cache-control': isHtml ? 'no-cache' : isImmutableAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  };

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    safeEnd(res);
    return true;
  }

  const stream = fs.createReadStream(targetPath);
  if (typeof res.on === 'function') {
    pipeline(stream, res, (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
        console.warn('[static] stream error:', err.message);
      }
    });
  } else {
    stream.on('data', (chunk) => {
      safeWrite(res, chunk);
    });
    stream.on('end', () => {
      safeEnd(res);
    });
    stream.on('error', (err) => {
      if (err.code !== 'ENOENT' && err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
        console.warn('[static] stream error:', err.message);
      }
      safeEnd(res);
    });
  }
  return true;
}
