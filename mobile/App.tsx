import 'react-native-url-polyfill/auto';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { NutriFitProvider, useNutriFit } from './src/context/NutriFitContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LoadingScreen } from './src/screens/LoadingScreen';

function AppShell() {
  const { isReady } = useNutriFit();
  if (!isReady) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <NutriFitProvider>
      <AppShell />
    </NutriFitProvider>
  );
}
