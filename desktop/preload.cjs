const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisDesktop', {
  setIslandState: (state) => ipcRenderer.send('jarvis:island-state', state),
});
