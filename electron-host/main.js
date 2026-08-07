const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let inputHelper;

function ensureInputHelper() {
  if (inputHelper && !inputHelper.killed) return inputHelper;
  inputHelper = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'input-helper.ps1'),
  ], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
  inputHelper.on('exit', () => { inputHelper = null; });
  return inputHelper;
}

function ensureServer() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/host-info', (res) => {
      res.resume();
      resolve(true);
    });

    req.on('error', () => {
      const serverPath = path.resolve(__dirname, '..');
      const child = spawn(process.execPath, ['server.js'], { cwd: serverPath, stdio: 'ignore' });
      child.on('spawn', () => {
        setTimeout(() => resolve(true), 1200);
      });
      child.on('error', () => resolve(false));
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    title: 'DeskLink Host App',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'host-app.html'));
}

ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], fetchWindowIcons: true, thumbnailSize: { width: 320, height: 180 } });
  return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
});

ipcMain.handle('get-connection-config', () => ({
  // Set DESKLINK_SIGNALING_URL to the public HTTP(S) address of the signaling
  // server, for example https://signal.example.com. The renderer derives /ws.
  signalingUrl: process.env.DESKLINK_SIGNALING_URL || 'http://localhost:3000',
  // Optional JSON array of RTCIceServer objects. A TURN service is required for
  // reliable connections between different networks.
  iceServers: process.env.DESKLINK_ICE_SERVERS || '',
}));

ipcMain.on('inject-input', (_event, message) => {
  if (!message || !['mouse-move', 'mouse-down', 'mouse-up', 'key-down', 'key-up'].includes(message.type)) return;
  const helper = ensureInputHelper();
  if (helper.stdin?.writable) helper.stdin.write(`${JSON.stringify(message)}\n`);
});

app.whenReady().then(async () => {
  await ensureServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (inputHelper && !inputHelper.killed) inputHelper.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
