import { PropsWithChildren, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, Animated } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function H1({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.h1, { color: colors.ink, fontFamily: fonts.extraBold }]}>{children}</Text>;
}

export function Subtitle({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.subtitle, { color: colors.muted, fontFamily: fonts.regular }]}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: any }>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.label, { color: colors.muted, fontFamily: fonts.bold }]}>{children}</Text>;
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
          backgroundColor: colors.isDark ? '#151d1a' : '#fbfbf8',
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

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.green },
        variant === 'secondary' && {
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : '#eef2ed',
          borderWidth: 1,
          borderColor: colors.border,
        },
        variant === 'danger' && { backgroundColor: colors.red },
        disabled && styles.disabled,
        pressed && !disabled && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { fontFamily: fonts.bold },
          variant === 'secondary' && { color: colors.ink },
        ]}
      >
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
          borderColor: active ? colors.green : colors.border,
          backgroundColor: active ? colors.green : (colors.isDark ? '#1b2420' : '#fbfbf8'),
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: active ? '#fff' : colors.muted,
            fontFamily: fonts.bold,
          },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function FadeInView({
  children,
  delay = 0,
  duration = 350,
  style,
}: PropsWithChildren<{
  delay?: number;
  duration?: number;
  style?: any;
}>) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

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
  h1: { fontSize: 30, letterSpacing: -0.5, lineHeight: 36 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 18, borderWidth: 1, padding: 18, gap: 12 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  field: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16 },
  pill: { minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14 },
});

