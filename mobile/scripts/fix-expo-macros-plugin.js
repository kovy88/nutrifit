const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

copyExpoMacrosPlugin();
patchExpoModulesJsiBuildScript();

function copyExpoMacrosPlugin() {
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
    return;
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function patchExpoModulesJsiBuildScript() {
  const scriptPath = path.join(
    root,
    'node_modules',
    'expo-modules-jsi',
    'apple',
    'scripts',
    'build-xcframework.sh',
  );

  if (!fs.existsSync(scriptPath)) {
    return;
  }

  let source = fs.readFileSync(scriptPath, 'utf8');

  if (!source.includes('CODE_SIGNING_ALLOWED=NO')) {
    source = source.replace(
      '    SWIFT_COMPILATION_MODE=wholemodule \\\n  )',
      '    SWIFT_COMPILATION_MODE=wholemodule \\\n    CODE_SIGNING_ALLOWED=NO \\\n    CODE_SIGNING_REQUIRED=NO \\\n  )',
    );
  }

  if (!source.includes('xattr -cr "$framework_src"')) {
    source = source.replace(
      `  if [[ ! -d "$framework_src" ]]; then
    log "error: xcodebuild did not produce \${framework_src}"
    exit 1
  fi

  # Replace the slice in place.`,
      `  if [[ ! -d "$framework_src" ]]; then
    log "error: xcodebuild did not produce \${framework_src}"
    exit 1
  fi

  if command -v xattr >/dev/null 2>&1; then
    xattr -cr "$framework_src" 2>/dev/null || true
    if [[ -d "\${product_path}/\${PACKAGE_NAME}.framework.dSYM" ]]; then
      xattr -cr "\${product_path}/\${PACKAGE_NAME}.framework.dSYM" 2>/dev/null || true
    fi
  fi

  # Replace the slice in place.`,
    );
  }

  fs.writeFileSync(scriptPath, source);
}
