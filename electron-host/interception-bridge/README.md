# Optional Interception game-input bridge

DeskLink can use the Interception driver for its **Game keyboard driver** and **Game mouse driver** settings. Both start on when a viewer connects, but can be turned off in the peer controls. Normal Windows keyboard and mouse input remain available as fallbacks.

The driver itself is installed separately by the computer owner. DeskLink only includes the official 64-bit Interception user-mode library (`interception.dll`) used to communicate with an already-installed driver.

Use it only on computers you own or are allowed to control. Some games or anti-cheat systems may decline low-level input drivers; DeskLink does not attempt to work around those restrictions.

To remove the driver later, run the official Interception installer with `/uninstall` as administrator and restart Windows.

The Interception library is distributed under LGPL-3.0; its license is included beside this file.
