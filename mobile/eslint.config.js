// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Plain Node/CommonJS scripts (run via `postinstall`, not bundled by Metro).
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: { __dirname: "readonly", module: "readonly", require: "readonly", process: "readonly" },
    },
  },
  {
    rules: {
      // Fires on the standard "fetch/load on mount into local state" hook
      // pattern used throughout this codebase's data hooks — that's an
      // accepted React use case, not a bug, so keep it visible but non-blocking.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
