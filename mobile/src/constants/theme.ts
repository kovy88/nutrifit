export const lightColors = {
  isDark: false as boolean,
  ink: '#19211d',
  muted: '#68736d',
  faint: '#8d9891',
  bg: '#f7f7f4',
  card: '#ffffff',
  border: '#e3e5de',
  green: '#26734d',
  blue: '#0f6fbe',
  orange: '#c7781f',
  red: '#c6423b',
  yellow: '#f4c542',
};

export const darkColors = {
  isDark: true as boolean,
  ink: '#f7f7f4',
  muted: '#a3b1a9',
  faint: '#6e7e75',
  bg: '#111815',
  card: '#1b2420',
  border: '#2a3630',
  green: '#309965', // Vibrant, high-contrast forest green for dark mode
  blue: '#3b9ffd',
  orange: '#ea9c3f',
  red: '#e95c54',
  yellow: '#fcd35a',
};

// Default colors fallbacks for static styling compatibility
export const colors = lightColors;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const fonts = {
  regular: 'System', // system font fallback
  bold: 'System',
  extraBold: 'System',
  interRegular: 'Inter-Regular',
  interBold: 'Inter-Bold',
  interExtraBold: 'Inter-ExtraBold',
};

