const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  getConnectionConfig: () => ipcRenderer.invoke('get-connection-config'),
  injectInput: (message) => ipcRenderer.send('inject-input', message),
  setInputBounds: (bounds) => ipcRenderer.send('set-input-bounds', bounds),
  minimizeHost: () => ipcRenderer.send('minimize-host'),
});
