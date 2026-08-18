const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const sourceSelect = document.getElementById('sourceSelect');
const qualitySelect = document.getElementById('qualitySelect');
const hostIdInput = document.getElementById('hostIdInput');
const accessCodeInput = document.getElementById('accessCodeInput');
const statusBadge = document.getElementById('statusBadge');
const roomLabel = document.getElementById('roomLabel');
const statusMessage = document.getElementById('statusMessage');
const inputDebug = document.getElementById('inputDebug');
const keyboardDebug = document.getElementById('keyboardDebug');
const controllerDebug = document.getElementById('controllerDebug');
const streamDebug = document.getElementById('streamDebug');
const eventDebug = document.getElementById('eventDebug');
const developerPanel = document.getElementById('developerPanel');
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
let controlMessageCount = 0;
const developerMode = new URLSearchParams(window.location.search).get('debug') === '1';

if (developerMode && developerPanel) {
  developerPanel.hidden = false;
}
let connectionConfig = {
  signalingUrl: 'http://localhost:3000',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const qualityProfiles = {
  smooth: { label: 'Smooth', width: 960, height: 540, frameRate: 30, maxBitrate: 4_000_000, contentHint: 'motion' },
  balanced: { label: 'Balanced', width: 1280, height: 720, frameRate: 30, maxBitrate: 8_000_000, contentHint: 'motion' },
  crisp: { label: 'Crisp', width: 1920, height: 1080, frameRate: 60, maxBitrate: 16_000_000, contentHint: 'motion' },
};
const viewerQualityProfiles = {
  smooth: { label: 'Smooth', frameRate: 30, maxBitrate: 4_000_000 },
  balanced: { label: 'Balanced', frameRate: 30, maxBitrate: 8_000_000 },
  crisp: { label: 'Crisp', frameRate: 60, maxBitrate: 16_000_000 },
};
const hostPreferencesKey = 'desklink-host-preferences';

function loadHostPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(hostPreferencesKey) || '{}');
    if (saved.hostId) hostIdInput.value = normalizeId(saved.hostId);
    if (saved.accessCode) accessCodeInput.value = saved.accessCode;
    if (saved.quality && qualityProfiles[saved.quality] && qualitySelect) qualitySelect.value = saved.quality;
  } catch {
    // A fresh app simply starts with blank defaults.
  }
}

function saveHostPreferences(hostId, accessCode = accessCodeInput.value) {
  localStorage.setItem(hostPreferencesKey, JSON.stringify({
    hostId: normalizeId(hostId),
    accessCode: normalizeId(accessCode),
    quality: qualitySelect?.value || 'balanced',
  }));
}

function getQualityProfile() {
  return qualityProfiles[qualitySelect?.value] || qualityProfiles.balanced;
}

async function tuneVideoSender(sender, profile) {
  try {
    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings[0].maxBitrate = profile.maxBitrate;
    parameters.encodings[0].maxFramerate = profile.frameRate;
    parameters.degradationPreference = 'maintain-framerate';
    await sender.setParameters(parameters);
  } catch (error) {
    // Capture dimensions still apply if a platform does not expose sender tuning.
    console.warn('Could not apply bitrate tuning.', error);
  }
}

async function applyViewerQuality(profileName) {
  const profile = viewerQualityProfiles[profileName];
  if (!profile || !peerConnection) return;
  const videoSenders = peerConnection.getSenders().filter((sender) => sender.track?.kind === 'video');
  await Promise.all(videoSenders.map((sender) => tuneVideoSender(sender, profile)));
  updateStatus(`Viewer requested ${profile.label}: up to ${profile.frameRate} FPS.`);
  if (streamDebug) streamDebug.textContent = `Stream: viewer requested ${profile.label}, cap ${profile.frameRate} FPS, ${Math.round(profile.maxBitrate / 1_000_000 * 10) / 10} Mbps.`;
}

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
  saveHostPreferences(hostId, extras.accessCode);
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
    controlMessageCount += 1;
    if (eventDebug) eventDebug.textContent = `Control messages received: ${controlMessageCount} · latest: ${message.type}`;
    if (message.type === 'set-stream-quality') {
      applyViewerQuality(message.payload?.profile).catch((error) => console.warn('Could not apply viewer stream quality.', error));
      return;
    }
    if (message.type === 'gamepad-state') {
      const controllers = Array.isArray(message.payload?.controllers) ? message.payload.controllers : [];
      if (controllerDebug) {
        if (!controllers.length) {
          controllerDebug.textContent = 'Controller: viewer has no controller connected.';
        } else {
          const pressed = controllers.reduce((total, controller) => total + (controller.buttons || []).filter((button) => button.pressed).length, 0);
          const first = controllers[0];
          const pressedButtons = (first?.buttons || []).map((button, index) => button.pressed ? index : null).filter((index) => index !== null).join(', ') || 'none';
          const axes = (first?.axes || []).slice(0, 4).map((axis) => Number(axis).toFixed(2)).join(', ') || 'none';
          controllerDebug.textContent = `Controller: ${controllers.length} connected · pressed [${pressedButtons}] · axes [${axes}] · ${pressed} total button${pressed === 1 ? '' : 's'} held.`;
        }
      }
      window.electronAPI.injectInput(message);
      return;
    }
    if (['mouse-move', 'mouse-relative', 'mouse-button', 'mouse-down', 'mouse-up', 'mouse-click', 'mouse-scroll', 'key-down', 'key-up', 'text', 'release-input', 'host-alt-tab', 'set-desklink-osk-mode', 'set-interception-keyboard-mode'].includes(message.type)) {
      if (message.type.startsWith('mouse-') && message.payload && inputDebug) {
        const x = Number(message.payload.x);
        const y = Number(message.payload.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          const targetX = inputBounds ? Math.round(x * (inputBounds.width - 1)) + inputBounds.x : 'unknown';
          const targetY = inputBounds ? Math.round(y * (inputBounds.height - 1)) + inputBounds.y : 'unknown';
          inputDebug.textContent = `Pointer ${message.type}: normalized ${x.toFixed(3)}, ${y.toFixed(3)} → host ${targetX}, ${targetY}${message.payload.button === undefined ? '' : ` · button ${message.payload.button}`}`;
          inputDebug.textContent = `Pointer mapping: ${x.toFixed(3)}, ${y.toFixed(3)} → ${targetX}, ${targetY}`;
        }
      }
      if ((message.type === 'text' || message.type.startsWith('key-')) && keyboardDebug) {
        const received = message.type === 'text' ? JSON.stringify(message.payload?.text || '') : message.payload?.key || message.type;
        const modifiers = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'].filter((name) => message.payload?.[name]).map((name) => name.replace('Key', '')).join('+') || 'none';
        keyboardDebug.textContent = `Keyboard ${message.type}: ${received} · code ${message.payload?.code || 'unicode'} · modifiers ${modifiers}`;
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
  const quality = getQualityProfile();
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
          minWidth: quality.width,
          maxWidth: quality.width,
          minHeight: quality.height,
          maxHeight: quality.height,
          // Capture enough frames for a viewer to choose the 60 FPS cap later.
          // The encoder remains limited to the host's selected profile until a
          // passcode-authorized viewer asks for a different profile.
          maxFrameRate: 60,
        },
      },
      audio: false,
    });

    localStream = stream;
    stream.getVideoTracks().forEach((track) => {
      track.contentHint = quality.contentHint;
      const sender = peerConnection.addTrack(track, stream);
      tuneVideoSender(sender, quality);
    });
    previewVideo.srcObject = stream;
    previewVideo.play().catch(() => {});
    const accessCode = normalizeId(accessCodeInput.value) || generateAccessCode();
    accessCodeInput.value = accessCode;
    saveHostPreferences(roomId, accessCode);
    const registerExtras = { accessCode };
    registerHost(registerExtras);
    setStatus('Hosting', 'connecting');
    updateStatus(`${quality.label} stream is live. New viewers need computer ID ${roomId} and its password.`);
    if (streamDebug) streamDebug.textContent = `Stream: ${quality.label} · ${quality.width}×${quality.height} · host default ${quality.frameRate} FPS · source ${selectedSource?.name || selectedSourceId}`;
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
loadHostPreferences();
setStatus('Waiting', 'standby');
updateStatus('Select a source and start hosting.');
