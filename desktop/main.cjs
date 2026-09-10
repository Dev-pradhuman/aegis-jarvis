const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = 'http://127.0.0.1:8787';
const RENDERER_URL = process.env.JARVIS_RENDERER_URL || APP_URL;
let mainWindow;
let islandWindow;
let tray;
let quitting = false;
let islandHideTimer;

function applicationRoot() { return app.getAppPath(); }
function appIconPath() { return path.join(applicationRoot(), app.isPackaged ? 'dist' : 'public', 'jarvis-icon.png'); }

async function waitForBackend(timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(`${APP_URL}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('JARVIS backend did not become ready');
}

async function startRuntime() {
  if (app.isPackaged) process.env.JARVIS_DATA_DIR = app.getPath('userData');
  await import(pathToFileURL(path.join(applicationRoot(), 'server', 'start.js')).href);
  await waitForBackend();
  if (process.platform === 'win32') {
    try {
      await fetch(`${APP_URL}/api/voice-os/bridge/start`, { method: 'POST', headers: process.env.JARVIS_AUTH_TOKEN ? { authorization: `Bearer ${process.env.JARVIS_AUTH_TOKEN}` } : {} });
    } catch (error) { console.warn(`Voice OS bridge could not start: ${error.message}`); }
  }
}

function trayImage() {
  const icon = nativeImage.createFromPath(appIconPath());
  if (!icon.isEmpty()) return icon.resize({ width: 16, height: 16 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="10" fill="#111315"/><circle cx="16" cy="16" r="8" fill="#ffb547"/><circle cx="16" cy="16" r="3" fill="#fff1cf"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 });
}

function showWindow() { if (!mainWindow) return; mainWindow.show(); mainWindow.focus(); }

function islandBounds(width = 236, height = 58) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return { x: Math.round(area.x + (area.width - width) / 2), y: area.y + 10, width, height };
}

function createIslandWindow() {
  islandWindow = new BrowserWindow({
    ...islandBounds(),
    transparent: true,
    frame: false,
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  islandWindow.setAlwaysOnTop(true, 'screen-saver');
  islandWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  islandWindow.setIgnoreMouseEvents(true);
  void islandWindow.loadURL(`${RENDERER_URL}/?island=1`);
}

function handleIslandState(event, state = {}) {
  if (!islandWindow || event.sender !== islandWindow.webContents) return;
  clearTimeout(islandHideTimer);
  const mode = String(state.mode || 'idle');
  if (mode === 'idle' && !state.incomingCall && !state.keepVisible) {
    islandHideTimer = setTimeout(() => islandWindow?.hide(), Number(state.hideAfterMs || 180));
    return;
  }
  const transcriptLength = String(state.transcript || state.status || '').length;
  const width = Math.max(220, Math.min(680, 220 + transcriptLength * 4.3));
  const height = transcriptLength > 76 ? 76 : 58;
  islandWindow.setBounds(islandBounds(Math.round(width), height), true);
  islandWindow.setIgnoreMouseEvents(!state.incomingCall);
  islandWindow.showInactive();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#080a0b',
    title: 'A.E.G.I.S. JARVIS',
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
  void mainWindow.loadURL(`${RENDERER_URL}/?desktop=1`);
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('JARVIS Voice OS');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open JARVIS', click: showWindow },
    { label: 'Hide', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Quit JARVIS', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('double-click', showWindow);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('dev.pradhuman.aegis.jarvis');
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(['media', 'microphone', 'notifications'].includes(permission)));
    await startRuntime();
    ipcMain.on('jarvis:island-state', handleIslandState);
    createWindow();
    createIslandWindow();
    createTray();
  }).catch((error) => { console.error(error); app.quit(); });
}
