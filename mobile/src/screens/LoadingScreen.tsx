import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.green} />
      <Text style={styles.text}>Načítám NutriFit…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 12 },
  text: { color: colors.muted, fontWeight: '700' },
});
