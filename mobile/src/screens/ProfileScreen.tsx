import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { Button, Card, CoachInsightCard, Field, Label, Pill, ScreenHeader, SectionCard } from '../components/UI';
import { Screen } from '../components/Screen';
import { WeightInput } from '../components/WeightInput';
import { useTrenr } from '../context/TrenrContext';
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { deleteAccount, exportAccountData } from '../services/api';
import type { CoachScope, DietStyle, NutritionMode, PlanIntensity, TrainingGoalKind } from '../types';
import { resolveCoachScope, scopeHasTraining } from '../types';
import { activityFactorForSessions } from '../utils/nutrition';
import { useWeeklySummary } from '../hooks/useWeeklySummary';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { USER_PRIMARY_GOALS, isRunRaceGoal } from '../constants/goals';
import type { TranslationKey } from '../lib/i18n';
import { profileSetupCompleteness, type SetupMissingItem } from '../lib/onboarding/validation';
import { WeeklyCheckInModal } from '../components/WeeklyCheckInModal';

export function ProfileScreen() {
  const { profile, setProfile, resetLocalProfile, purgeAllUserData, user, signIn, signOut, signUp } = useTrenr();
  const navigation = useNavigation<any>();
  const weeklySummary = useWeeklySummary();
  const syncStatus = useSyncStatus();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  const [showCheckIn, setShowCheckIn] = useState(false);

  if (!profile) return null;
  const scope = resolveCoachScope(profile);
  const setup = profileSetupCompleteness(profile);

  async function login() {
    try {
      await signIn(auth.email.trim(), auth.password);
    } catch (err) {
      Alert.alert(t('profile.loginFailed'), err instanceof Error ? err.message : t('profile.tryAgain'));
    }
  }

  async function register() {
    try {
      await signUp(auth.name.trim(), auth.email.trim(), auth.password);
      Alert.alert(t('profile.registerDone'), t('profile.registerDoneMsg'));
    } catch (err) {
      Alert.alert(t('profile.registerFailed'), err instanceof Error ? err.message : t('profile.tryAgain'));
    }
  }

  async function exportData() {
    try {
      const data = await exportAccountData();
      Alert.alert(t('profile.exportReady'), t('profile.exportSummary', { profile: t(data.profile ? 'common.yes' : 'common.no'), count: data.mealHistory?.length || 0 }));
    } catch (err) {
      Alert.alert(t('profile.exportFailed'), err instanceof Error ? err.message : t('profile.signInAgain'));
    }
  }

  async function confirmDelete() {
    Alert.alert(t('profile.deleteTitle'), t('profile.deleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            // Server-side deletion succeeded — now wipe all local data
            // (profile, plans, food logs, training sessions, weights, consent).
            await purgeAllUserData();
          } catch (err) {
            Alert.alert(t('profile.deleteFailed'), err instanceof Error ? err.message : t('profile.deleteFailedMsg'));
          }
        },
      },
    ]);
  }

  const trainingGoalLabel = trainingGoals.find(g => g.value === profile.trainingGoal)?.label ?? profile.trainingGoal;
  const nutritionModeLabel = t(
    nutritionModes.find(m => m.value === (profile.nutritionMode ?? 'balanced'))?.labelKey ?? 'nutritionMode.balanced',
  );

  return (
    <Screen>
      <ScreenHeader eyebrow={t('tab.profile')} title={t('profile.title')} subtitle={t('profile.subtitle')} />

      {!setup.complete ? (
        <CoachInsightCard title={t('setup.profileTitle')} body={t('setup.profileBody', { count: setup.missing.length })} accent={colors.blue}>
          <View style={styles.setupList}>
            {setup.missing.slice(0, 3).map(item => (
              <Text key={item} style={[styles.setupItem, { color: colors.ink }]}>• {t(setupMissingLabelKey(item))}</Text>
            ))}
          </View>
        </CoachInsightCard>
      ) : null}

      {/* Goal & focus */}
      <SectionCard
        title={t('profile.coachSetup')}
        summary={`${t(`goal.${profile.primaryGoal}` as TranslationKey)} · ${t(('scope.' + scope) as 'scope.both')}`}
      >
        <Label>{t('profile.focus')}</Label>
        <View style={styles.rowWrap}>
          {(['both', 'training', 'nutrition'] as CoachScope[]).map(s => (
            <Pill key={s} active={scope === s} onPress={() => setProfile({ ...profile, coachScope: s })}>
              {t(('scope.' + s) as 'scope.both')}
            </Pill>
          ))}
        </View>
        <Label>{t('profile.mainGoal')}</Label>
        <View style={styles.rowWrap}>
          {USER_PRIMARY_GOALS.map(goal => (
            <Pill
              key={goal.value}
              active={profile.primaryGoal === goal.value}
              onPress={() => setProfile({ ...profile, primaryGoal: goal.value, trainingGoal: goal.trainingGoal })}
            >
              {t(goal.labelKey)}
            </Pill>
          ))}
        </View>
      </SectionCard>

      {/* Training setup */}
      <SectionCard title={t('profile.trainingSchedule')} summary={`${trainingGoalLabel} · ${profile.sessionsPerWeek}×`}>
        <Label>{t('profile.trainingGoal')}</Label>
        <View style={styles.rowWrap}>
          {trainingGoals.map(goal => (
            <Pill key={goal.value} active={profile.trainingGoal === goal.value} onPress={() => setProfile({ ...profile, trainingGoal: goal.value })}>{goal.label}</Pill>
          ))}
        </View>
        <Label>{t('profile.sessionsPerWeek')}</Label>
        <View style={styles.rowWrap}>
          {[1, 2, 3, 4, 5, 6].map(count => (
            <Pill key={count} active={profile.sessionsPerWeek === count} onPress={() => setProfile({ ...profile, sessionsPerWeek: count, activityFactor: activityFactorForSessions(count) })}>{count}×</Pill>
          ))}
        </View>
        {scopeHasTraining(scope) ? (
          <>
            <Label>{t('profile.restDays')}</Label>
            <View style={styles.rowWrap}>
              {WEEKDAY_REST.map(day => (
                <Pill
                  key={day.value}
                  active={(profile.preferredRestDays ?? []).includes(day.value)}
                  onPress={() => setProfile({ ...profile, preferredRestDays: toggleRestDay(profile.preferredRestDays, day.value) })}
                >
                  {t(day.labelKey)}
                </Pill>
              ))}
            </View>
          </>
        ) : null}
        {isRunRaceGoal(profile.trainingGoal) ? (
          <>
            <Label>{t('onb.targetTimeOptional')}</Label>
            <Field
              keyboardType="number-pad"
              value={profile.targetTimeSeconds ? String(Math.round(profile.targetTimeSeconds / 60)) : ''}
              onChangeText={value => {
                const minutes = parseOptionalInt(value, 24 * 60);
                setProfile({ ...profile, targetTimeSeconds: minutes ? minutes * 60 : undefined });
              }}
              placeholder={t('onb.targetTimePlaceholder')}
            />
            <Label>{t('onb.currentPaceOptional')}</Label>
            <Field
              keyboardType="number-pad"
              value={profile.currentPaceSecPerKm ? String(profile.currentPaceSecPerKm) : ''}
              onChangeText={value => setProfile({ ...profile, currentPaceSecPerKm: parseOptionalInt(value, 900) })}
              placeholder={t('onb.currentPacePlaceholder')}
            />
          </>
        ) : null}
        <Button onPress={() => setShowCheckIn(true)}>{t('profile.weeklyCheckIn')}</Button>
        <Button
          variant="secondary"
          disabled={weeklySummary.isGenerating}
          onPress={() => weeklySummary.generate()}
        >
          {weeklySummary.isGenerating ? t('profile.aiSummaryGenerating') : t('profile.aiSummary')}
        </Button>
      </SectionCard>

      {/* Nutrition preferences */}
      <SectionCard
        title={t('profile.nutritionPrefs')}
        summary={`${nutritionModeLabel} · ${t(`diet.${profile.diet}` as TranslationKey)}`}
      >
        <Label>{t('profile.currentWeight')}</Label>
        <WeightInput weightKg={profile.weight} onChangeKg={weight => setProfile({ ...profile, weight })} />
        <Label>{t('profile.nutritionMode')}</Label>
        <View style={styles.rowWrap}>
          {nutritionModes.map(mode => (
            <Pill key={mode.value} active={(profile.nutritionMode ?? 'balanced') === mode.value} onPress={() => setProfile({ ...profile, nutritionMode: mode.value })}>{t(mode.labelKey)}</Pill>
          ))}
        </View>
        <Label>{t('profile.planIntensity')}</Label>
        <View style={styles.rowWrap}>
          {planIntensities.map(intensity => (
            <Pill key={intensity.value} active={(profile.planIntensity ?? 'moderate') === intensity.value} onPress={() => setProfile({ ...profile, planIntensity: intensity.value })}>{t(intensity.labelKey)}</Pill>
          ))}
        </View>
        <Label>{t('profile.dietType')}</Label>
        <View style={styles.rowWrap}>
          {dietStyles.map(diet => (
            <Pill key={diet} active={profile.diet === diet} onPress={() => setProfile({ ...profile, diet })}>{t(`diet.${diet}` as TranslationKey)}</Pill>
          ))}
        </View>
        <Label>{t('profile.foodLikes')}</Label>
        <Field value={profile.likes} onChangeText={likes => setProfile({ ...profile, likes })} placeholder={t('profile.foodLikesPlaceholder')} multiline />
        <Label>{t('profile.foodDislikes')}</Label>
        <Field value={profile.dislikes} onChangeText={dislikes => setProfile({ ...profile, dislikes })} placeholder={t('profile.foodDislikesPlaceholder')} multiline />
      </SectionCard>

      {/* Health data */}
      <SectionCard title={t('profile.healthData')} summary={t('profile.healthDataShort')}>
        <Text style={[styles.copy, { color: colors.muted }]}>{t('profile.healthDataBody')}</Text>
        <Button variant="secondary" onPress={() => navigation.navigate('Settings')}>
          {t('profile.healthSettings')}
        </Button>
        <Button variant="secondary" onPress={() => resetLocalProfile()}>{t('profile.restartOnboarding')}</Button>
      </SectionCard>

      {/* AI weekly summary — last generated review */}
      {weeklySummary.summary && (
        <Card>
          <Label>Týdenní AI shrnutí</Label>
          <Text style={[styles.summaryHeadline, { color: colors.ink }]}>{weeklySummary.summary.headline}</Text>
          {weeklySummary.summary.highlights.length > 0 && (
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={[styles.summarySectionLabel, { color: colors.muted }]}>✓ Co šlo</Text>
              {weeklySummary.summary.highlights.map((h, i) => (
                <Text key={`hl-${i}`} style={[styles.summaryBullet, { color: colors.ink }]}>• {h}</Text>
              ))}
            </View>
          )}
          {weeklySummary.summary.concerns.length > 0 && (
            <View style={{ marginTop: 10, gap: 4 }}>
              <Text style={[styles.summarySectionLabel, { color: colors.muted }]}>Hlídej</Text>
              {weeklySummary.summary.concerns.map((c, i) => (
                <Text key={`cn-${i}`} style={[styles.summaryBullet, { color: colors.ink }]}>• {c}</Text>
              ))}
            </View>
          )}
          {weeklySummary.summary.recommendation && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.summarySectionLabel, { color: colors.muted }]}>→ Příští týden</Text>
              <Text style={[styles.summaryRec, { color: colors.green }]}>{weeklySummary.summary.recommendation}</Text>
            </View>
          )}
          {weeklySummary.generatedAt && (
            <Text style={[styles.summaryMeta, { color: colors.faint }]}>
              Vygenerováno {new Date(weeklySummary.generatedAt).toLocaleDateString('cs-CZ')} pro týden {weeklySummary.weekStartISO}
            </Text>
          )}
        </Card>
      )}
      {weeklySummary.error && (
        <Card>
          <Text style={[styles.errorText, { color: colors.red }]}>
            Chyba při generování AI shrnutí: {weeklySummary.error}
          </Text>
        </Card>
      )}

      {/* Account */}
      <SectionCard title={t('profile.account')} summary={`${user?.email ?? t('profile.notSignedIn')} · ${syncStatus.status}`}>
        <Text style={[styles.copy, { color: colors.muted }]}>
          Sync: {syncStatus.status}
          {syncStatus.pendingWrites ? ` · pending ${syncStatus.pendingWrites}` : ''}
          {syncStatus.lastSyncedAt ? ` · ${new Date(syncStatus.lastSyncedAt).toLocaleString()}` : ''}
        </Text>
        {syncStatus.error && <Text style={[styles.errorText, { color: colors.red }]}>{syncStatus.error}</Text>}
        {user ? (
          <>
            <Text style={[styles.user, { color: colors.ink }]}>{user.email}</Text>
            <Button variant="secondary" onPress={exportData}>{t('profile.exportData')}</Button>
            <Button variant="secondary" onPress={signOut}>{t('profile.signOut')}</Button>
            <Button variant="danger" onPress={confirmDelete}>{t('profile.deleteAccount')}</Button>
          </>
        ) : (
          <>
            <Field value={auth.name} onChangeText={name => setAuth(v => ({ ...v, name }))} placeholder="Jméno pro registraci" />
            <Field autoCapitalize="none" keyboardType="email-address" value={auth.email} onChangeText={email => setAuth(v => ({ ...v, email }))} placeholder="E-mail" />
            <Field secureTextEntry value={auth.password} onChangeText={password => setAuth(v => ({ ...v, password }))} placeholder="Heslo" />
            <View style={styles.row}>
              <Button variant="secondary" onPress={login}>Přihlásit</Button>
              <Button onPress={register}>Registrovat</Button>
            </View>
          </>
        )}
      </SectionCard>

      {/* Privacy & safety */}
      <SectionCard title={t('profile.privacySafety')} summary={t('profile.privacyShort')}>
        <Text style={[styles.copy, { color: colors.muted }]}>Trenr není zdravotnický prostředek, nediagnostikuje, neléčí a nenahrazuje odbornou péči.</Text>
        <Text style={[styles.link, { color: colors.blue }]} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/legal.html#privacy')}>Ochrana osobních údajů</Text>
        <Text style={[styles.link, { color: colors.blue }]} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/delete-account.html')}>Veřejná žádost o smazání účtu</Text>
      </SectionCard>

      <WeeklyCheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </Screen>
  );
}

const trainingGoals: Array<{ value: TrainingGoalKind; label: string }> = [
  { value: 'general_fitness', label: 'Kondice' },
  { value: 'walking_more', label: 'Chůze' },
  { value: 'couch_to_5k', label: 'Couch→5k' },
  { value: 'run_5k', label: '5 km' },
  { value: 'run_10k', label: '10 km' },
  { value: 'half_marathon', label: 'Půlmaraton' },
  { value: 'strength_basics', label: 'Síla' },
  { value: 'hyrox', label: 'Hyrox' },
];

const nutritionModes: Array<{ value: NutritionMode; labelKey: TranslationKey }> = [
  { value: 'balanced', labelKey: 'nutritionMode.balanced' },
  { value: 'fat_loss_friendly', labelKey: 'nutritionMode.fat_loss_friendly' },
  { value: 'muscle_gain_friendly', labelKey: 'nutritionMode.muscle_gain_friendly' },
  { value: 'high_protein', labelKey: 'nutritionMode.high_protein' },
  { value: 'budget_friendly', labelKey: 'nutritionMode.budget_friendly' },
  { value: 'simple_meal_prep', labelKey: 'nutritionMode.simple_meal_prep' },
  { value: 'endurance_fueling', labelKey: 'nutritionMode.endurance_fueling' },
];

const planIntensities: Array<{ value: PlanIntensity; labelKey: TranslationKey }> = [
  { value: 'easy', labelKey: 'planIntensity.easy' },
  { value: 'moderate', labelKey: 'planIntensity.moderate' },
  { value: 'ambitious_but_safe', labelKey: 'planIntensity.ambitious_but_safe' },
];

const dietStyles: DietStyle[] = [
  'standardní',
  'vegetariánský',
  'veganský',
  'bezlepkový',
  'nízkosacharidový',
  'vysokoproteínový',
];

const WEEKDAY_REST = [
  { value: 1, labelKey: 'weekday.mon' as TranslationKey },
  { value: 2, labelKey: 'weekday.tue' as TranslationKey },
  { value: 3, labelKey: 'weekday.wed' as TranslationKey },
  { value: 4, labelKey: 'weekday.thu' as TranslationKey },
  { value: 5, labelKey: 'weekday.fri' as TranslationKey },
  { value: 6, labelKey: 'weekday.sat' as TranslationKey },
  { value: 0, labelKey: 'weekday.sun' as TranslationKey },
];

function toggleRestDay(current: number[] | undefined, day: number): number[] {
  const set = new Set(current ?? []);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return Array.from(set).sort((a, b) => a - b);
}

function parseOptionalInt(value: string, max: number): number | undefined {
  const parsed = Math.round(Number(value.replace(',', '.')));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : undefined;
}

function setupMissingLabelKey(item: SetupMissingItem): TranslationKey {
  return `setup.missing.${item}` as TranslationKey;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  setupList: { gap: 5, marginTop: 8 },
  setupItem: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  user: { fontWeight: '900' },
  copy: { lineHeight: 20 },
  link: { fontWeight: '900' },
  summaryHeadline: { fontSize: 16, fontWeight: '900', lineHeight: 22, marginTop: 6 },
  summarySectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  summaryBullet: { fontSize: 13, lineHeight: 19 },
  summaryRec: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  summaryMeta: { fontSize: 11, marginTop: 10 },
  errorText: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
});
