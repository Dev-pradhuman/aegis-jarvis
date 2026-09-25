export function createWindowsMedia() {
  const unavailable = async () => ({ status: 'unavailable', reason: 'Windows media provider is not installed', verified: false });
  return { listPlayers: async () => [], status: unavailable, play: unavailable, pause: unavailable, toggle: unavailable, next: unavailable, previous: unavailable };
}
