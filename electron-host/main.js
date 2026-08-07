const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let inputHelper;

function getPhysicalDisplayBounds(display) {
  const { x, y, width, height } = display.bounds;
  if (process.platform === 'win32' && typeof screen.dipToScreenPoint === 'function') {
    const topLeft = screen.dipToScreenPoint({ x, y });
    const bottomRight = screen.dipToScreenPoint({ x: x + width, y: y + height });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }
  return { x, y, width, height };
}

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
  const displays = screen.getAllDisplays();
  return sources.map((source) => {
    let display = displays.find((item) => String(item.id) === String(source.display_id));
    // Some Electron/Windows combinations omit display_id. Screen sources use
    // screen:<index>:<...>, so use that index as a reliable fallback.
    const sourceMatch = /^screen:(\d+):/.exec(source.id);
    if (!display && sourceMatch) display = displays[Number(sourceMatch[1])];
    if (!display && sourceMatch) display = screen.getPrimaryDisplay();
    return {
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      bounds: display ? getPhysicalDisplayBounds(display) : null,
    };
  });
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

ipcMain.on('set-input-bounds', (_event, bounds) => {
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return;
  const helper = ensureInputHelper();
  if (helper.stdin?.writable) helper.stdin.write(`${JSON.stringify({ type: 'configure-display', payload: bounds })}\n`);
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
