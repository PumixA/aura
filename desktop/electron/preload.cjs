// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aura', {
    quit: () => ipcRenderer.invoke('app:quit'),
    env: {
        API_URL: process.env.VITE_API_URL || '',
        DEV: process.env.VITE_DEV === '1'
    }
});
