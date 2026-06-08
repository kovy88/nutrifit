import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../constants/theme';
import { formatDateLabel, isToday, toDateKey } from '../utils/nutrition';

export function DateHeader() {
  const { selectedDate, setSelectedDate } = useTrenr();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();

  function adjustDate(days: number) {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(toDateKey(current));
  }

  function goToToday() {
    setSelectedDate(toDateKey(new Date()));
  }

  const today = isToday(selectedDate);

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.prevDay')} onPress={() => adjustDate(-1)} style={({ pressed }) => [styles.arrowBtn, { backgroundColor: colors.bgElev }, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
        </Pressable>

        <View style={styles.dateLabelContainer}>
          <Text style={[styles.dateText, { color: colors.ink }]}>{formatDateLabel(selectedDate, locale)}</Text>
          <Text style={[styles.dateSubText, { color: colors.faint }]}>{selectedDate}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.nextDay')} onPress={() => adjustDate(1)} style={({ pressed }) => [styles.arrowBtn, { backgroundColor: colors.bgElev }, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={20} color={colors.accent} />
        </Pressable>
      </View>

      {!today && (
        <Pressable onPress={goToToday} style={({ pressed }) => [styles.todayBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}>
          <Text style={[styles.todayBtnText, { color: colors.accentText }]}>{t('common.today')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  dateLabelContainer: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '800',
  },
  dateSubText: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  todayBtn: {
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    fontWeight: '800',
    fontSize: 12,
  },
});
