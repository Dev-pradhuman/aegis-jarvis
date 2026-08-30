import { useEffect, useState } from 'react';

const STORAGE_KEY = 'aegis-appearance';
const DEFAULTS = { theme: 'carbon', fontSize: 16, accent: '#ff9d00' };

function applyAppearance(value) {
  const root = document.documentElement;
  const settings = { ...DEFAULTS, ...value };
  root.dataset.theme = settings.theme;
  root.style.setProperty('--ui-font-size', `${Number(settings.fontSize) || DEFAULTS.fontSize}px`);
  root.style.setProperty('--accent-color', settings.accent || DEFAULTS.accent);
  root.style.setProperty('--orange', settings.accent || DEFAULTS.accent);
  root.style.setProperty('--orange-bright', settings.accent || DEFAULTS.accent);
}

export default function useAppearance() {
  const [appearance, setAppearance] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return DEFAULTS; }
  });
  useEffect(() => { applyAppearance(appearance); localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance)); }, [appearance]);
  return [appearance, setAppearance];
}

export { DEFAULTS, applyAppearance };
