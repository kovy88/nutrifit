import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors } from '../constants/theme';

export function H1({ children }: PropsWithChildren) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Subtitle({ children }: PropsWithChildren) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} style={styles.field} {...props} />;
}

export function Button({ children, onPress, variant = 'primary', disabled }: PropsWithChildren<{ onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }>) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        disabled && styles.disabled,
        pressed && !disabled && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonSecondaryText]}>{children}</Text>
    </Pressable>
  );
}

export function Pill({ active, children, onPress }: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, lineHeight: 36 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  field: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, color: colors.ink, backgroundColor: '#fbfbf8', fontSize: 16 },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, paddingHorizontal: 18 },
  buttonSecondary: { backgroundColor: '#eef2ed', borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.red },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  buttonSecondaryText: { color: colors.ink },
  pill: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbfbf8' },
  pillActive: { backgroundColor: colors.green, borderColor: colors.green },
  pillText: { color: colors.muted, fontWeight: '700' },
  pillTextActive: { color: '#fff' },
});
