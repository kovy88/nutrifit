import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as Font from 'expo-font';
import { lightColors, darkColors, fonts, spacing } from '../constants/theme';

type Theme = {
  isDark: boolean;
  colors: typeof lightColors;
  fonts: typeof fonts;
  spacing: typeof spacing;
};

type ThemeContextValue = {
  theme: Theme;
  fontsReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    async function loadResources() {
      try {
        await Font.loadAsync({
          'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
          'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
          'Inter-ExtraBold': require('../../assets/fonts/Inter-ExtraBold.ttf'),
        });
      } catch (e) {
        console.warn('Theme: Custom fonts failed to load, falling back to system fonts.', e);
      } finally {
        setFontsReady(true);
      }
    }
    loadResources();
  }, []);

  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const value: ThemeContextValue = {
    theme: {
      isDark,
      colors,
      fonts: {
        ...fonts,
        // Override with loaded font families if ready
        regular: fontsReady ? 'Inter-Regular' : 'System',
        bold: fontsReady ? 'Inter-Bold' : 'System',
        extraBold: fontsReady ? 'Inter-ExtraBold' : 'System',
      },
      spacing,
    },
    fontsReady,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context.theme;
}
