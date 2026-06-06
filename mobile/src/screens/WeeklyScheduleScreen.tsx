import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button, Card, Field, Label, Pill, ScreenHeader } from '../components/UI';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import type { PlannedActivity, SessionKind, SportId, WeeklyActivityTemplate } from '../types';
import type { TranslationKey } from '../lib/i18n';
import { SPORTS, SPORT_IDS, cloneStarter, type OffFieldSession } from '../lib/training/sports';

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
const SECOND_TYPES = ACTIVITY_TYPES.filter(a => a.kind !== 'rest');

const INTENSITIES: { value: Intensity; key: TranslationKey }[] = [
  { value: 'easy', key: 'myweek.intensityEasy' },
  { value: 'moderate', key: 'myweek.intensityModerate' },
  { value: 'hard', key: 'myweek.intensityHard' },
];

function hasContent(tpl: WeeklyActivityTemplate): boolean {
  return Object.values(tpl).some(list => Array.isArray(list) && list.length > 0);
}

export function WeeklyScheduleScreen() {
  const navigation = useNavigation<any>();
  const { profile, setProfile } = useTrenr();
  const { t, locale } = useLanguage();
  const { colors, fonts } = useTheme();

  const [tpl, setTpl] = useState<WeeklyActivityTemplate>(profile?.weeklyActivities ?? {});
  const [sportId, setSportId] = useState<SportId | null>(profile?.mainSport?.id ?? null);
  const [otherSelected, setOtherSelected] = useState<boolean>(!profile?.mainSport?.id && !!profile?.mainSport?.label);
  const [customLabel, setCustomLabel] = useState(profile?.mainSport?.id ? '' : profile?.mainSport?.label ?? '');
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function pickSport(id: SportId) {
    setSportId(id);
    setOtherSelected(false);
    setAddedMsg(null);
    if (!hasContent(tpl)) setTpl(cloneStarter(id)); // prázdný týden → naseeduj typický
  }

  function pickOther() {
    setSportId(null);
    setOtherSelected(true);
    setAddedMsg(null);
  }

  function loadStarter() {
    if (sportId) {
      setTpl(cloneStarter(sportId));
      setAddedMsg(null);
    }
  }

  function addOffField(o: OffFieldSession) {
    let target: Weekday | null = null;
    for (let d = 0 as Weekday; d <= 6; d = (d + 1) as Weekday) {
      if (!(tpl[d]?.length)) { target = d; break; }
    }
    if (target === null) {
      for (let d = 0 as Weekday; d <= 6; d = (d + 1) as Weekday) {
        if ((tpl[d]?.length ?? 0) === 1) { target = d; break; }
      }
    }
    if (target === null) { setAddedMsg(t('myweek.weekFull')); return; }
    const day = target;
    const title = o.title(locale);
    setTpl(prev => {
      const arr = [...(prev[day] ?? [])];
      arr.push({ kind: o.kind, intensity: o.intensity, title });
      return { ...prev, [day]: arr };
    });
    setAddedMsg(t('myweek.addedTo', { activity: title, day: t(WEEKDAYS[day].key) }));
  }

  function dayActs(offset: Weekday): PlannedActivity[] {
    return tpl[offset] ?? [];
  }

  function setType(offset: Weekday, index: number, kind: SessionKind | 'rest') {
    setTpl(prev => {
      if (index === 0 && kind === 'rest') {
        const next = { ...prev };
        delete next[offset];
        return next;
      }
      const arr = [...(prev[offset] ?? [])];
      const def = ACTIVITY_TYPES.find(a => a.kind === kind)!;
      const existing = arr[index];
      arr[index] = {
        kind: kind as SessionKind,
        title: existing?.title ?? '',
        intensity: existing?.intensity ?? def.intensity,
        ...(kind === 'match' ? { isMatch: true } : {}),
      };
      return { ...prev, [offset]: arr };
    });
  }

  function patch(offset: Weekday, index: number, p: Partial<PlannedActivity>) {
    setTpl(prev => {
      const arr = [...(prev[offset] ?? [])];
      if (!arr[index]) return prev;
      arr[index] = { ...arr[index], ...p };
      return { ...prev, [offset]: arr };
    });
  }

  function addSecond(offset: Weekday) {
    setTpl(prev => {
      const arr = [...(prev[offset] ?? [])];
      if (!arr[0] || arr[1]) return prev;
      arr[1] = { kind: 'easy_run', title: '', intensity: 'easy' };
      return { ...prev, [offset]: arr };
    });
  }

  function removeSecond(offset: Weekday) {
    setTpl(prev => {
      const arr = prev[offset] ?? [];
      if (arr.length < 2) return prev;
      return { ...prev, [offset]: [arr[0]] };
    });
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const mainSport = sportId
        ? { id: sportId, label: SPORTS[sportId].name(locale) }
        : (customLabel.trim() ? { label: customLabel.trim() } : undefined);
      await setProfile({ ...profile, weeklyActivities: tpl, mainSport });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  function renderUnit(offset: Weekday, index: number, activity: PlannedActivity, types: typeof ACTIVITY_TYPES) {
    return (
      <View style={styles.detail}>
        <View style={styles.pillWrap}>
          {types.map(type => (
            <Pill key={type.kind} active={activity.kind === type.kind} onPress={() => setType(offset, index, type.kind)}>
              {t(type.labelKey)}
            </Pill>
          ))}
        </View>
        <Field
          value={activity.title ?? ''}
          onChangeText={text => patch(offset, index, { title: text })}
          placeholder={t('myweek.activityPlaceholder')}
        />
        <Text style={[styles.hint, { color: colors.faint, fontFamily: fonts.regular }]}>{t('myweek.intensity')}</Text>
        <View style={styles.pillWrap}>
          {INTENSITIES.map(i => (
            <Pill key={i.value} active={activity.intensity === i.value} onPress={() => patch(offset, index, { intensity: i.value })}>
              {t(i.key)}
            </Pill>
          ))}
        </View>
      </View>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        eyebrow={t('myweek.eyebrow')}
        title={t('myweek.title')}
        subtitle={t('myweek.subtitle')}
      />

      {/* Hlavní sport — picker z knihovny + „Jiné" */}
      <Card>
        <Label>{t('myweek.mainSport')}</Label>
        <View style={styles.pillWrap}>
          {SPORT_IDS.map(id => (
            <Pill key={id} active={sportId === id} onPress={() => pickSport(id)}>{SPORTS[id].name(locale)}</Pill>
          ))}
          <Pill active={otherSelected} onPress={pickOther}>{t('myweek.sportOther')}</Pill>
        </View>
        {sportId === null && otherSelected ? (
          <Field value={customLabel} onChangeText={setCustomLabel} placeholder={t('myweek.mainSportPlaceholder')} />
        ) : null}
        <Text style={[styles.hint, { color: colors.faint, fontFamily: fonts.regular }]}>{t('myweek.mainSportHint')}</Text>
        {sportId && hasContent(tpl) ? (
          <View style={styles.addSecondRow}>
            <Pill onPress={loadStarter}>{t('myweek.loadStarter')}</Pill>
          </View>
        ) : null}
      </Card>

      {/* Off-field doporučení pro vybraný sport */}
      {sportId ? (
        <Card>
          <Label>{t('myweek.offFieldTitle', { sport: SPORTS[sportId].name(locale) })}</Label>
          <Text style={[styles.hint, { color: colors.faint, fontFamily: fonts.regular }]}>{t('myweek.offFieldHint')}</Text>
          <View style={styles.pillWrap}>
            {SPORTS[sportId].offField.map((o, i) => (
              <Pill key={i} onPress={() => addOffField(o)}>{o.title(locale)}</Pill>
            ))}
          </View>
          {addedMsg ? <Text style={[styles.added, { color: colors.accent, fontFamily: fonts.bold }]}>{addedMsg}</Text> : null}
        </Card>
      ) : null}

      {WEEKDAYS.map(({ offset, key }) => {
        const acts = dayActs(offset);
        const primary = acts[0] ?? null;
        const second = acts[1] ?? null;
        const activeKind: SessionKind | 'rest' = primary?.kind ?? 'rest';
        return (
          <Card key={offset}>
            <Text style={[styles.dayName, { color: colors.ink, fontFamily: fonts.bold }]}>{t(key)}</Text>
            <View style={styles.pillWrap}>
              {ACTIVITY_TYPES.map(type => (
                <Pill key={type.kind} active={activeKind === type.kind} onPress={() => setType(offset, 0, type.kind)}>
                  {t(type.labelKey)}
                </Pill>
              ))}
            </View>

            {primary ? (
              <>
                {renderUnit(offset, 0, primary, ACTIVITY_TYPES)}

                {second ? (
                  <View style={[styles.secondBlock, { borderTopColor: colors.border }]}>
                    <View style={styles.secondHeader}>
                      <Text style={[styles.secondTitle, { color: colors.accent, fontFamily: fonts.bold }]}>{t('myweek.secondUnit')}</Text>
                      <Pill onPress={() => removeSecond(offset)}>{t('myweek.removeSecond')}</Pill>
                    </View>
                    {renderUnit(offset, 1, second, SECOND_TYPES)}
                  </View>
                ) : (
                  <View style={styles.addSecondRow}>
                    <Pill onPress={() => addSecond(offset)}>{t('myweek.addSecond')}</Pill>
                  </View>
                )}
              </>
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
  added: { fontSize: 13, marginTop: 8 },
  dayName: { fontSize: 16, marginBottom: 10 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detail: { marginTop: 12, gap: 4 },
  secondBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  secondHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secondTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  addSecondRow: { marginTop: 12, flexDirection: 'row' },
});
