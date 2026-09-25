export function createWindowsClipboard() {
  const unavailable = async () => { throw Object.assign(new Error('Windows clipboard provider is not installed'), { code: 'CAPABILITY_UNAVAILABLE' }); };
  return { read: unavailable, write: unavailable };
}
