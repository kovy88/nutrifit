const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node_modules', '@expo', 'expo-modules-macros-plugin');
const target = path.join(
  root,
  'node_modules',
  'expo-modules-core',
  'node_modules',
  '@expo',
  'expo-modules-macros-plugin',
);

if (!fs.existsSync(source)) {
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });

