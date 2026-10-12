const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  saveFile: (kind, defaultName, content) => ipcRenderer.invoke('file:save', { kind, defaultName, content }),
  openProject: () => ipcRenderer.invoke('file:open'),
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  previewInBrowser: (html) => ipcRenderer.invoke('shell:preview', html),
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    setSettings: (patch) => ipcRenderer.invoke('ai:setSettings', patch),
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
    cancel: () => ipcRenderer.invoke('ai:cancel'),
    /** @param {(progress: {tokens: number}) => void} callback */
    onProgress: (callback) => ipcRenderer.on('ai:progress', (_event, progress) => callback(progress)),
  },
});
