// Loaded for one request by the KWin scripting API. Commands come from the
// process-local D-Bus bridge; this script never evaluates caller-supplied JS.
const SERVICE = 'org.aegis.Jarvis.WindowBridge';
const PATH = '/org/aegis/Jarvis/WindowBridge';
const IFACE = 'org.aegis.Jarvis.WindowBridge';

function describe(window) {
  if (!window) return null;
  const id = String(window.internalId || '').replace(/[{}]/g, '').toLowerCase();
  return {
    windowId: id,
    appId: String(window.desktopFileName || window.resourceClass || ''),
    processId: Number(window.pid || 0) || null,
    title: String(window.caption || ''),
    workspace: window.onAllDesktops ? 'all' : (window.desktops && window.desktops.length ? String(window.desktops[0].name || window.desktops[0].id || '') : null),
    focused: Boolean(window.active),
    minimized: Boolean(window.minimized),
    maximized: typeof window.maximizeMode === 'number' ? window.maximizeMode === 3 : null,
    sensitive: /(?:^|[.\s_-])(konsole|terminal|xterm|kitty|alacritty|gnome-terminal|org\.kde\.systemsettings)(?:$|[.\s_-])/i.test(String(window.desktopFileName || window.resourceClass || '')) || /password|authentication|authorize|privilege|polkit|sudo/i.test(String(window.caption || '')),
  };
}

let requestId = null;
function report(result) {
  result.requestId = requestId;
  callDBus(SERVICE, PATH, IFACE, 'Report', JSON.stringify(result));
}

callDBus(SERVICE, PATH, IFACE, 'GetCommand', function (raw) {
  let command;
  try { command = JSON.parse(String(raw)); } catch (error) { report({ ok: false, code: 'WINDOW_BACKEND_ERROR', message: String(error) }); return; }
  requestId = command.requestId;
  try {
    const windows = workspace.windowList().filter((window) => window.managed && !window.deleted && !window.specialWindow && !window.skipTaskbar);
    if (command.action === 'list') { report({ ok: true, windows: windows.map(describe) }); return; }
    if (command.action === 'active') { report({ ok: true, window: describe(workspace.activeWindow) }); return; }
    const matches = windows.filter((window) => describe(window).windowId === command.windowId);
    if (matches.length !== 1) { report({ ok: false, code: 'WINDOW_NOT_FOUND', message: 'The exact window is no longer available' }); return; }
    const window = matches[0];
    if (command.action === 'focus') {
      if (!window.wantsInput) { report({ ok: false, code: 'WINDOW_FOCUS_FAILED', message: 'Window cannot receive input focus' }); return; }
      window.minimized = false;
      workspace.activeWindow = window;
    } else if (command.action === 'minimize') {
      if (!window.minimizable) { report({ ok: false, code: 'WINDOW_OPERATION_UNSUPPORTED', message: 'Window cannot be minimized' }); return; }
      window.minimized = true;
    } else if (command.action === 'maximize' || command.action === 'restore') {
      if (!window.maximizable) { report({ ok: false, code: 'WINDOW_OPERATION_UNSUPPORTED', message: 'Window cannot be maximized' }); return; }
      window.setMaximize(command.action === 'maximize', command.action === 'maximize');
      if (command.action === 'restore') window.minimized = false;
    } else if (command.action === 'close') {
      if (!window.closeable) { report({ ok: false, code: 'WINDOW_OPERATION_UNSUPPORTED', message: 'Window cannot be closed' }); return; }
      window.closeWindow();
    } else { report({ ok: false, code: 'WINDOW_OPERATION_UNSUPPORTED', message: 'Unsupported KWin action' }); return; }
    report({ ok: true, window: describe(window), active: describe(workspace.activeWindow) });
  } catch (error) { report({ ok: false, code: 'WINDOW_BACKEND_ERROR', message: String(error) }); }
});
