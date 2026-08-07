# DeskLink browser peer

This package is for the viewer device only. It does not contain, and does not need,
the native Windows host app.

1. Open `visual.html` in Chrome or host these three files on any HTTPS static site.
2. Enter the public signaling URL, for example `https://signal.example.com`, and
   choose **Use server**.
3. Enter the host's room ID and session passcode, then choose **Join**.

The signaling server must expose `/api/host-info` and `/ws` over HTTPS/WSS, and it
must be configured with a TURN server for reliable connections across different
networks. The peer stores only the signaling URL in browser local storage.
