import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (isDev && rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  // Always open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for windows
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.smartaiaudit.client');
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC Handlers
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('app:getPlatform', () => {
  return process.platform;
});

ipcMain.handle('app:getElectronVersion', () => {
  return process.versions.electron;
});

ipcMain.handle('app:getNodeVersion', () => {
  return process.versions.node;
});

// Store management (secure credential storage)
ipcMain.handle('store:get', async (_, key: string) => {
  // TODO: Implement secure storage using electron-store or keytar
  return null;
});

ipcMain.handle('store:set', async (_, key: string, value: any) => {
  // TODO: Implement secure storage
  return true;
});

ipcMain.handle('store:delete', async (_, key: string) => {
  // TODO: Implement secure storage
  return true;
});
