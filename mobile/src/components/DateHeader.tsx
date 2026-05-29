import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { useLanguage } from '../context/LanguageContext';
import { formatDateLabel, isToday, toDateKey } from '../utils/nutrition';

export function DateHeader() {
  const { selectedDate, setSelectedDate } = useNutriFit();
  const { t } = useLanguage();

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
    <View style={styles.container}>
      <View style={styles.navRow}>
        <Pressable onPress={() => adjustDate(-1)} style={({ pressed }) => [styles.arrowBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={20} color={colors.green} />
        </Pressable>

        <View style={styles.dateLabelContainer}>
          <Text style={styles.dateText}>{formatDateLabel(selectedDate)}</Text>
          <Text style={styles.dateSubText}>{selectedDate}</Text>
        </View>

        <Pressable onPress={() => adjustDate(1)} style={({ pressed }) => [styles.arrowBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={20} color={colors.green} />
        </Pressable>
      </View>

      {!today && (
        <Pressable onPress={goToToday} style={({ pressed }) => [styles.todayBtn, pressed && styles.pressed]}>
          <Text style={styles.todayBtnText}>{t('common.today')}</Text>
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
    paddingVertical: spacingOrTen(),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    backgroundColor: '#eef2ed',
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
    color: colors.ink,
  },
  dateSubText: {
    fontSize: 11,
    color: colors.faint,
    marginTop: 2,
    fontWeight: '600',
  },
  todayBtn: {
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
});

function spacingOrTen() {
  return 10;
}
