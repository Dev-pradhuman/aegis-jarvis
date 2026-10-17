import fs from 'node:fs';
import path from 'node:path';
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

  const headers = {
    'content-type': contentType,
    'content-length': stat.size,
    'cache-control': isHtml ? 'no-cache' : isImmutableAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  };

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    safeEnd(res);
    return true;
  }

  const stream = fs.createReadStream(targetPath);
  stream.on('data', (chunk) => {
    if (!safeWrite(res, chunk)) {
      stream.destroy();
    }
  });
  stream.on('error', (err) => {
    if (err.code !== 'ENOENT' && err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
      console.warn('[static] stream error:', err.message);
    }
    safeEnd(res);
  });
  stream.on('end', () => {
    safeEnd(res);
  });
  return true;
}
