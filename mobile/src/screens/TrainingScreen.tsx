import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, H1, Label, Subtitle, FadeInView } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { buildTrainingSessionForDate, toDateKey, formatDateLabel } from '../utils/nutrition';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

export function TrainingScreen() {
  const { profile, selectedDate, setSelectedDate } = useNutriFit();
  const navigation = useNavigation<any>();
  const { colors: themeColors, fonts } = useTheme();

  if (!profile) return null;

  // Get Monday-Sunday training sessions for the week of selectedDate
  function getWeekSessions() {
    if (!profile) return [];
    const baseDate = new Date(selectedDate);
    const day = baseDate.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMonday);

    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateKey = toDateKey(d);
      const session = buildTrainingSessionForDate(profile, d);
      
      const dayNames = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
      const dayLabel = dayNames[d.getDay()];

      list.push({
        dateKey,
        dayLabel,
        formattedDate: `${d.getDate()}. ${d.getMonth() + 1}.`,
        session,
        isToday: dateKey === toDateKey(new Date()),
        isSelected: dateKey === selectedDate,
      });
    }
    return list;
  }

  function handleSelectDay(dateKey: string) {
    setSelectedDate(dateKey);
    navigation.navigate('Dnes');
  }

  const weekList = getWeekSessions();

  return (
    <Screen>
      <H1>Trénink</H1>
      <Subtitle>Tvůj vygenerovaný tréninkový týden na základě cíle: {profile.trainingGoal.toUpperCase().replace('_', ' ')}.</Subtitle>

      <View style={styles.daysList}>
        {weekList.map((item, idx) => {
          const isRest = item.session.kind === 'rest' || item.session.durationMinutes === 0;
          return (
            <FadeInView key={idx} delay={idx * 60}>
              <Pressable
                onPress={() => handleSelectDay(item.dateKey)}
                style={({ pressed }) => [
                  styles.pressableCard,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Card
                  style={[
                    styles.dayCard,
                    item.isSelected && { borderColor: themeColors.green, borderWidth: 2 },
                    isRest && { opacity: 0.85 },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.dayLabel, { color: themeColors.ink, fontFamily: fonts.bold }]}>
                        {item.dayLabel} <Text style={{ fontFamily: fonts.regular, fontWeight: 'normal', color: themeColors.muted }}>({item.formattedDate})</Text>
                      </Text>
                    </View>
                    <View style={styles.badges}>
                      {item.isToday && (
                        <Text style={[styles.todayBadge, { backgroundColor: themeColors.green }]}>Dnes</Text>
                      )}
                      {item.isSelected && (
                        <Text style={[styles.selectedBadge, { backgroundColor: themeColors.blue }]}>Vybráno</Text>
                      )}
                    </View>
                  </View>

                  {isRest ? (
                    <View style={styles.restBody}>
                      <Text style={styles.restText}>☕ Volno & Regenerace</Text>
                      <Text style={[styles.restSub, { color: themeColors.muted }]}>
                        Svaly rostou v klidu. Ideální čas na lehký strečink nebo procházku.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.sessionBody}>
                      <Text style={[styles.sessionTitle, { color: themeColors.ink, fontFamily: fonts.extraBold }]}>
                        🏃 {item.session.title}
                      </Text>
                      <View style={styles.sessionDetails}>
                        <Text style={[styles.detailChip, { backgroundColor: themeColors.isDark ? '#2a3630' : '#eef2ed', color: themeColors.green, fontFamily: fonts.bold }]}>
                          ⏱️ {item.session.durationMinutes} min
                        </Text>
                        <Text
                          style={[
                            styles.detailChip,
                            {
                              backgroundColor: item.session.intensity === 'hard' ? '#fdefee' : '#fefaf0',
                              color: item.session.intensity === 'hard' ? colors.red : colors.orange,
                              fontFamily: fonts.bold,
                            },
                          ]}
                        >
                          🔥 Intenzita: {item.session.intensity.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  )}
                </Card>
              </Pressable>
            </FadeInView>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  daysList: { gap: 14 },
  pressableCard: { width: '100%' },
  dayCard: { padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { fontSize: 16 },
  badges: { flexDirection: 'row', gap: 6 },
  todayBadge: { color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  selectedBadge: { color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  restBody: { gap: 4, marginTop: 4 },
  restText: { fontSize: 15, fontWeight: '800', color: '#c7781f' },
  restSub: { fontSize: 13, lineHeight: 18 },
  sessionBody: { gap: 8, marginTop: 4 },
  sessionTitle: { fontSize: 16 },
  sessionDetails: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  detailChip: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
});
