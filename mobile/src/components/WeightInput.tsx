// Vstup váhy s jednotkami. Úložiště je vždy kg; tady se zobrazuje/zadává
// v uživatelově jednotce (kg/lb). Lokální textový stav → žádný jitter při psaní;
// převod na kg se hlásí přes onChangeKg.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Field } from './UI';
import { useUnits } from '../hooks/useUnits';
import { useTheme } from '../context/ThemeContext';

export function WeightInput({ weightKg, onChangeKg }: { weightKg: number; onChangeKg: (kg: number) => void }) {
  const { showWeight, toKg, weightUnit } = useUnits();
  const { colors, fonts } = useTheme();
  const [text, setText] = useState(() => (weightKg ? String(showWeight(weightKg)) : ''));

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <Field
          keyboardType="decimal-pad"
          value={text}
          onChangeText={v => {
            setText(v);
            const n = Number(v.replace(',', '.'));
            if (n > 0) onChangeKg(toKg(n));
          }}
        />
      </View>
      <Text style={[styles.unit, { color: colors.muted, fontFamily: fonts.bold }]}>{weightUnit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flex: 1 },
  unit: { fontSize: 15, minWidth: 26 },
});
