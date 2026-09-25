export function createWindowsAudio() {
  const unavailable = () => { throw Object.assign(new Error('Windows system audio provider is not installed'), { code: 'CAPABILITY_UNAVAILABLE' }); };
  return { getVolume: unavailable, setVolume: unavailable, setMuted: unavailable, volumeUp: unavailable, volumeDown: unavailable };
}
