import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export function GoalChip({
  active,
  children,
  subtitle,
  onPress,
}: PropsWithChildren<{ active?: boolean; subtitle?: string; onPress?: () => void }>) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent + '1F' : colors.bgElev,
        },
        pressed && { opacity: 0.88 },
      ]}
    >
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.9}
        style={[styles.text, { color: active ? colors.accent : colors.ink, fontFamily: fonts.bold }]}
      >
        {children}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted, fontFamily: fonts.regular }]}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 6,
  },
  text: { fontSize: 15, lineHeight: 19, textAlign: 'left' },
  subtitle: { fontSize: 12, lineHeight: 15, textAlign: 'left' },
});
