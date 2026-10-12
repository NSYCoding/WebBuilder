const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  saveFile: (kind, defaultName, content) => ipcRenderer.invoke('file:save', { kind, defaultName, content }),
  openProject: () => ipcRenderer.invoke('file:open'),
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  previewInBrowser: (html) => ipcRenderer.invoke('shell:preview', html),
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    setKey: (key) => ipcRenderer.invoke('ai:setKey', key),
    clearKey: () => ipcRenderer.invoke('ai:clearKey'),
    setModel: (modelId) => ipcRenderer.invoke('ai:setModel', modelId),
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  },
});
