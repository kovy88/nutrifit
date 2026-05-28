import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * React Native a její nativní moduly nelze importovat do Node testů. Vitest
 * dostane minimální stub místo skutečného RN. Test code, který se opírá o RN
 * jen v `Platform.OS` / `__DEV__`, projde; testy, které potřebují native
 * komponenty, musí být E2E (Detox) nebo komponentový (RNTL + jest preset).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, './src/__mocks__/react-native.ts'),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        './src/__mocks__/async-storage.ts',
      ),
    },
  },
});
