import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button, Card, Field, Label, Pill, ScreenHeader } from '../components/UI';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import type { PlannedActivity, SessionKind, WeeklyActivityTemplate } from '../types';
import type { TranslationKey } from '../lib/i18n';

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Intensity = PlannedActivity['intensity'];

const WEEKDAYS: { offset: Weekday; key: TranslationKey }[] = [
  { offset: 0, key: 'weekday.mon' },
  { offset: 1, key: 'weekday.tue' },
  { offset: 2, key: 'weekday.wed' },
  { offset: 3, key: 'weekday.thu' },
  { offset: 4, key: 'weekday.fri' },
  { offset: 5, key: 'weekday.sat' },
  { offset: 6, key: 'weekday.sun' },
];

const ACTIVITY_TYPES: { kind: SessionKind | 'rest'; labelKey: TranslationKey; intensity: Intensity }[] = [
  { kind: 'rest', labelKey: 'myweek.type.rest', intensity: 'rest' },
  { kind: 'sport', labelKey: 'myweek.type.sport', intensity: 'moderate' },
  { kind: 'match', labelKey: 'myweek.type.match', intensity: 'hard' },
  { kind: 'easy_run', labelKey: 'myweek.type.run', intensity: 'easy' },
  { kind: 'strength', labelKey: 'myweek.type.strength', intensity: 'moderate' },
  { kind: 'combat', labelKey: 'myweek.type.combat', intensity: 'hard' },
  { kind: 'mobility', labelKey: 'myweek.type.mobility', intensity: 'easy' },
  { kind: 'recovery', labelKey: 'myweek.type.recovery', intensity: 'easy' },
  { kind: 'cross_training', labelKey: 'myweek.type.other', intensity: 'moderate' },
];

const INTENSITIES: { value: Intensity; key: TranslationKey }[] = [
  { value: 'easy', key: 'myweek.intensityEasy' },
  { value: 'moderate', key: 'myweek.intensityModerate' },
  { value: 'hard', key: 'myweek.intensityHard' },
];

export function WeeklyScheduleScreen() {
  const navigation = useNavigation<any>();
  const { profile, setProfile } = useTrenr();
  const { t } = useLanguage();
  const { colors, fonts } = useTheme();

  const [tpl, setTpl] = useState<WeeklyActivityTemplate>(profile?.weeklyActivities ?? {});
  const [sport, setSport] = useState(profile?.mainSport?.label ?? '');
  const [saving, setSaving] = useState(false);

  function dayActivity(offset: Weekday): PlannedActivity | null {
    return tpl[offset]?.[0] ?? null;
  }

  function setDayType(offset: Weekday, kind: SessionKind | 'rest') {
    setTpl(prev => {
      if (kind === 'rest') {
        const next = { ...prev };
        delete next[offset];
        return next;
      }
      const existing = prev[offset]?.[0];
      const def = ACTIVITY_TYPES.find(a => a.kind === kind)!;
      return {
        ...prev,
        [offset]: [{
          kind,
          title: existing?.title ?? '',
          intensity: existing?.intensity ?? def.intensity,
          ...(kind === 'match' ? { isMatch: true } : {}),
        }],
      };
    });
  }

  function patchDay(offset: Weekday, patch: Partial<PlannedActivity>) {
    setTpl(prev => {
      const current = prev[offset]?.[0];
      if (!current) return prev;
      return { ...prev, [offset]: [{ ...current, ...patch }] };
    });
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      await setProfile({
        ...profile,
        weeklyActivities: tpl,
        mainSport: sport.trim() ? { label: sport.trim() } : undefined,
      });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        eyebrow={t('myweek.eyebrow')}
        title={t('myweek.title')}
        subtitle={t('myweek.subtitle')}
      />

      <Card>
        <Label>{t('myweek.mainSport')}</Label>
        <Field
          value={sport}
          onChangeText={setSport}
          placeholder={t('myweek.mainSportPlaceholder')}
        />
        <Text style={[styles.hint, { color: colors.faint, fontFamily: fonts.regular }]}>
          {t('myweek.mainSportHint')}
        </Text>
      </Card>

      {WEEKDAYS.map(({ offset, key }) => {
        const activity = dayActivity(offset);
        const activeKind: SessionKind | 'rest' = activity?.kind ?? 'rest';
        return (
          <Card key={offset}>
            <Text style={[styles.dayName, { color: colors.ink, fontFamily: fonts.bold }]}>{t(key)}</Text>
            <View style={styles.pillWrap}>
              {ACTIVITY_TYPES.map(type => (
                <Pill key={type.kind} active={activeKind === type.kind} onPress={() => setDayType(offset, type.kind)}>
                  {t(type.labelKey)}
                </Pill>
              ))}
            </View>

            {activity ? (
              <View style={styles.detail}>
                <Label>{t('myweek.activityLabel')}</Label>
                <Field
                  value={activity.title ?? ''}
                  onChangeText={text => patchDay(offset, { title: text })}
                  placeholder={t('myweek.activityPlaceholder')}
                />
                <Text style={[styles.hint, { color: colors.faint, fontFamily: fonts.regular }]}>{t('myweek.intensity')}</Text>
                <View style={styles.pillWrap}>
                  {INTENSITIES.map(i => (
                    <Pill key={i.value} active={activity.intensity === i.value} onPress={() => patchDay(offset, { intensity: i.value })}>
                      {t(i.key)}
                    </Pill>
                  ))}
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}

      <Button onPress={save} disabled={saving}>{t('common.save')}</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  hint: { fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  dayName: { fontSize: 16, marginBottom: 10 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detail: { marginTop: 12, gap: 4 },
});
