/**
 * Resilient stream write and end helpers.
 * Prevents unhandled EPIPE, ECONNRESET, and ERR_STREAM_WRITE_AFTER_END crashes
 * when writing to closed sockets or aborted client HTTP streams.
 */

export function safeWrite(stream, chunk) {
  if (!stream || stream.writableEnded || stream.destroyed) return false;
  try {
    return stream.write(chunk);
  } catch (err) {
    if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET' && err.code !== 'ERR_STREAM_WRITE_AFTER_END') {
      console.warn('[stream] safeWrite error:', err.message);
    }
    return false;
  }
}

export function safeEnd(stream, chunk) {
  if (!stream || stream.writableEnded || stream.destroyed) return false;
  try {
    if (chunk !== undefined) {
      stream.end(chunk);
    } else {
      stream.end();
    }
    return true;
  } catch (err) {
    if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET' && err.code !== 'ERR_STREAM_WRITE_AFTER_END') {
      console.warn('[stream] safeEnd error:', err.message);
    }
    return false;
  }
}
