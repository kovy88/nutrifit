// ── Trenr design system — premium dark coach UI ────────────────────────────
// The whole mobile app now shares the same athletic, calm dark surface as the
// chat onboarding. Existing keys are preserved so component APIs stay stable.

const premiumDarkColors = {
  isDark: true as boolean,
  ink: '#F4F7EF',
  muted: '#A2AD9B',
  faint: '#6E7868',
  bg: '#050806',
  card: '#101710',
  border: 'rgba(232,241,224,0.12)',
  green: '#42D77D',
  blue: '#7CCBFF',
  orange: '#FFB454',
  red: '#FF6B5E',
  yellow: '#FFD166',
  accent: '#C8F250',
  accentText: '#071008',
  bgElev: '#0B110D',
  hairline: 'rgba(232,241,224,0.10)',
  glow: 'rgba(200,242,80,0.14)',
  shadow: 'rgba(0,0,0,0.48)',
  macroProtein: '#B899FF',
  macroCarb: '#FFCF70',
  macroFat: '#7CCBFF',
};

export const lightColors = premiumDarkColors;
export const darkColors = premiumDarkColors;

// Default colors fallbacks for static styling compatibility
export const colors = premiumDarkColors;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const typography = {
  label: 11,
  caption: 12,
  body: 14,
  bodyLarge: 16,
  title: 20,
  screenTitle: 32,
  metric: 40,
  heroMetric: 52,
};

export const sizes = {
  tap: 44,
  button: 52,
  bottomNav: 72,
};

export const statusColors = {
  ready: '#C8F250',
  caution: '#FFB454',
  risk: '#FF6B5E',
  recovery: '#7CCBFF',
  nutrition: '#42D77D',
  training: '#B899FF',
};

// Font family handles. ThemeContext maps these to platform system fonts while
// component styles provide the requested weights.
export const fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  extraBold: 'System',
  display: 'System',
  number: 'System',
  // legacy aliases (kept so older imports don't break)
  interRegular: 'Inter-Regular',
  interBold: 'Inter-Bold',
  interExtraBold: 'Inter-ExtraBold',
};
