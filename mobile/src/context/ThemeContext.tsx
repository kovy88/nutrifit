import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, Text, TextInput } from 'react-native';
import { darkColors, fonts, spacing } from '../constants/theme';

type Theme = {
  isDark: boolean;
  colors: typeof darkColors;
  fonts: typeof fonts;
  spacing: typeof spacing;
};

type ThemeContextValue = {
  theme: Theme;
  fontsReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
}) ?? 'System';

// Set a global default body font so raw <Text> stays aligned with the app theme.
// Component styles provide weights, keeping the visual language native instead
// of relying on bundled display faces.
let appliedGlobalFont = false;
function applyGlobalDefaultFont() {
  if (appliedGlobalFont) return;
  appliedGlobalFont = true;
  const RNText = Text as unknown as { defaultProps?: { style?: unknown } };
  RNText.defaultProps = RNText.defaultProps || {};
  RNText.defaultProps.style = [{ fontFamily: systemFont }, (RNText.defaultProps as any).style].filter(Boolean);
  const RNInput = TextInput as unknown as { defaultProps?: { style?: unknown } };
  RNInput.defaultProps = RNInput.defaultProps || {};
  RNInput.defaultProps.style = [{ fontFamily: systemFont }, (RNInput.defaultProps as any).style].filter(Boolean);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    applyGlobalDefaultFont();
    setFontsReady(true);
  }, []);

  const isDark = true;
  const colors = darkColors;

  const value: ThemeContextValue = {
    theme: {
      isDark,
      colors,
      fonts: {
        ...fonts,
        regular: systemFont,
        medium: systemFont,
        bold: systemFont,
        extraBold: systemFont,
        display: systemFont,
        number: systemFont,
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
