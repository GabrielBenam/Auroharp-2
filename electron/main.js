// Envoltorio de escritorio (Windows) para Autoarpa Lab.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function create() {
  const win = new BrowserWindow({
    width: 1320, height: 900, minWidth: 380, minHeight: 600,
    backgroundColor: '#17130f', title: 'Autoarpa Lab', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}
app.whenReady().then(create);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) create(); });
