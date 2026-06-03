import 'react-native-url-polyfill/auto';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { TrenrProvider, useTrenr } from './src/context/TrenrContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function AppShell() {
  const { isReady } = useTrenr();
  const { isDark } = useTheme();

  if (!isReady) return <LoadingScreen />;

  return (
    <NavigationContainer>
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

