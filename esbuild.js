const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Ensure out/ exists
if (!fs.existsSync('out')) fs.mkdirSync('out');

// Bundle TypeScript extension
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: false,
  minify: true,
}).then(() => {
  console.log('Bundle OK (Minified) → out/extension.js');
}).catch(e => {
  console.error('Bundle FAILED:', e);
  process.exit(1);
});
