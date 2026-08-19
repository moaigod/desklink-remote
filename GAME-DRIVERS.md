# DeskLink game-driver setup

These are optional and install **only on the Windows host computer**. The Chromebook, phone, or other browser peer does not need either driver.

## ViGEmBus — virtual Xbox controller

Use this only if a viewer will send a controller to the host.

1. Open `driver-installers/ViGEmBus_1.22.0_x64_x86_arm64.exe` from the DeskLink release package, or download it from [ViGEmBus Releases](https://github.com/nefarius/ViGEmBus/releases).
2. Run the installer on the Windows host and follow its prompts.
3. Restart Windows if the installer asks.
4. In DeskLink, connect from a browser with a controller connected to that browser device. DeskLink creates the virtual Xbox controller automatically.

## Interception — game keyboard and mouse

Use this only when a game ignores DeskLink's standard Windows keyboard or mouse input.

1. Extract `driver-installers/Interception-1.0.1.zip` from the DeskLink release package, or download it from [Interception Releases](https://github.com/oblitum/Interception/releases).
2. Open the extracted `command line installer` folder and run `install-interception.exe` **as Administrator** on the Windows host.
3. Restart Windows after installation.
4. Start DeskLink and connect. **Game keyboard driver** and **Game mouse driver** are on by default in the peer settings.
5. For a game that needs centered/relative mouse movement, fullscreen the peer and press `\` to toggle game-mouse mode. Press `\` again to release the client cursor.

If a game behaves strangely, use the peer settings to turn the matching game driver off. Some games or anti-cheat systems may reject input-filter drivers; DeskLink does not bypass those restrictions.

## Sharing DeskLink

The DeskLink 1.1.1 release includes unmodified copies of the official driver packages for convenience. They are never installed automatically: each host owner must choose whether to run them, accept their terms, and restart Windows when required. The official release pages above remain the source of truth for newer versions and license information.
