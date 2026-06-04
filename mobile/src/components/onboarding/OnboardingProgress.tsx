import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export function OnboardingProgress({ current, total }: { current: number; total: number }) {
  const { colors } = useTheme();
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color: colors.accent }]}>{current}/{total}</Text>
      <View style={[styles.bg, { backgroundColor: colors.bgElev }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  text: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
  bg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
