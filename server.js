const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const selfsigned = require('selfsigned');
const { WebSocketServer } = require('ws');

const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 3443;
const rootDir = __dirname;
const certPath = path.join(rootDir, 'cert.pem');
const keyPath = path.join(rootDir, 'key.pem');

function getIceServers() {
  if (process.env.DESKLINK_ICE_SERVERS) {
    try {
      const iceServers = JSON.parse(process.env.DESKLINK_ICE_SERVERS);
      if (Array.isArray(iceServers) && iceServers.length) return iceServers;
    } catch (error) {
      console.warn('Invalid DESKLINK_ICE_SERVERS JSON; using STUN only.');
    }
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  Object.values(interfaces).forEach((details) => {
    details.forEach((detail) => {
      if (detail.family === 'IPv4' && !detail.internal) {
        addresses.push(detail.address);
      }
    });
  });
  return addresses;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

function ensureHttpsCredentials() {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  const attrs = [{ name: 'commonName', value: 'DeskLink Local' }];
  const pems = selfsigned.generate(attrs, { days: 365, algorithm: 'sha256', keySize: 2048 });
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  return { key: pems.private, cert: pems.cert };
}

const httpsOptions = ensureHttpsCredentials();

const httpServer = http.createServer((req, res) => {
  if (req.url === '/api/host-info') {
    const addresses = getLanAddresses();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      addresses,
      localUrl: `http://localhost:${port}/visual.html`,
      httpsLocalUrl: `https://localhost:${httpsPort}/visual.html`,
      httpLocalUrl: `http://localhost:${port}/visual.html`,
      iceServers: getIceServers(),
    }));
    return;
  }

  let requestedPath = req.url === '/' ? '/visual.html' : req.url;
  const decodedPath = decodeURIComponent(requestedPath);
  const safePath = path.normalize(decodedPath).replace(/^\/+/, '');
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }

  const fallbackPath = path.join(rootDir, 'visual.html');
  serveFile(res, fallbackPath);
});

const httpsServer = https.createServer(httpsOptions, (req, res) => {
  if (req.url === '/api/host-info') {
    const addresses = getLanAddresses();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      addresses,
      localUrl: `https://localhost:${httpsPort}/visual.html`,
      httpsLocalUrl: `https://localhost:${httpsPort}/visual.html`,
      httpLocalUrl: `http://localhost:${port}/visual.html`,
      iceServers: getIceServers(),
    }));
    return;
  }

  let requestedPath = req.url === '/' ? '/visual.html' : req.url;
  const decodedPath = decodeURIComponent(requestedPath);
  const safePath = path.normalize(decodedPath).replace(/^\/+/, '');
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }

  const fallbackPath = path.join(rootDir, 'visual.html');
  serveFile(res, fallbackPath);
});

const wss = new WebSocketServer({ noServer: true });
const rooms = new Map();
const accounts = new Map();

function handleUpgrade(request, socket, head) {
  if (request.url !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
}

httpServer.on('upgrade', handleUpgrade);
httpsServer.on('upgrade', handleUpgrade);

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { host: null, viewer: null, accessCodeHash: null });
  }
  return rooms.get(roomId);
}

wss.on('connection', (ws) => {
  console.log('Signaling client connected');
  ws.isAlive = true;

  const pingInterval = setInterval(() => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  }, 15000);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      const { type, payload, role, accountId, hostId, accessCode } = message;
      let roomId = message.roomId || null;

      if (role === 'host') {
        roomId = hostId || roomId;
      }

      if (role === 'viewer' && accountId && !roomId) {
        const account = accounts.get(accountId);
        if (account && account.hostId) {
          roomId = account.hostId;
        }
      }

      if (type === 'register' && !roomId) {
        ws.send(JSON.stringify({ type: 'error', message: 'No room or authorized host found for this account.' }));
        return;
      }

      const room = getRoom(roomId);

      if (type === 'register') {
        console.log(`Register ${role} for room ${roomId}`);
        if (role === 'host') {
          if (accessCode) {
            room.accessCodeHash = crypto.createHash('sha256').update(accessCode).digest('hex');
          }
          room.host = ws;
          ws.role = 'host';
          ws.roomId = roomId;
          if (accountId && roomId) {
            accounts.set(accountId, { hostId: roomId });
            console.log(`Linked account ${accountId} to host ${roomId}`);
          }
          ws.send(JSON.stringify({ type: 'registered', role: 'host', hostId: roomId }));
        } else if (role === 'viewer') {
          if (!room.host) {
            ws.send(JSON.stringify({ type: 'error', message: 'The host is not online yet.' }));
            return;
          }
          if (room.accessCodeHash) {
            const suppliedHash = crypto.createHash('sha256').update(accessCode || '').digest('hex');
            const authorized = crypto.timingSafeEqual(
              Buffer.from(suppliedHash, 'hex'),
              Buffer.from(room.accessCodeHash, 'hex'),
            );
            if (!authorized) {
              ws.send(JSON.stringify({ type: 'error', message: 'The session passcode is incorrect.' }));
              return;
            }
          }
          room.viewer = ws;
          ws.role = 'viewer';
          ws.roomId = roomId;
          ws.send(JSON.stringify({ type: 'registered', role: 'viewer', roomId }));
        }

        if (room.host && room.viewer) {
          console.log(`Room ${roomId} is ready for signaling`);
          room.host.send(JSON.stringify({ type: 'ready' }));
          room.viewer.send(JSON.stringify({ type: 'ready' }));
        }
        return;
      }

      if (type === 'signal') {
        const peer = ws.role === 'host' ? room.viewer : room.host;
        if (peer && peer.readyState === 1) {
          peer.send(JSON.stringify({ type: 'signal', payload, fromRole: ws.role }));
        }
        return;
      }

      // Fallback for networks where TURN relays media but SCTP data channels
      // cannot be established. Only an already passcode-authorized viewer may
      // send a small, known input message to its host.
      const allowedControlTypes = new Set(['mouse-move', 'mouse-down', 'mouse-up', 'mouse-click', 'mouse-scroll', 'key-down', 'key-up', 'text', 'release-input', 'host-alt-tab', 'set-stream-quality', 'set-desklink-osk-mode', 'set-interception-keyboard-mode', 'gamepad-state']);
      if (type === 'control' && ws.role === 'viewer' && ws.roomId === roomId && payload && allowedControlTypes.has(payload.type)) {
        const encoded = JSON.stringify(payload);
        if (encoded.length <= 8192 && room.host && room.host.readyState === 1) {
          room.host.send(JSON.stringify({ type: 'control', payload }));
        }
      }
    } catch (error) {
      console.error('Failed to parse ws message', error);
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    console.log('Signaling client disconnected');
    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        if (room.host === ws) {
          room.host = null;
        }
        if (room.viewer === ws) {
          room.viewer = null;
        }
      }
    }
  });
});

httpServer.listen(port, () => {
  const addresses = getLanAddresses();
  console.log(`DeskLink HTTP server ready at http://localhost:${port}/visual.html`);
  if (addresses.length) {
    addresses.forEach((address) => {
      console.log(`Viewer URL: http://${address}:${port}/visual.html`);
    });
  }
});

httpsServer.listen(httpsPort, () => {
  const addresses = getLanAddresses();
  console.log(`DeskLink HTTPS server ready at https://localhost:${httpsPort}/visual.html`);
  if (addresses.length) {
    addresses.forEach((address) => {
      console.log(`Viewer URL: https://${address}:${httpsPort}/visual.html`);
    });
  }
});
