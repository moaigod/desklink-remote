const { build } = require('electron-builder');

build({
  config: {
    appId: 'com.desklink.hostapp',
    productName: 'DeskLink Host App',
    directories: {
      output: 'dist'
    },
    // Keep the portable beginner build simple and avoid archive-layout issues.
    // This is a convenience package, not a security boundary.
    asar: false,
    files: [
      'electron-host/**',
      'server.js',
      'visual.html',
      'visual.css',
      'code.js',
      'package.json'
    ],
    win: {
      target: ['portable']
    }
  }
}).then(() => {
  console.log('Build complete');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
