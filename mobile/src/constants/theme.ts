// ── Trenr design system — "Midnight Athletic" ───────────────────────────────
// Dark-first, WHOOP/Strava-premium. Near-black canvas, electric-lime accent,
// big Archivo numerals over a refined Hanken Grotesk body. Existing color keys
// are preserved (nothing breaks); new tokens (accent / bgElev / glow / hairline /
// shadow) power the upgraded components. `green` stays a white-text-safe emerald
// for legacy fills (bubbles/badges); `accent` is the lime signature.

export const lightColors = {
  isDark: false as boolean,
  ink: '#10160D',
  muted: '#586555',
  faint: '#909c87',
  bg: '#edf0e6',
  card: '#ffffff',
  border: '#e0e5d6',
  green: '#2f7d32',
  blue: '#1f73c4',
  orange: '#c4781a',
  red: '#cc4034',
  yellow: '#e6b32c',
  // — Midnight Athletic extended tokens —
  accent: '#4ea51f', // grass-lime that holds contrast on off-white
  accentText: '#0a0c0b',
  bgElev: '#f6f8f1',
  hairline: 'rgba(16,22,13,0.06)',
  glow: 'rgba(78,165,31,0.18)',
  shadow: 'rgba(24,34,16,0.10)',
  // Macro data-viz tints — distinct from status colors so red/green stay alerts.
  macroProtein: '#1f9e7a',
  macroCarb: '#b3801f',
  macroFat: '#4a63c4',
};

export const darkColors = {
  isDark: true as boolean,
  ink: '#eaf2e2',
  muted: '#93a38b',
  faint: '#5d6c57',
  bg: '#0a0c0b', // near-black canvas
  card: '#11150f', // elevated surface, faint green-black
  border: '#222b20',
  green: '#34c06b', // emerald — safe with white text (bubbles/badges) + reads on dark
  blue: '#6cc8ff',
  orange: '#ffb454',
  red: '#ff6257',
  yellow: '#f1d44c',
  // — Midnight Athletic extended tokens —
  accent: '#c8f250', // electric lime — the signature (CTAs, rings, focus)
  accentText: '#0a0c0b', // ink on lime
  bgElev: '#161d14', // raised panels / inputs
  hairline: 'rgba(255,255,255,0.05)',
  glow: 'rgba(200,242,80,0.20)', // accent halo for glows
  shadow: 'rgba(0,0,0,0.45)',
  // Macro data-viz tints — distinct from status colors so red/green stay alerts.
  macroProtein: '#7ce0c3',
  macroCarb: '#e8c27a',
  macroFat: '#9db4ff',
};

// Default colors fallbacks for static styling compatibility
export const colors = lightColors;

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
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const typography = {
  label: 11,
  caption: 12,
  body: 14,
  bodyLarge: 16,
  subhead: 13, // calm, uppercase section titles
  title: 17, // card titles
  screenTitle: 22, // screen headers — quieter, mobile-first
  metric: 32, // secondary big numbers
  heroMetric: 44, // reserved for the single hero number (readiness score)
};

export const sizes = {
  tap: 44,
  button: 52,
  bottomNav: 72,
};

export const statusColors = {
  ready: '#c8f250',
  caution: '#ffb454',
  risk: '#ff6257',
  recovery: '#6cc8ff',
  nutrition: '#34c06b',
  training: '#9fd7ff',
};

// Font family handles. Real families are loaded in ThemeContext (Archivo for
// display/numerals, Hanken Grotesk for body) and exposed via useTheme().fonts.
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
