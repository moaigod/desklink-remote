# DeskLink OSK

This is a separate experimental on-screen keyboard app for DeskLink.

The goal is a small Windows keyboard that DeskLink can control by named keys instead of relying on the layout of Windows On-Screen Keyboard.

## Folders

- `src/` — the application source code.
- `assets/` — icons, screenshots, and visual assets.
- `docs/` — design notes and testing notes.
- `releases/` — finished ZIPs or EXEs that are ready to test or publish.

## First version idea

- Native Windows app using C# and WPF.
- Real accessible buttons for `W`, `A`, `S`, `D`, Space, Enter, and other common keys.
- Always-on-top and movable modes.
- Clear pressed-key visuals.
- A local DeskLink connection later, so the host can activate a named key directly.

This app will be a no-driver experiment. It may still not work with every game, but it gives us a keyboard layout and controls that DeskLink owns.
