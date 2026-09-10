import { useEffect, useState } from 'react';

const STORAGE_KEY = 'aegis-appearance';
export const THEME_PRESETS = Object.freeze({
  'black-amber': { label: 'Black / Amber', accent: '#ff9d00' }, 'black-white': { label: 'Black / White', accent: '#f2f2ed' }, 'black-green': { label: 'Black / Green', accent: '#59e391' }, 'black-purple': { label: 'Black / Purple', accent: '#a978ff' }, 'black-red': { label: 'Black / Red', accent: '#ff625f' }, 'black-cyan': { label: 'Black / Cyan', accent: '#45dce8' }, 'black-blue': { label: 'Black / Blue', accent: '#619cff' }, custom: { label: 'Custom', accent: '#ff9d00' },
});
export const FONT_OPTIONS = ['Rajdhani', 'Inter', 'Segoe UI', 'Arial', 'Georgia', 'Custom'];
const DEFAULTS = { theme: 'black-amber', fontSize: 16, headingScale: 1, labelScale: 1, accent: '#ff9d00', fontFamily: 'Rajdhani', customFontName: '' };

function hexRgb(value) { const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULTS.accent; return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)); }
function fontStack(name) { if (name === 'Custom') return `'Jarvis Custom', 'Segoe UI', sans-serif`; if (name === 'Rajdhani') return `'Rajdhani', 'Segoe UI', sans-serif`; return `'${name}', 'Segoe UI', sans-serif`; }
function openFontDb() { return new Promise((resolve, reject) => { const request = indexedDB.open('aegis-local-assets', 1); request.onupgradeneeded = () => request.result.createObjectStore('assets'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export async function saveCustomFont(file) { if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error('Choose a TTF, OTF, WOFF, or WOFF2 font.'); if (file.size > 4_000_000) throw new Error('Font must be smaller than 4 MB.'); const bytes = await file.arrayBuffer(); const face = new FontFace('Jarvis Custom', bytes); await face.load(); document.fonts.add(face); const db = await openFontDb(); await new Promise((resolve, reject) => { const transaction = db.transaction('assets', 'readwrite'); transaction.objectStore('assets').put({ bytes, name: file.name }, 'custom-font'); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); db.close(); return file.name; }
async function loadCustomFont() { try { const db = await openFontDb(); const value = await new Promise((resolve, reject) => { const request = db.transaction('assets').objectStore('assets').get('custom-font'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close(); if (!value?.bytes) return; const face = new FontFace('Jarvis Custom', value.bytes); await face.load(); document.fonts.add(face); } catch {} }

function applyAppearance(value) {
  const root = document.documentElement; const settings = { ...DEFAULTS, ...value }; const [r, g, b] = hexRgb(settings.accent);
  root.dataset.theme = settings.theme; root.style.setProperty('--ui-font-size', `${Number(settings.fontSize) || 16}px`); root.style.setProperty('--ui-zoom', String((Number(settings.fontSize) || 16) / 16)); root.style.setProperty('--heading-scale', String(settings.headingScale || 1)); root.style.setProperty('--label-scale', String(settings.labelScale || 1)); root.style.setProperty('--font-ui', fontStack(settings.fontFamily));
  for (const name of ['--accent-color', '--orange', '--orange-bright', '--cyan', '--green']) root.style.setProperty(name, settings.accent);
  root.style.setProperty('--accent-rgb', `${r},${g},${b}`); root.style.setProperty('--accent-soft', `rgba(${r},${g},${b},.12)`); root.style.setProperty('--accent-border', `rgba(${r},${g},${b},.34)`); root.style.setProperty('--accent-graph', `rgba(${r},${g},${b},.26)`); root.style.setProperty('--orange-faint', `rgba(${r},${g},${b},.12)`); root.style.setProperty('--border-orange', `rgba(${r},${g},${b},.38)`); root.style.setProperty('--border-orange-soft', `rgba(${r},${g},${b},.18)`); root.style.setProperty('--cyan-dim', `rgba(${r},${g},${b},.35)`);
}

export default function useAppearance() {
  const [appearance, setAppearance] = useState(() => { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); if (saved.theme === 'carbon') saved.theme = 'black-amber'; if (saved.theme === 'midnight') saved.theme = 'black-cyan'; return { ...DEFAULTS, ...saved }; } catch { return DEFAULTS; } });
  useEffect(() => { void loadCustomFont(); }, []);
  useEffect(() => { applyAppearance(appearance); localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance)); }, [appearance]);
  return [appearance, setAppearance];
}

export { DEFAULTS, applyAppearance };
