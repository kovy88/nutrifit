import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

export function Screen({ children }: PropsWithChildren) {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Atmospheric accent glow bleeding down from the top — gives the near-black
          canvas depth instead of a flat fill. Dark mode only; non-interactive. */}
      {isDark && (
        <LinearGradient
          pointerEvents="none"
          colors={[colors.accent + '1f', colors.accent + '08', 'transparent']}
          locations={[0, 0.45, 1]}
          style={styles.glow}
        />
      )}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
});
