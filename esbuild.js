const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: false,
}).then(() => console.log('Bundle OK')).catch(e => { console.error(e); process.exit(1); });
