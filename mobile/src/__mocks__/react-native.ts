// Minimal RN stub for Vitest. Real RN requires Metro/Babel; for pure-TS unit
// tests we only need a handful of surface APIs.

export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  Version: 17,
  select: <T extends Record<string, unknown>>(opts: T) => {
    return ((opts as any).ios ?? (opts as any).default) as T[keyof T];
  },
};

export const Alert = {
  alert: (_title: string, _msg?: string, _buttons?: unknown[]) => undefined,
};

export const StyleSheet = {
  create: <T>(styles: T) => styles,
  hairlineWidth: 1,
  flatten: (s: unknown) => s,
};

// Stub-out core components/hooks so type imports compile.
export const View = 'View';
export const Text = 'Text';
export const ScrollView = 'ScrollView';
export const Pressable = 'Pressable';
export const TextInput = 'TextInput';
export const ActivityIndicator = 'ActivityIndicator';
export const Modal = 'Modal';
export const Share = { share: async () => ({ action: 'sharedAction' }) };
export const Linking = {
  openURL: async (_url: string) => undefined,
  addEventListener: (_event: string, _handler: (e: { url: string }) => void) => ({
    remove: () => undefined,
  }),
  getInitialURL: async () => null,
};
export const useColorScheme = () => 'light';
