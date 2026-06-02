import { PropsWithChildren, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, Animated } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function H1({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.h1, { color: colors.ink, fontFamily: fonts.display }]}>{children}</Text>;
}

export function Subtitle({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.subtitle, { color: colors.muted, fontFamily: fonts.regular }]}>{children}</Text>;
}

// Big athletic numeral (Archivo Black) + small uppercase caption — the WHOOP-style
// data read. Use for readiness, kcal, key stats.
export function Stat({ value, label, color, align = 'center' }: { value: React.ReactNode; label?: string; color?: string; align?: 'center' | 'left' }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <Text style={[styles.statValue, { color: color || colors.ink, fontFamily: fonts.number }]}>{value}</Text>
      {label ? <Text style={[styles.statLabel, { color: colors.faint, fontFamily: fonts.bold }]}>{label}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: any }>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.label, { color: colors.faint, fontFamily: fonts.bold }]}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  const { colors, fonts } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      style={[
        styles.field,
        {
          color: colors.ink,
          backgroundColor: colors.bgElev,
          borderColor: colors.border,
          fontFamily: fonts.regular,
        },
      ]}
      {...props}
    />
  );
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: PropsWithChildren<{
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: any;
}>) {
  const { colors, fonts } = useTheme();

  const textColor =
    variant === 'primary' ? colors.accentText : variant === 'danger' ? '#fff' : colors.ink;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && {
          backgroundColor: colors.accent,
          shadowColor: colors.accent,
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
        },
        variant === 'secondary' && {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        variant === 'danger' && { backgroundColor: colors.red },
        disabled && styles.disabled,
        pressed && !disabled && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: textColor, fontFamily: fonts.extraBold }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function Pill({ active, children, onPress }: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
  const { colors, fonts } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent : colors.bgElev,
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: active ? colors.accentText : colors.muted,
            fontFamily: fonts.bold,
          },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

/** Large selectable option row — title (+ optional subtitle) with a radio dot.
 *  Used by the one-question-per-screen onboarding. */
export function Choice({
  active,
  title,
  subtitle,
  onPress,
}: {
  active?: boolean;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent + '14' : colors.bgElev,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.choiceBody}>
        <Text style={[styles.choiceTitle, { color: colors.ink, fontFamily: fonts.bold }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.choiceSub, { color: colors.muted, fontFamily: fonts.regular }]}>{subtitle}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.choiceDot,
          { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : 'transparent' },
        ]}
      />
    </Pressable>
  );
}

export function FadeInView({
  children,
  delay = 0,
  duration = 420,
  style,
}: PropsWithChildren<{
  delay?: number;
  duration?: number;
  style?: any;
}>) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: duration,
        useNativeDriver: true,
        delay: delay,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: duration,
        useNativeDriver: true,
        delay: delay,
      }),
    ]).start();
  }, [delay, duration, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, letterSpacing: -0.8, lineHeight: 37 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  statValue: { fontSize: 46, letterSpacing: -1.5, lineHeight: 50 },
  statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4, marginTop: 2 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    // soft depth (renders on iOS + web via RNW; elevation for Android)
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4 },
  field: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 15.5, letterSpacing: 0.2 },
  pill: { minHeight: 42, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16 },
  choiceBody: { flex: 1, gap: 2 },
  choiceTitle: { fontSize: 16.5, letterSpacing: -0.2 },
  choiceSub: { fontSize: 13, lineHeight: 18 },
  choiceDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
});
