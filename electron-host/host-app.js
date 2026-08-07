const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const sourceSelect = document.getElementById('sourceSelect');
const hostIdInput = document.getElementById('hostIdInput');
const accessCodeInput = document.getElementById('accessCodeInput');
const statusBadge = document.getElementById('statusBadge');
const roomLabel = document.getElementById('roomLabel');
const statusMessage = document.getElementById('statusMessage');
const inputDebug = document.getElementById('inputDebug');
const keyboardDebug = document.getElementById('keyboardDebug');
const controllerDebug = document.getElementById('controllerDebug');
const previewVideo = document.getElementById('previewVideo');

let roomId = null;
let role = 'host';
let ws = null;
let peerConnection = null;
let controlChannel = null;
let localStream = null;
let connected = false;
let pendingRegister = null;
let pendingIceCandidates = [];
let captureSources = [];
let inputBounds = null;
let connectionConfig = {
  signalingUrl: 'http://localhost:3000',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function normalizeId(value) {
  return (value || '').toString().trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function generateRoomId() {
  return `H-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function setStatus(label, tone) {
  statusBadge.textContent = label;
  statusBadge.className = `badge ${tone}`;
}

function updateStatus(message) {
  statusMessage.textContent = message;
}

function generateAccessCode() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36)).join('').slice(0, 10).toUpperCase();
}

function getWebSocketUrl(signalingUrl) {
  const url = new URL(signalingUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function loadConnectionConfig() {
  const config = await window.electronAPI.getConnectionConfig();
  let iceServers = connectionConfig.iceServers;
  let hasLocalOverride = false;
  if (config.iceServers) {
    try {
      const parsed = JSON.parse(config.iceServers);
      if (Array.isArray(parsed) && parsed.length) {
        iceServers = parsed;
        hasLocalOverride = true;
      }
    } catch (error) {
      console.warn('Invalid DESKLINK_ICE_SERVERS JSON; using STUN only.', error);
    }
  }

  // The deployed signaling server is the single source of truth for TURN.
  // This lets the browser viewer and portable host use matching credentials.
  if (!hasLocalOverride) {
    try {
      const response = await fetch(new URL('/api/host-info', config.signalingUrl));
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const remoteConfig = await response.json();
      if (Array.isArray(remoteConfig.iceServers) && remoteConfig.iceServers.length) {
        iceServers = remoteConfig.iceServers;
      }
    } catch (error) {
      console.warn('Could not load ICE servers from the signaling server; using STUN only.', error);
    }
  }
  connectionConfig = { signalingUrl: config.signalingUrl, iceServers };
}

function connectSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(getWebSocketUrl(connectionConfig.signalingUrl));

  ws.addEventListener('open', () => {
    setStatus('Connected', 'connecting');
    updateStatus('Signaling is connected.');
    if (pendingRegister) {
      registerHost(pendingRegister);
    }
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'ready') {
      createOffer();
      return;
    }

    if (message.type === 'signal') {
      handleSignal(message.payload);
      return;
    }
    if (message.type === 'control') {
      handleInboundControlMessage(message.payload || {});
    }
  });

  ws.addEventListener('close', () => {
    setStatus('Reconnecting', 'standby');
    updateStatus('The signaling connection dropped. Trying again...');
    window.setTimeout(connectSocket, 1500);
  });
}

function registerHost(extras = {}) {
  pendingRegister = extras;
  const hostId = normalizeId(hostIdInput.value) || generateRoomId();
  hostIdInput.value = hostId;
  roomId = hostId;
  roomLabel.textContent = `Room: ${roomId}`;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'register', roomId, role, hostId: roomId, ...extras }));
  }
}

function ensurePeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }

  peerConnection = new RTCPeerConnection({ iceServers: connectionConfig.iceServers });

  peerConnection.addEventListener('datachannel', (event) => {
    controlChannel = event.channel;
    setupControlChannel(controlChannel);
  });

  peerConnection.addEventListener('icecandidate', (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'signal', roomId, role, payload: { type: 'candidate', candidate: event.candidate } }));
    }
  });

  peerConnection.addEventListener('track', (event) => {
    if (event.streams && event.streams[0]) {
      previewVideo.srcObject = event.streams[0];
      previewVideo.play().catch(() => {});
      connected = true;
      setStatus('Hosting', 'connecting');
      updateStatus('Viewer connected. The remote screen is live.');
    }
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    if (peerConnection.connectionState === 'connected') {
      connected = true;
      setStatus('Hosting', 'connecting');
      updateStatus('Connected to the viewer.');
    }
  });

  return peerConnection;
}

function handleInboundControlMessage(message) {
    if (message.type === 'gamepad-state') {
      const controllers = Array.isArray(message.payload?.controllers) ? message.payload.controllers : [];
      if (controllerDebug) {
        if (!controllers.length) {
          controllerDebug.textContent = 'Controller: viewer has no controller connected.';
        } else {
          const pressed = controllers.reduce((total, controller) => total + (controller.buttons || []).filter((button) => button.pressed).length, 0);
          controllerDebug.textContent = `Controller signal received: ${controllers.length} controller${controllers.length === 1 ? '' : 's'}, ${pressed} button${pressed === 1 ? '' : 's'} pressed. Virtual controller driver not installed.`;
        }
      }
      return;
    }
    if (['mouse-move', 'mouse-down', 'mouse-up', 'mouse-click', 'key-down', 'key-up', 'text'].includes(message.type)) {
      if (message.type.startsWith('mouse-') && message.payload && inputDebug) {
        const x = Number(message.payload.x);
        const y = Number(message.payload.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          const targetX = inputBounds ? Math.round(x * (inputBounds.width - 1)) + inputBounds.x : 'unknown';
          const targetY = inputBounds ? Math.round(y * (inputBounds.height - 1)) + inputBounds.y : 'unknown';
          inputDebug.textContent = `Pointer mapping: ${x.toFixed(3)}, ${y.toFixed(3)} → ${targetX}, ${targetY}`;
        }
      }
      if ((message.type === 'text' || message.type.startsWith('key-')) && keyboardDebug) {
        const received = message.type === 'text' ? JSON.stringify(message.payload?.text || '') : message.payload?.key || message.type;
        keyboardDebug.textContent = `Keyboard input received: ${received}`;
      }
      window.electronAPI.injectInput(message);
    }
}

function setupControlChannel(channel) {
  controlChannel = channel;
  channel.addEventListener('open', () => {
    updateStatus('Control channel open.');
  });
  channel.addEventListener('message', (event) => handleInboundControlMessage(JSON.parse(event.data)));
}

async function createOffer() {
  if (!peerConnection || !ws) {
    return;
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'signal', roomId, role, payload: { type: 'offer', sdp: offer } }));
}

async function handleSignal(payload) {
  if (!peerConnection) {
    ensurePeerConnection();
  }

  if (payload.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    await addPendingIceCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'signal', roomId, role, payload: { type: 'answer', sdp: answer } }));
  } else if (payload.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    await addPendingIceCandidates();
  } else if (payload.type === 'candidate') {
    try {
      if (!peerConnection.remoteDescription) {
        pendingIceCandidates.push(payload.candidate);
      } else {
        await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch (error) {
      console.warn('ICE error', error);
    }
  }
}

async function addPendingIceCandidates() {
  const candidates = pendingIceCandidates;
  pendingIceCandidates = [];
  for (const candidate of candidates) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

async function populateSources() {
  try {
    const sources = await window.electronAPI.getScreenSources();
    sourceSelect.innerHTML = '';
    sources.forEach((source) => {
      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = source.name;
      sourceSelect.appendChild(option);
    });
    captureSources = sources;
  } catch (error) {
    console.error(error);
    updateStatus('Screen source lookup failed.');
  }
}

async function startHosting() {
  const selectedSourceId = sourceSelect.value;
  if (!selectedSourceId) {
    updateStatus('Pick a screen or window source first.');
    return;
  }

  try {
    await loadConnectionConfig();
  } catch (error) {
    console.error(error);
    updateStatus('Could not load the signaling configuration.');
    return;
  }

  const selectedSource = captureSources.find((source) => source.id === selectedSourceId);
  if (selectedSource?.bounds) {
    inputBounds = selectedSource.bounds;
    window.electronAPI.setInputBounds(selectedSource.bounds);
    if (inputDebug) inputDebug.textContent = `Pointer target: ${inputBounds.width} × ${inputBounds.height} at ${inputBounds.x}, ${inputBounds.y}`;
  } else {
    inputBounds = null;
    updateStatus('Window capture selected. For accurate mouse control, share an entire display.');
  }
  connectSocket();
  ensurePeerConnection();

  if (!controlChannel) {
    controlChannel = peerConnection.createDataChannel('control');
    setupControlChannel(controlChannel);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSourceId,
          minWidth: 1280,
          maxWidth: 1280,
          minHeight: 720,
          maxHeight: 720,
        },
      },
      audio: false,
    });

    localStream = stream;
    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    previewVideo.srcObject = stream;
    previewVideo.play().catch(() => {});
    const accessCode = normalizeId(accessCodeInput.value) || generateAccessCode();
    accessCodeInput.value = accessCode;
    const registerExtras = { accessCode };
    registerHost(registerExtras);
    setStatus('Hosting', 'connecting');
    updateStatus(`Screen share is live. Viewer needs room ${roomId} and passcode ${accessCode}.`);
    window.electronAPI.minimizeHost();
  } catch (error) {
    console.error(error);
    updateStatus('Screen capture failed. Try selecting another source.');
  }
}

function stopHosting() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  controlChannel = null;
  if (ws) {
    ws.close();
    ws = null;
  }
  setStatus('Stopped', 'standby');
  updateStatus('Hosting stopped.');
}

startBtn.addEventListener('click', startHosting);
stopBtn.addEventListener('click', stopHosting);

populateSources();
setStatus('Waiting', 'standby');
updateStatus('Select a source and start hosting.');
