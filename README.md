# DeskLink

![DeskLink logo](assets/desklink-logo.png)

DeskLink is a small remote-desktop project with a Windows host app and a browser-only viewer. Run the host on the computer you want to share, then connect from a Chromebook or another browser—on the same Wi-Fi or from a different network.

## What it can do

- Browser-only viewer: no viewer app install needed
- Windows host app with screen sharing, mouse, keyboard, and special-key input
- TURN support for networks where a direct WebRTC connection cannot work
- Persistent Computer ID and computer password on the host
- Recent-computer list on each viewer browser (passwords are not saved)
- Smooth, Balanced, and Crisp stream-quality modes
- Background hosting through the Windows tray and launch-at-sign-in support

## Use DeskLink

### Host computer (Windows)

1. Download the release package and extract it.
2. Open `DeskLink Host App.exe`.
3. Choose the display to share.
4. Set a Computer ID and a strong Computer password. The app remembers both on that Windows account.
5. Choose a stream mode, then select **Start hosting**.

Closing the host window sends it to the notification area instead of ending the session. Right-click the DeskLink tray icon and choose **Quit DeskLink** to fully close it.

### Viewer computer (Chromebook, phone, or browser)

1. Open the DeskLink viewer website configured for the host.
2. For a new computer, enter its Computer ID and Computer password.
3. After the first successful connection, it appears in **Recent computers** on that browser. Choose it next time and enter only the password.

The viewer never stores the computer password.

## Internet connections and TURN

DeskLink uses WebRTC. It tries a direct connection first, then uses a TURN relay when routers or firewalls prevent that path. TURN makes away-from-home connections much more reliable, but can use significant data while it relays video.

To configure a deployed signaling server, set this environment variable in its hosting dashboard (for example, Render):

```text
DESKLINK_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:turn.example.com:3478","turns:turn.example.com:443"],"username":"YOUR_USERNAME","credential":"YOUR_PASSWORD"}]
```

Use real credentials from your TURN provider. Do not commit this value, screenshots containing it, or any `.env` file to GitHub.

## Run the source locally

Requirements: Node.js and npm.

```powershell
npm install
npm start
```

For the development host app:

```powershell
npm run host-app
```

For a public deployment, deploy `server.js` behind HTTPS and set the host app's signaling URL before launching it:

```powershell
$env:DESKLINK_SIGNALING_URL = 'https://your-signal-server.example.com'
npm run host-app
```

## Build a Windows host app

```powershell
npm.cmd run build:win
```

The portable executable is created in `dist/`.

## Publish a release

The release package contains the Windows host app, `desklink-viewer.zip`, and this README:

```text
DeskLink-1.0.0-release.zip
```

Commit the source files and `assets/` folder to GitHub. Do not commit `dist/`, local certificates, `.env` files, TURN credentials, or release archives. Upload the release zip to GitHub Releases instead.

## Current limits

DeskLink sends standard Windows mouse and keyboard input. Some games and anti-cheat systems intentionally reject software-generated input, so game compatibility is not guaranteed. Virtual controller/keyboard drivers are not included.
