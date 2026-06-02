import React, { createContext, useContext, useEffect, useState } from 'react';
import { Text, TextInput, useColorScheme } from 'react-native';
import * as Font from 'expo-font';
import {
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
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

// Set a global default body font so even raw <Text> across screens stops
// rendering in the platform system font. Components that need a heavier weight
// set their own fontFamily (Archivo display / Hanken bold), which overrides this.
let appliedGlobalFont = false;
function applyGlobalDefaultFont() {
  if (appliedGlobalFont) return;
  appliedGlobalFont = true;
  const RNText = Text as unknown as { defaultProps?: { style?: unknown } };
  RNText.defaultProps = RNText.defaultProps || {};
  RNText.defaultProps.style = [{ fontFamily: 'HankenGrotesk_400Regular' }, (RNText.defaultProps as any).style].filter(Boolean);
  const RNInput = TextInput as unknown as { defaultProps?: { style?: unknown } };
  RNInput.defaultProps = RNInput.defaultProps || {};
  RNInput.defaultProps.style = [{ fontFamily: 'HankenGrotesk_400Regular' }, (RNInput.defaultProps as any).style].filter(Boolean);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    async function loadResources() {
      try {
        await Font.loadAsync({
          Archivo_700Bold,
          Archivo_800ExtraBold,
          Archivo_900Black,
          HankenGrotesk_400Regular,
          HankenGrotesk_500Medium,
          HankenGrotesk_600SemiBold,
          HankenGrotesk_700Bold,
          HankenGrotesk_800ExtraBold,
        });
        applyGlobalDefaultFont();
      } catch (e) {
        console.warn('Theme: Custom fonts failed to load, falling back to system fonts.', e);
      } finally {
        setFontsReady(true);
      }
    }
    loadResources();
  }, []);

  // Trenr is dark-first (Midnight Athletic). Force dark for now so the brand look
  // is consistent regardless of OS setting; a light toggle can come later.
  void scheme;
  const isDark = true;
  const colors = isDark ? darkColors : lightColors;

  const value: ThemeContextValue = {
    theme: {
      isDark,
      colors,
      fonts: {
        ...fonts,
        regular: fontsReady ? 'HankenGrotesk_400Regular' : 'System',
        medium: fontsReady ? 'HankenGrotesk_500Medium' : 'System',
        bold: fontsReady ? 'HankenGrotesk_700Bold' : 'System',
        extraBold: fontsReady ? 'HankenGrotesk_800ExtraBold' : 'System',
        display: fontsReady ? 'Archivo_800ExtraBold' : 'System',
        number: fontsReady ? 'Archivo_900Black' : 'System',
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
