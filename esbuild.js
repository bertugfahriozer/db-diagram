const esbuild = require('esbuild');
const fs = require('fs');

if (!fs.existsSync('out')) fs.mkdirSync('out');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  // mysql2 ve pg node_modules olarak VSIX'e ekleniyor,
  // bu yüzden bundle'a dahil etmiyoruz.
  // Bu sayede hex-encoded charset kodu bundle'da olmaz
  // ve Marketplace "suspicious content" hatası vermez.
  external: ['vscode', 'mysql2', 'mysql2/promise', 'pg'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: false,
  minify: false,
}).then(() => {
  const size = (fs.statSync('out/extension.js').size / 1024).toFixed(1);
  console.log(`✓ Bundle OK → out/extension.js (${size} KB)`);
}).catch(e => {
  console.error('✗ Bundle FAILED:', e.message);
  process.exit(1);
});
