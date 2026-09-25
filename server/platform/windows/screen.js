export function createWindowsScreen() {
  return {
    async capture() {
      throw Object.assign(new Error('Windows desktop capture provider is not installed'), { code: 'SCREEN_UNAVAILABLE' });
    },
  };
}
