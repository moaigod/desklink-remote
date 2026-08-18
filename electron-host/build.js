const { build } = require('electron-builder');
const developerBuild = process.env.DESKLINK_DEVELOPER_BUILD === '1';

build({
  config: {
    appId: 'com.desklink.hostapp',
    productName: developerBuild ? 'DeskLink Developer' : 'DeskLink Host App',
    directories: {
      output: developerBuild ? 'dist-developer' : 'dist'
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
      'assets/**',
      'desklink-osk/releases/DeskLinkOSK-0.1.0/**',
      'package.json'
    ],
    win: {
      target: ['portable'],
      icon: 'assets/desklink-cosmic.ico'
    }
  }
}).then(() => {
  console.log('Build complete');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
