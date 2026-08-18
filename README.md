# DeskLink

![DeskLink cosmic logo](assets/desklink-cosmic-logo.png)

DeskLink is a small remote-desktop project with a Windows host app and a browser-only viewer. Run the host on the computer you want to share, then connect from a Chromebook or another browser—on the same Wi-Fi or from a different network.

## Project folders

- `electron-host/` — Windows Electron host-app source and its input helper.
- `assets/` — DeskLink icons and logo files.
- `releases/host/` — complete DeskLink release ZIPs.
- `releases/viewer/` — the browser-only viewer ZIP.
- `backups/source/` — source-code snapshots made before releases.
- `desklink-osk/` — a separate experiment for a custom DeskLink on-screen keyboard.
- `dist/` and `dist-developer/` — temporary build output; these stay out of Git.

## What it can do

- Browser-only viewer: no viewer app install needed
- Windows host app with screen sharing, mouse, keyboard, and special-key input
- TURN support for networks where a direct WebRTC connection cannot work
- Persistent Computer ID and computer password on the host
- Recent-computer list on each viewer browser (passwords are not saved)
- Smooth, Balanced, and Crisp stream-quality modes
- Background hosting through the Windows tray and launch-at-sign-in support
- Optional virtual Xbox controller support through ViGEmBus
- Optional game-keyboard path through Interception (installed separately)

## Credits and optional input projects

DeskLink is an independent personal remote-desktop project. Its optional game-input features are possible because of these community projects:

- [ViGEmBus by Nefarius](https://github.com/nefarius/ViGEmBus) provides the virtual Xbox controller used when a viewer sends controller input. ViGEmBus is retired/archived, but its production-signed installer remains the supported way to install that optional driver. ViGEmBus is licensed under BSD-3-Clause.
- [Interception by Francisco Lopes (oblitum)](https://github.com/oblitum/Interception) provides the optional low-level keyboard bridge used by DeskLink's **Game keyboard driver** setting. The driver is installed separately by the computer owner. DeskLink includes only the official user-mode API library, under Interception's non-commercial LGPL-3.0 terms; see `electron-host/interception-bridge/` for its included license and notice.

DeskLink is not affiliated with, endorsed by, or supported by Nefarius, ViGEmBus, Francisco Lopes, or Interception. Please support the people and projects whose work made these optional features possible.

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
releases/host/DeskLink-1.1.0.zip
releases/viewer/desklink-viewer.zip
```

Commit the source files and `assets/` folder to GitHub. Do not commit `dist/`, local certificates, `.env` files, TURN credentials, or release archives. Upload the release zip to GitHub Releases instead.

## Current limits

DeskLink's standard Windows mouse and keyboard path is meant for normal desktop programs. Some games and anti-cheat systems intentionally reject software-generated input, so game compatibility is not guaranteed. The optional ViGEmBus controller and Interception keyboard paths can improve compatibility in some games, but they are separate, opt-in components and DeskLink does not attempt to bypass an anti-cheat or any game restriction.
