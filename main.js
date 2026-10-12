const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { registerAiHandlers } = require('./ai');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    title: 'WebBuilder',
    backgroundColor: '#14161a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile('index.html');
  // Never navigate the app window away or open new Electron windows; send links to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

const filters = {
  project: [{ name: 'WebBuilder project', extensions: ['wbproj', 'json'] }],
  html: [{ name: 'HTML page', extensions: ['html'] }],
};

ipcMain.handle('file:save', async (_e, { kind, defaultName, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: filters[kind] });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, String(content), 'utf8');
  return filePath;
});

ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters.project });
  if (canceled || !filePaths[0]) return null;
  return { path: filePaths[0], content: await fs.readFile(filePaths[0], 'utf8') };
});

ipcMain.handle('file:pickImage', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
  });
  if (canceled || !filePaths[0]) return null;
  const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const buf = await fs.readFile(filePaths[0]);
  return `data:${mime};base64,${buf.toString('base64')}`;
});

ipcMain.handle('shell:preview', async (_e, html) => {
  const file = path.join(app.getPath('temp'), 'webbuilder-preview.html');
  await fs.writeFile(file, html, 'utf8');
  await shell.openPath(file);
});

app.whenReady().then(() => {
  registerAiHandlers();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ].filter((m) => process.platform === 'darwin' || m.role !== 'appMenu')));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
