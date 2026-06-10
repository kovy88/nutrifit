import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export function GoalChip({ active, children, onPress }: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
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
      <Text style={[styles.text, { color: active ? colors.accent : colors.ink, fontFamily: fonts.bold }]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: '47%',
    flexGrow: 1,
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  text: { fontSize: 14, lineHeight: 18, textAlign: 'center' },
});
