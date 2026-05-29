import 'react-native-url-polyfill/auto';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { NutriFitProvider, useNutriFit } from './src/context/NutriFitContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';

function AppShell() {
  const { isReady } = useNutriFit();
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
    <LanguageProvider>
      <ThemeProvider>
        <NutriFitProvider>
          <AppShell />
        </NutriFitProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

