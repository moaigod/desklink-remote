const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const accessCodeInput = document.getElementById("accessCodeInput");
const signalingUrlInput = document.getElementById("signalingUrlInput");
const saveSignalingUrlBtn = document.getElementById("saveSignalingUrlBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const roomCodeLabel = document.getElementById("roomCodeLabel");
const heroStatus = document.getElementById("heroStatus");
const heroMessage = document.getElementById("heroMessage");
const joinUrlMessage = document.getElementById("joinUrlMessage");
const viewerMessage = document.getElementById("viewerMessage");
const hostMessage = document.getElementById("hostMessage");
const localVideo = document.getElementById("localVideo");
const hostIdInput = document.getElementById("hostIdInput");
const allowedAccountInput = document.getElementById("allowedAccountInput");
const remoteVideo = document.getElementById("remoteVideo");
const startHostBtn = document.getElementById("startHostBtn");
const stopHostBtn = document.getElementById("stopHostBtn");
const hostPanel = document.getElementById("hostPanel");

let roomId = null;
let role = null;
let ws = null;
let peerConnection = null;
let controlChannel = null;
let localStream = null;
let remoteStream = null;
let offerSent = false;
let connected = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let pendingRegisterExtras = null;
let viewerControlHandlersAttached = false;
let sessionActive = false;
let stopRequested = false;
let signalingReady = false;
let mediaReadyForOffer = false;
let pendingIceCandidates = [];
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
let signalingBaseUrl = null;

function getSignalingBaseUrl() {
  const configured = signalingUrlInput?.value.trim() || localStorage.getItem("desklink-signaling-url");
  const fallback = location.protocol === "http:" || location.protocol === "https:" ? location.origin : "";
  const value = configured || fallback;
  if (!value) throw new Error("Enter the public signaling server URL first.");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http:// or https:// signaling URL.");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function loadJoinUrl() {
  let origin;
  try {
    origin = getSignalingBaseUrl();
  } catch (error) {
    joinUrlMessage.textContent = "Enter your public signaling server URL above, then choose Use server.";
    return false;
  }

  try {
    const response = await fetch(`${origin}/api/host-info`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const data = await response.json();
    signalingBaseUrl = origin;
    if (signalingUrlInput) signalingUrlInput.value = origin;
    localStorage.setItem("desklink-signaling-url", origin);
    if (Array.isArray(data.iceServers) && data.iceServers.length) {
      iceServers = data.iceServers;
    }
    joinUrlMessage.textContent = `Signaling server ready. Browser viewer: ${origin}/visual.html`;
    return true;
  } catch (error) {
    joinUrlMessage.textContent = `Could not reach ${origin}. Check the URL and make sure it exposes /api/host-info.`;
    return false;
  }
}

function normalizeId(value) {
  return value?.toString().trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function generateHostId() {
  return `H-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function reportStatus(message, detail = null) {
  heroMessage.textContent = message;
  if (detail) {
    console.warn(detail);
  }
  if (role === "viewer") {
    viewerMessage.textContent = message;
  }
}

function sendControlMessage(message) {
  if (controlChannel && controlChannel.readyState === "open") {
    controlChannel.send(JSON.stringify(message));
  }
}

function setupControlChannel(channel) {
  controlChannel = channel;

  channel.addEventListener("open", () => {
    if (role === "viewer") {
      viewerMessage.textContent = "Remote control is ready. Click and type in the shared page.";
    }
  });

  channel.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "mouse-move") {
      handleRemoteMouseMove(message.payload);
    } else if (message.type === "mouse-down") {
      handleRemoteMouseEvent("mousedown", message.payload);
    } else if (message.type === "mouse-up") {
      handleRemoteMouseEvent("mouseup", message.payload);
    } else if (message.type === "mouse-click") {
      handleRemoteMouseEvent("click", message.payload);
    } else if (message.type === "key-down") {
      handleRemoteKeyEvent("keydown", message.payload);
    } else if (message.type === "key-up") {
      handleRemoteKeyEvent("keyup", message.payload);
    }
  });
}

function handleRemoteMouseMove(payload) {
  const x = Math.round(payload.x * window.innerWidth);
  const y = Math.round(payload.y * window.innerHeight);
  const target = document.elementFromPoint(x, y) || document.body;
  target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

function handleRemoteMouseEvent(type, payload) {
  const x = Math.round(payload.x * window.innerWidth);
  const y = Math.round(payload.y * window.innerHeight);
  const target = document.elementFromPoint(x, y) || document.body;
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: payload.button || 0, buttons: payload.button === 2 ? 2 : 1 });
  target.dispatchEvent(event);
  if (type === "mousedown" && target.focus) {
    target.focus({ preventScroll: true });
  }
}

function handleRemoteKeyEvent(type, payload) {
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key: payload.key,
    code: payload.code,
    ctrlKey: payload.ctrlKey || false,
    altKey: payload.altKey || false,
    shiftKey: payload.shiftKey || false,
    metaKey: payload.metaKey || false,
  });

  if (type === "keydown") {
    if (payload.key && payload.key.length === 1 && !payload.ctrlKey && !payload.metaKey && !payload.altKey) {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const nextValue = `${target.value.slice(0, start)}${payload.key}${target.value.slice(end)}`;
        if (target.value !== undefined) {
          target.value = nextValue;
          target.setSelectionRange(start + 1, start + 1);
        }
      }
    } else if (payload.key === "Backspace" && target && "value" in target) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      if (start > 0) {
        target.value = `${target.value.slice(0, start - 1)}${target.value.slice(end)}`;
        target.setSelectionRange(start - 1, start - 1);
      }
    }
  }

  target.dispatchEvent(event);
}

function attachViewerControlHandlers() {
  if (viewerControlHandlersAttached) {
    return;
  }
  viewerControlHandlersAttached = true;

  remoteVideo.addEventListener("pointermove", (event) => {
    if (!connected || role !== "viewer") {
      return;
    }
    const position = getVideoPosition(event);
    if (!position) return;
    const { x, y } = position;
    sendControlMessage({ type: "mouse-move", payload: { x, y } });
  });

  remoteVideo.addEventListener("pointerdown", (event) => {
    if (!connected || role !== "viewer") {
      return;
    }
    const position = getVideoPosition(event);
    if (!position) return;
    const { x, y } = position;
    event.preventDefault();
  });

  remoteVideo.addEventListener("pointerup", (event) => {
    if (!connected || role !== "viewer") {
      return;
    }
    const position = getVideoPosition(event);
    if (!position) return;
    const { x, y } = position;
    sendControlMessage({ type: "mouse-click", payload: { x, y, button: event.button } });
  });

  remoteVideo.addEventListener("click", (event) => {
    // Keep Chrome's media controls from handling the click locally.
    event.preventDefault();
    event.stopPropagation();
  });

  fullscreenBtn.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen request failed", error);
    }
  });

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = Boolean(document.fullscreenElement);
    document.body.classList.toggle("remote-fullscreen", isFullscreen);
    fullscreenBtn.textContent = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  });

  document.addEventListener("keydown", (event) => {
    if (!connected || role !== "viewer") {
      return;
    }
    // Let the Chromebook/browser handle its own fullscreen controls.
    if (event.key === "F11" || (event.key === "Escape" && document.fullscreenElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      sendControlMessage({ type: "text", payload: { text: event.key } });
    } else {
      sendControlMessage({ type: "key-down", payload: { key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey } });
    }
  }, true);

  document.addEventListener("keyup", (event) => {
    if (!connected || role !== "viewer") {
      return;
    }
    if (event.key === "F11" || (event.key === "Escape" && document.fullscreenElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      return;
    }
    sendControlMessage({ type: "key-up", payload: { key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey } });
  }, true);
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function resetPeerSession() {
  if (peerConnection) {
    peerConnection.close();
  }
  peerConnection = null;
  controlChannel = null;
  offerSent = false;
  connected = false;
  signalingReady = false;
  mediaReadyForOffer = false;
  pendingIceCandidates = [];
}

function reconnectSession() {
  if (!roomId || !role || !sessionActive || stopRequested) {
    return;
  }

  if (reconnectTimer) {
    return;
  }

  reconnectAttempts += 1;
  if (reconnectAttempts > 4) {
    heroMessage.textContent = "The signaling connection could not be restored after several attempts. Refresh the page and try again.";
    viewerMessage.textContent = "The join attempt failed after repeated reconnects.";
    return;
  }

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    heroMessage.textContent = `Reconnecting to room ${roomId}...`;
    resetPeerSession();
    initSocket();
    registerRole(role, pendingRegisterExtras || {});
    ensurePeerConnection();

    if (role === "viewer") {
      attachViewerControlHandlers();
    } else {
      if (!controlChannel) {
        controlChannel = peerConnection.createDataChannel("control");
        setupControlChannel(controlChannel);
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
      }
      createOffer();
    }
  }, 1000 * reconnectAttempts);
}

function initSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const endpoint = new URL("/ws", signalingBaseUrl || getSignalingBaseUrl());
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(endpoint.toString());

  ws.addEventListener("open", () => {
    clearReconnectTimer();
    reconnectAttempts = 0;
    stopRequested = false;
    heroMessage.textContent = "Connected to the local signaling server.";
    if (role) {
      registerRole(role, pendingRegisterExtras || {});
    }
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "error") {
      heroMessage.textContent = message.message || "A server error occurred.";
      if (role === "viewer") {
        viewerMessage.textContent = message.message || "The account login did not succeed.";
      }
      return;
    }
    if (message.type === "ready") {
      signalingReady = true;
      if (role === "host" && mediaReadyForOffer) {
        offerSent = false;
        createOffer();
      }
      return;
    }

    if (message.type === "signal") {
      handleSignal(message.payload);
    }
  });

  ws.addEventListener("close", (event) => {
    if (stopRequested || !sessionActive) {
      return;
    }

    const reason = event.code === 1006 ? "The signaling server closed the connection unexpectedly." : "The signaling connection was closed.";
    heroMessage.textContent = `${reason} Trying to reconnect to the room.`;
    if (role === "viewer") {
      viewerMessage.textContent = "Reconnecting to the host...";
    }
    reconnectSession();
  });

  ws.addEventListener("error", () => {
    if (stopRequested || !sessionActive) {
      return;
    }
    heroMessage.textContent = "The signaling server could not be reached. Retrying the connection.";
    if (role === "viewer") {
      viewerMessage.textContent = "The host could not be reached yet. Retrying...";
    }
    reconnectSession();
  });
}

function registerRole(nextRole, extras = {}) {
  role = nextRole;
  pendingRegisterExtras = extras;

  if (!roomId && role === "host") {
    roomId = generateRoomCode();
  }

  if (roomId) {
    roomCodeLabel.textContent = `Room: ${roomId}`;
  } else if (role === "viewer" && extras.accountId) {
    roomCodeLabel.textContent = "Room: Account";
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "register", roomId, role, ...extras }));
  }
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ensurePeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }

  peerConnection = new RTCPeerConnection({
    iceServers,
  });

  peerConnection.addEventListener("datachannel", (event) => {
    setupControlChannel(event.channel);
  });

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "signal", roomId, role, payload: { type: "candidate", candidate: event.candidate } }));
    }
  });

  peerConnection.addEventListener("track", (event) => {
    if (event.streams && event.streams[0]) {
      remoteStream = event.streams[0];
      remoteVideo.srcObject = remoteStream;
      remoteVideo.play().catch(() => {});
      connected = true;
      heroStatus.textContent = "Connected";
      heroStatus.className = "status-pill connecting";
      viewerMessage.textContent = "The remote screen is live.";
      if (hostMessage) {
        hostMessage.textContent = "Connected to the viewer.";
      }
    }
  });

  peerConnection.addEventListener("negotiationneeded", () => {
    if (role === "host" && signalingReady && mediaReadyForOffer && !offerSent && roomId) {
      createOffer();
    }
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    if (peerConnection.connectionState === "connected") {
      connected = true;
      heroStatus.textContent = "Connected";
      heroStatus.className = "status-pill connecting";
      viewerMessage.textContent = "Connection established. You can click and type in the shared page.";
      if (hostMessage) {
        hostMessage.textContent = "Session live.";
      }
      if (role === "viewer") {
        remoteVideo.focus({ preventScroll: true });
      }
    } else if (peerConnection.connectionState === "failed") {
      reportStatus("The peer connection failed. Refresh and try again.");
    }
  });

  peerConnection.addEventListener("iceconnectionstatechange", () => {
    console.log("ICE state:", peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === "failed" || peerConnection.iceConnectionState === "disconnected") {
      reportStatus("The connection is having trouble finding a stable peer path. Try a fresh room code.");
    }
  });

  return peerConnection;
}

async function createOffer() {
  if (!peerConnection || offerSent || role !== "host") {
    return;
  }

  if (!signalingReady || !mediaReadyForOffer || !peerConnection.getSenders().length) {
    return;
  }

  try {
    offerSent = true;
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "signal", roomId, role, payload: { type: "offer", sdp: offer } }));
  } catch (error) {
    reportStatus("The host could not create a WebRTC offer.", error);
  }
}

async function handleSignal(payload) {
  if (!peerConnection) {
    ensurePeerConnection();
  }

  try {
    if (payload.type === "offer") {
      if (role !== "viewer") {
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await addPendingIceCandidates();
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: "signal", roomId, role, payload: { type: "answer", sdp: answer } }));
      return;
    }

    if (payload.type === "answer") {
      if (role !== "host") {
        return;
      }
      await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await addPendingIceCandidates();
      return;
    }

    if (payload.type === "candidate") {
      if (payload.candidate) {
        if (!peerConnection.remoteDescription) {
          pendingIceCandidates.push(payload.candidate);
        } else {
          await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      }
    }
  } catch (error) {
    reportStatus("The WebRTC signaling handshake failed. Try again with a fresh room code.", error);
  }
}

function getVideoPosition(event) {
  const rect = remoteVideo.getBoundingClientRect();
  const sourceWidth = remoteVideo.videoWidth || rect.width;
  const sourceHeight = remoteVideo.videoHeight || rect.height;
  const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
  const contentWidth = sourceWidth * scale;
  const contentHeight = sourceHeight * scale;
  const contentLeft = rect.left + (rect.width - contentWidth) / 2;
  const contentTop = rect.top + (rect.height - contentHeight) / 2;
  const x = (event.clientX - contentLeft) / contentWidth;
  const y = (event.clientY - contentTop) / contentHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

async function addPendingIceCandidates() {
  const candidates = pendingIceCandidates;
  pendingIceCandidates = [];
  for (const candidate of candidates) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

async function startHosting() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    if (hostMessage) {
      hostMessage.textContent = "Screen capture is not available in this browser. Try Chrome or Edge.";
    }
    return;
  }

  sessionActive = true;
  stopRequested = false;
  const typedHostId = hostIdInput ? normalizeId(hostIdInput.value) : "";
  const allowedAccountId = allowedAccountInput ? normalizeId(allowedAccountInput.value) : "";
  roomId = typedHostId || generateRoomCode();
  if (hostIdInput) {
    hostIdInput.value = roomId;
  }
  roomCodeLabel.textContent = `Room: ${roomId}`;
  heroStatus.textContent = "Hosting";
  heroStatus.className = "status-pill connecting";
  heroMessage.textContent = "Your screen is being prepared for a viewer.";
  if (hostMessage) {
    hostMessage.textContent = "Requesting screen access...";
  }

  initSocket();
  const registerExtras = { hostId: roomId };
  if (allowedAccountId) {
    registerExtras.accountId = allowedAccountId;
  }
  registerRole("host", registerExtras);
  ensurePeerConnection();

  if (!controlChannel) {
    controlChannel = peerConnection.createDataChannel("control");
    setupControlChannel(controlChannel);
  }

  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.play().catch(() => {});
    }
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    mediaReadyForOffer = true;
    if (signalingReady && !offerSent) {
      offerSent = false;
      createOffer();
    }
    if (hostMessage) {
      hostMessage.textContent = "Screen share started. Open the page on the viewer device and use the room code.";
    }
  } catch (error) {
    if (hostMessage) {
      hostMessage.textContent = "Screen sharing permission was denied or not supported.";
    }
    heroMessage.textContent = "You need to allow screen sharing in the browser. ChromeOS may block it if the page is not trusted or if the tab is not focused.";
  }
}

async function joinSession() {
  const code = normalizeId(roomInput.value);
  if (!code) {
    viewerMessage.textContent = "Enter a room code from the host device.";
    return;
  }

  if (!(await loadJoinUrl())) {
    viewerMessage.textContent = "Choose a reachable signaling server before joining.";
    return;
  }

  sessionActive = true;
  stopRequested = false;
  roomId = code;

  roomCodeLabel.textContent = `Room: ${roomId}`;
  heroMessage.textContent = "Trying to connect to the host.";
  viewerMessage.textContent = "Connecting...";

  initSocket();
  registerRole("viewer", { accessCode: normalizeId(accessCodeInput.value) });
  ensurePeerConnection();
  attachViewerControlHandlers();
}

joinBtn.addEventListener("click", joinSession);
saveSignalingUrlBtn.addEventListener("click", loadJoinUrl);

if (startHostBtn) {
  startHostBtn.addEventListener("click", startHosting);
}

if (stopHostBtn) {
  stopHostBtn.addEventListener("click", () => {
    sessionActive = false;
    stopRequested = true;
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    clearReconnectTimer();
    reconnectAttempts = 0;
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    controlChannel = null;
    if (ws) {
      ws.close();
      ws = null;
    }
    heroStatus.textContent = "Stopped";
    heroStatus.className = "status-pill standby";
    heroMessage.textContent = "The sharing session has been stopped.";
    if (hostMessage) {
      hostMessage.textContent = "Session stopped.";
    }
    viewerMessage.textContent = "The connection has been closed.";
  });
}

roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinSession();
  }
});

if (hostPanel && window.location.search.includes("host=1")) {
  hostPanel.classList.add("visible");
}

roomCodeLabel.textContent = "Room: --";
heroStatus.textContent = "Waiting";
heroStatus.className = "status-pill standby";
heroMessage.textContent = "Open this page on the viewer device and paste the room code from the host.";
joinUrlMessage.innerHTML = "Open this page on the viewer device using the local server URL shown here.";
if (hostMessage) {
  hostMessage.textContent = "Use this panel only for a local browser test.";
}
viewerMessage.textContent = "Paste the room code from the host device. After you connect, click and type into the shared page, or double-click the video to fullscreen.";

loadJoinUrl();
