# DeskLink remote access prototype

This prototype runs locally in a browser and can be used for actual screen sharing over a local web server.

## Run it on a Chromebook or another computer

1. Open a terminal in this folder.
2. Run: `npm install`
3. Run: `npm start`
4. On the host computer, open `http://localhost:3000/visual.html` to test locally.
   On a different device on the same Wi-Fi, use the host computer's LAN address,
   such as `http://192.168.1.25:3000/visual.html` — never `localhost`.

## Use it

### Desktop host app (recommended for real trials)

- Run: `npm run host-app`
- The app opens a native host window on the computer you want to share.
- Choose a screen or window source, optionally enter a Host ID and session passcode, and click "Start hosting".
- On the viewer device, open the browser page and enter the host's room ID and session passcode.

### Browser viewer page

- On the same network, open the page on the viewer device at
  `http://HOST-LAN-IP:3000/visual.html` (example:
  `http://192.168.1.25:3000/visual.html`).
- Enter the room code provided by the host and click "Join".
- The viewer will receive the host's screen stream.

The server prints its LAN viewer URLs when it starts. Prefer the HTTP URL for local
testing: the bundled HTTPS certificate is self-signed, so ChromeOS will not trust it
without an explicit certificate exception.

> This viewer page is optimized for browser-only join access. Use the native host app or a separate host interface to start the host session.

The native host app forwards the browser viewer's mouse and keyboard messages to
Windows through its local input helper. Only start a session when you intend to allow
the viewer to control the host, and share the generated session passcode only with the
person who should connect.

For correct pointer mapping, select an entire display in the host app instead of an
individual window. The viewer maps input to the visible video frame and the host maps
it to that selected display.

## Connecting from outside the home network

The bundled server is local-network only. For an Internet connection, deploy `server.js`
behind HTTPS, open the viewer from that public site, and start the host app with these
environment variables:

```powershell
$env:DESKLINK_SIGNALING_URL = 'https://signal.example.com'
$env:DESKLINK_ICE_SERVERS = '[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"USER","credential":"PASSWORD"}]'
npm run host-app
```

`DESKLINK_SIGNALING_URL` must be the public HTTP(S) base URL; the app automatically
uses its `/ws` WebSocket endpoint. A TURN server is essential for dependable access
between different networks because STUN alone cannot traverse many NATs/firewalls.
Set the same `DESKLINK_ICE_SERVERS` value for the deployed signaling server so the
browser viewer receives the TURN configuration from `/api/host-info`.

## Browser peer package

`desklink-viewer.zip` contains the browser-only peer. It asks for the public
signaling URL, then the host room ID and session passcode. It contains no native
Windows host or Windows-control code.
