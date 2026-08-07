const { build } = require('electron-builder');

build({
  config: {
    appId: 'com.desklink.hostapp',
    productName: 'DeskLink Host App',
    directories: {
      output: 'dist'
    },
    files: [
      'electron-host/**',
      'server.js',
      'visual.html',
      'visual.css',
      'code.js',
      'package.json',
      'node_modules/**'
    ],
    extraFiles: [
      {
        from: '.',
        to: '.',
        filter: ['server.js', 'visual.html', 'visual.css', 'code.js', 'package.json', 'node_modules/**']
      }
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
