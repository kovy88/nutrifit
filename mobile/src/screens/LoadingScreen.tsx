import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export function LoadingScreen() {
  const { colors, fonts } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.mark, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
      <Text style={[styles.brand, { color: colors.ink, fontFamily: fonts.display }]}>Trenr</Text>
      <Text style={[styles.text, { color: colors.muted, fontFamily: fonts.bold }]}>{t('loading.coach')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28 },
  mark: { width: 72, height: 72, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  brand: { fontSize: 34, fontWeight: '700', lineHeight: 40, letterSpacing: 0 },
  text: { fontSize: 14, fontWeight: '500', lineHeight: 20, textAlign: 'center' },
});
