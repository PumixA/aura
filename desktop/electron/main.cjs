const { app, BrowserWindow } = require("electron");
const path = require("path");

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: true,              // ⬅️ direct plein écran
        autoHideMenuBar: true,         // ⬅️ masque la barre de menu
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const devServer = process.env.VITE_DEV_SERVER_URL;

    if (devServer) {
        win.loadURL(devServer);
        win.webContents.openDevTools(); // facultatif en dev
    } else {
        win.loadFile(path.join(__dirname, "../dist/index.html"));
    }

    win.on("closed", () => {
        win = null;
    });
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    if (win === null) createWindow();
});
