import { PropsWithChildren, ReactNode, useContext } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

type ScreenProps = PropsWithChildren<{
  footer?: ReactNode;
  contentContainerStyle?: ViewStyle;
  scroll?: boolean;
}>;

export function Screen({ children, footer, contentContainerStyle, scroll = true }: ScreenProps) {
  const { colors, isDark } = useTheme();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const insets = useSafeAreaInsets();
  const bottomSpacer = footer ? 28 : Math.max(48, tabBarHeight + 24, insets.bottom + 48);
  const footerBottomPadding = Math.max(10, insets.bottom + 10);
  const content = (
    <>
      {children}
      <View pointerEvents="none" style={{ height: bottomSpacer }} />
    </>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Atmospheric accent glow bleeding down from the top — gives the near-black
          canvas depth instead of a flat fill. Dark mode only; non-interactive. */}
      {isDark && (
        <LinearGradient
          colors={[colors.accent + '1f', colors.accent + '08', 'transparent']}
          locations={[0, 0.45, 1]}
          style={[styles.glow, styles.nonInteractive]}
        />
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {scroll ? (
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, contentContainerStyle]} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.flex, contentContainerStyle]}>{content}</View>
        )}
        {footer ? (
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: footerBottomPadding }]}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flex: 1, overflow: 'hidden' },
  content: { padding: 20, gap: 16 },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
  nonInteractive: { pointerEvents: 'none' },
});
