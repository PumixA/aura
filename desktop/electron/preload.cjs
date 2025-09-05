// Preload minimal, sans 'fs' ni 'path'.
// On expose juste un namespace vide pour éviter window.electron === undefined.
// (Toute la config sera lue via import.meta.env côté React.)
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    ping: () => 'pong',
});
