import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function LoadingScreen() {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.mark, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
      <Text style={[styles.brand, { color: colors.ink, fontFamily: fonts.display }]}>Trenr</Text>
      <Text style={[styles.text, { color: colors.muted, fontFamily: fonts.bold }]}>Načítám tvého kouče...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28 },
  mark: { width: 74, height: 74, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  brand: { fontSize: 34, lineHeight: 40, letterSpacing: 0 },
  text: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
