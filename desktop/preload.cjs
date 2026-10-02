const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hrms', {
  state: () => ipcRenderer.invoke('state'),
  refresh: () => ipcRenderer.invoke('refresh'),
  openAttendance: () => ipcRenderer.invoke('open-attendance'),
  openPermissions: () => ipcRenderer.invoke('open-permissions'),
  restart: () => ipcRenderer.invoke('restart'),
  pair: (url, code) => ipcRenderer.invoke('pair', url, code),
  screens: () => ipcRenderer.invoke('screens'),
  start: (screen, consent) => ipcRenderer.invoke('start', screen, consent),
  stop: () => ipcRenderer.invoke('stop'),
  forget: () => ipcRenderer.invoke('forget'),
  onState: (listener) => ipcRenderer.on('state', (_event, value) => listener(value)),
});
