import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const FALLBACK_THEME = {
  name: 'caelestia-fallback',
  mode: 'dark',
  background: '#0a0f0f',
  surface: '#0e1514',
  surfaceContainer: '#131b1a',
  surfaceContainerHigh: '#192120',
  primary: '#9bd0cc',
  primaryAccent: '#9bd0cc',
  primaryDim: '#8ec2bf',
  onPrimary: '#0d4845',
  glow: 'rgba(155, 208, 204, 0.45)',
  text: '#dce8e6',
  subtext: '#a2adac',
  outline: '#6d7876',
  outlineVariant: '#3f4a49',
  error: '#fa746f',
  success: '#b5ccba',
  source: 'fallback'
};

function normalizeHex(val, fallback) {
  if (!val || typeof val !== 'string') return fallback;
  const clean = val.trim().replace(/^#/, '');
  return clean ? `#${clean}` : fallback;
}

export async function getCaelestiaTheme(customPath = null) {
  const home = os.homedir();
  const schemePath = customPath || path.join(home, '.local/state/caelestia/scheme.json');
  try {
    const raw = await fs.readFile(schemePath, 'utf8');
    const parsed = JSON.parse(raw);
    const c = parsed.colours || parsed.colors || {};

    const primary = normalizeHex(c.primary, FALLBACK_THEME.primary);
    let glow = FALLBACK_THEME.glow;
    const hexMatch = primary.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (hexMatch) {
      const r = parseInt(hexMatch[1], 16);
      const g = parseInt(hexMatch[2], 16);
      const b = parseInt(hexMatch[3], 16);
      glow = `rgba(${r}, ${g}, ${b}, 0.45)`;
    }

    return {
      name: parsed.name || 'caelestia',
      mode: parsed.mode || 'dark',
      background: normalizeHex(c.background, FALLBACK_THEME.background),
      surface: normalizeHex(c.surface, FALLBACK_THEME.surface),
      surfaceContainer: normalizeHex(c.surfaceContainer, FALLBACK_THEME.surfaceContainer),
      surfaceContainerHigh: normalizeHex(c.surfaceContainerHigh, FALLBACK_THEME.surfaceContainerHigh),
      primary,
      primaryAccent: primary,
      primaryDim: normalizeHex(c.primaryDim, FALLBACK_THEME.primaryDim),
      onPrimary: normalizeHex(c.onPrimary, FALLBACK_THEME.onPrimary),
      text: normalizeHex(c.text || c.onSurface, FALLBACK_THEME.text),
      subtext: normalizeHex(c.subtext1 || c.onSurfaceVariant, FALLBACK_THEME.subtext),
      outline: normalizeHex(c.outline, FALLBACK_THEME.outline),
      outlineVariant: normalizeHex(c.outlineVariant, FALLBACK_THEME.outlineVariant),
      error: normalizeHex(c.error, FALLBACK_THEME.error),
      success: normalizeHex(c.success, FALLBACK_THEME.success),
      glow,
      source: 'caelestia-scheme-json'
    };
  } catch {
    return FALLBACK_THEME;
  }
}
