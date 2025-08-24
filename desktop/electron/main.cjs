// electron/main.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.VITE_DEV === '1';
let win;

function createWindow () {
    win = new BrowserWindow({
        width: 1280, height: 800,
        fullscreen: true,
        frame: false,
        backgroundColor: '#000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    if (isDev) win.loadURL('http://localhost:5173');
    else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('app:quit', () => app.quit());
