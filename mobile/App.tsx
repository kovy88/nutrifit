import 'react-native-url-polyfill/auto';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { TrenrProvider, useTrenr } from './src/context/TrenrContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { LanguageProvider, useLanguage } from './src/context/LanguageContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function AppShell() {
  const { isReady } = useTrenr();
  const { isReady: localeReady } = useLanguage();
  const { isDark, colors } = useTheme();

  // Hold the splash until BOTH the profile and the persisted locale have loaded.
  // LanguageProvider starts at detectDeviceLocale() — always 'en' — and swaps in
  // the stored locale asynchronously, so painting before that lands can show the
  // wrong language. It matters most in Onboarding, which builds its first coach
  // message in a useState initialiser that runs exactly once: lose the race there
  // and the greeting stays English for the whole session.
  if (!isReady || !localeReady) return <LoadingScreen />;

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: colors.accent,
          background: colors.bg,
          card: colors.card,
          text: colors.ink,
          border: colors.border,
          notification: colors.accent,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider>
          <TrenrProvider>
            <AppShell />
          </TrenrProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
