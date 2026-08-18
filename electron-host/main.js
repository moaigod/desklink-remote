const { app, BrowserWindow, desktopCapturer, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let inputHelper;
let tray;
let isQuitting = false;
const launchInBackground = process.argv.includes('--background');
const developerMode = process.argv.includes('--debug') || path.basename(process.execPath).toLowerCase().includes('desklink developer');

if (developerMode) {
  // Keep this build independent from the normal host's single-instance lock
  // and startup preference.
  app.setPath('userData', path.join(app.getPath('appData'), 'DeskLink Developer'));
}

function assetPath(fileName) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'assets', fileName)
    : path.join(__dirname, '..', 'assets', fileName);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(assetPath('desklink-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('DeskLink Host App');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'DeskLink Host App', enabled: false },
    { type: 'separator' },
    { label: 'Open DeskLink', click: showMainWindow },
    {
      label: 'Run when I sign in',
      type: 'checkbox',
      checked: process.platform === 'win32' && app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        if (process.platform === 'win32') {
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--background'] });
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit DeskLink',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on('click', showMainWindow);
}

// Background hosting means the app may not have a visible window. Make a
// second double-click reopen that one instance instead of starting another host.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

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
  const helper = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'input-helper.ps1'),
  ], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  inputHelper = helper;
  helper.stderr.on('data', (data) => console.error(`DeskLink input helper: ${data.toString().trim()}`));
  helper.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') console.error('DeskLink input helper stream error:', error);
    if (inputHelper === helper) inputHelper = null;
  });
  helper.on('error', (error) => {
    console.error('DeskLink input helper failed to start:', error);
    if (inputHelper === helper) inputHelper = null;
  });
  helper.on('exit', () => {
    if (inputHelper === helper) inputHelper = null;
  });
  return helper;
}

function sendToInputHelper(message) {
  const helper = ensureInputHelper();
  if (!helper.stdin || helper.stdin.destroyed || !helper.stdin.writable) {
    if (inputHelper === helper) inputHelper = null;
    return;
  }
  try {
    helper.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
      if (!error) return;
      if (error.code !== 'EPIPE') console.error('DeskLink input write failed:', error);
      if (inputHelper === helper) inputHelper = null;
    });
  } catch (error) {
    if (error.code !== 'EPIPE') console.error('DeskLink input write failed:', error);
    if (inputHelper === helper) inputHelper = null;
  }
}

function ensureServer() {
  // A packaged Electron executable cannot launch server.js with process.execPath:
  // process.execPath is the DeskLink executable itself, which would recursively
  // launch more host windows. Packaged builds use the public signaling server.
  if (app.isPackaged) return Promise.resolve(false);
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
    icon: assetPath('desklink.ico'),
    show: !launchInBackground,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'host-app.html'), {
    query: developerMode ? { debug: '1' } : {},
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
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
  signalingUrl: process.env.DESKLINK_SIGNALING_URL || (app.isPackaged
    ? 'https://desklink-remote.onrender.com'
    : 'http://localhost:3000'),
  // Optional JSON array of RTCIceServer objects. A TURN service is required for
  // reliable connections between different networks.
  iceServers: process.env.DESKLINK_ICE_SERVERS || '',
}));

ipcMain.on('inject-input', (_event, message) => {
  if (!message || !['mouse-move', 'mouse-down', 'mouse-up', 'mouse-click', 'mouse-scroll', 'key-down', 'key-up', 'text', 'release-input', 'host-alt-tab', 'set-osk-mode'].includes(message.type)) return;
  sendToInputHelper(message);
});

ipcMain.on('set-input-bounds', (_event, bounds) => {
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return;
  sendToInputHelper({ type: 'configure-display', payload: bounds });
});

ipcMain.on('minimize-host', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

app.whenReady().then(async () => {
  if (process.platform === 'win32' && app.isPackaged && !developerMode) {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--background'] });
  }
  await ensureServer();
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  // Keep the process (and an active host session) alive in the tray.
});

app.on('before-quit', () => {
  if (inputHelper && !inputHelper.killed) inputHelper.kill();
});

app.on('activate', () => {
  showMainWindow();
});
