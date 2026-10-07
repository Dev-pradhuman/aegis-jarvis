export async function ingestImage(buffer, options = {}) {
  const { maxDimension = 1024, maxBytes = 5 * 1024 * 1024 } = options;

  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }

  // Enforce byte cap
  if (buffer.length > maxBytes) {
    throw new Error(`Image size exceeds maximum allowed size of ${maxBytes} bytes`);
  }

  // Validate type (mock implementation)
  const isJpeg = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

  if (!isJpeg && !isPng) {
    throw new Error('Unsupported image format. Only JPEG and PNG are allowed.');
  }

  // Mock strip EXIF and downscale by just returning the buffer for now.
  let processedBuffer = buffer;

  return {
    buffer: processedBuffer,
    mimeType: isJpeg ? 'image/jpeg' : 'image/png'
  };
}
