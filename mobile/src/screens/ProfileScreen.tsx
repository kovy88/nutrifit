import { Alert, Linking, StyleSheet, Text, View, Modal, ScrollView, Pressable } from 'react-native';
import { Button, Card, Field, Label, Pill, ScreenHeader, SectionHeader } from '../components/UI';
import { Screen } from '../components/Screen';
import { useTrenr } from '../context/TrenrContext';
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { deleteAccount, exportAccountData } from '../services/api';
import type { CoachScope, DietStyle, NutritionMode, PlanIntensity, TrainingGoalKind } from '../types';
import { resolveCoachScope } from '../types';
import type { PlanAdjustment } from '../types/checkin';
import { activityFactorForSessions, toDateKey } from '../utils/nutrition';
import { useWeeklySummary } from '../hooks/useWeeklySummary';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { planSessionForDate } from '../lib/training';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { USER_PRIMARY_GOALS } from '../constants/goals';
import type { TranslationKey } from '../lib/i18n';

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

  async function login() {
    try {
      await signIn(auth.email.trim(), auth.password);
    } catch (err) {
      Alert.alert('Přihlášení selhalo', err instanceof Error ? err.message : 'Zkus to prosím znovu.');
    }
  }

  async function register() {
    try {
      await signUp(auth.name.trim(), auth.email.trim(), auth.password);
      Alert.alert('Hotovo', 'Pokud Supabase vyžaduje ověření e-mailu, zkontroluj schránku.');
    } catch (err) {
      Alert.alert('Registrace selhala', err instanceof Error ? err.message : 'Zkus to prosím znovu.');
    }
  }

  async function exportData() {
    try {
      const data = await exportAccountData();
      Alert.alert('Export připraven', `Profil: ${data.profile ? 'ano' : 'ne'}\nHistorie: ${data.mealHistory?.length || 0} záznamů`);
    } catch (err) {
      Alert.alert('Export selhal', err instanceof Error ? err.message : 'Přihlaš se prosím znovu.');
    }
  }

  async function confirmDelete() {
    Alert.alert('Smazat účet?', 'Tahle akce smaže účet a serverová data. Nelze ji vrátit zpět.', [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            // Server-side deletion succeeded — now wipe all local data
            // (profile, plans, food logs, training sessions, weights, consent).
            await purgeAllUserData();
          } catch (err) {
            Alert.alert('Smazání selhalo', err instanceof Error ? err.message : 'Použij veřejný deletion request link.');
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader eyebrow={t('tab.profile')} title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <Card>
        <SectionHeader title={t('profile.coachSetup')} />
        <Label>{t('profile.focus')}</Label>
        <View style={styles.rowWrap}>
          {(['both', 'training', 'nutrition'] as CoachScope[]).map(s => (
            <Pill key={s} active={resolveCoachScope(profile) === s} onPress={() => setProfile({ ...profile, coachScope: s })}>
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
      </Card>

      <Card>
        <SectionHeader title={t('profile.trainingSchedule')} />
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
        <Button style={{ marginTop: 10 }} onPress={() => setShowCheckIn(true)}>
          {t('profile.weeklyCheckIn')}
        </Button>
        <Button
          style={{ marginTop: 6 }}
          variant="secondary"
          disabled={weeklySummary.isGenerating}
          onPress={() => weeklySummary.generate()}
        >
          {weeklySummary.isGenerating ? t('profile.aiSummaryGenerating') : t('profile.aiSummary')}
        </Button>
      </Card>

      <Card>
        <SectionHeader title={t('profile.nutritionPrefs')} />
        <Label>{t('profile.currentWeight')}</Label>
        <Field keyboardType="number-pad" value={String(profile.weight)} onChangeText={weight => setProfile({ ...profile, weight: Number(weight) || profile.weight })} />
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
      </Card>

      <Card>
        <SectionHeader title={t('profile.healthData')} />
        <Text style={[styles.copy, { color: colors.muted }]}>{t('profile.healthDataBody')}</Text>
        <Button variant="secondary" onPress={() => navigation.navigate('Settings')}>
          {t('profile.healthSettings')}
        </Button>
        <Button style={{ marginTop: 6 }} variant="secondary" onPress={() => resetLocalProfile()}>{t('profile.restartOnboarding')}</Button>
      </Card>

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

      <Card>
        <SectionHeader title={t('profile.account')} />
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
      </Card>

      <Card>
        <SectionHeader title={t('profile.privacySafety')} />
        <Text style={[styles.copy, { color: colors.muted }]}>Trenr není zdravotnický prostředek, nediagnostikuje, neléčí a nenahrazuje odbornou péči.</Text>
        <Text style={[styles.link, { color: colors.blue }]} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/legal.html#privacy')}>Ochrana osobních údajů</Text>
        <Text style={[styles.link, { color: colors.blue }]} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/delete-account.html')}>Veřejná žádost o smazání účtu</Text>
      </Card>

      <WeeklyCheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </Screen>
  );
}

function WeeklyCheckInModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { profile, setProfile, selectedDate, recordCheckIn, applyAdjustment, trainingCompletions } = useTrenr();
  const { colors } = useTheme();

  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [hungerLevel, setHungerLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [sorenessLevel, setSorenessLevel] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [adherencePct, setAdherencePct] = useState<number>(80);
  const [currentWeight, setCurrentWeight] = useState(profile ? String(profile.weight) : '');
  const [pending, setPending] = useState<PlanAdjustment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;

  async function evaluateCheckIn() {
    if (!profile || submitting) return;
    const nextWeight = parseFloat(currentWeight.replace(',', '.'));
    if (!nextWeight || nextWeight < 30 || nextWeight > 300) {
      Alert.alert('Chyba', 'Zadej prosím platnou váhu.');
      return;
    }

    // Week start = Monday of the week containing selectedDate
    const d = new Date(selectedDate);
    const dayOfWeek = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dayOfWeek - 1));
    const weekStartISO = toDateKey(monday);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day;
    });
    const plannedSessions = weekDays
      .map(day => planSessionForDate(profile, day))
      .filter(session => session.kind !== 'rest' && session.durationMinutes > 0)
      .length;
    const completedSessions = weekDays
      .map(day => trainingCompletions[toDateKey(day)])
      .filter(completion => completion?.status === 'completed')
      .length;

    setSubmitting(true);
    try {
      const adjustment = await recordCheckIn({
        weekStartISO,
        weightKg: nextWeight,
        energyLevel,
        hungerLevel,
        sorenessLevel,
        adherence: adherencePct / 100,
        completedSessions,
        plannedSessions,
        createdAt: new Date().toISOString(),
      });
      // Also persist the new weight on profile so calculateMacros picks it up immediately
      await setProfile({ ...profile, weight: nextWeight });
      setPending(adjustment);
    } catch (err) {
      Alert.alert('Chyba', err instanceof Error ? err.message : 'Check-in se nepodařil.');
    } finally {
      setSubmitting(false);
    }
  }

  async function acceptAdjustment() {
    if (!pending) return;
    await applyAdjustment(pending);
    Alert.alert(
      'Použito',
      pending.kcalDelta === 0
        ? 'Plán zůstává beze změny. Pokračuj jak máš.'
        : `Denní cíl ${pending.kcalDelta > 0 ? 'zvýšen' : 'snížen'} o ${Math.abs(pending.kcalDelta)} kcal pro příští týden.`,
    );
    setPending(null);
    onClose();
  }

  function dismissAdjustment() {
    setPending(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={[styles.modalTitle, { color: colors.ink }]}>Týdenní check-in</Text>
            <Text style={[styles.small, { color: colors.muted }]}>
              Zhodnoť svůj týden. Trenr porovná váhu s minulým týdnem a doporučí úpravy v jídelníčku.
            </Text>

            <Label>Energie tento týden (1–5)</Label>
            <View style={styles.row}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <Pill key={`e-${n}`} active={energyLevel === n} onPress={() => setEnergyLevel(n)}>
                  {n === 1 ? '1' : n === 5 ? '5' : String(n)}
                </Pill>
              ))}
            </View>

            <Label>Hlad přes den (1 = ne, 5 = stále)</Label>
            <View style={styles.row}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <Pill key={`h-${n}`} active={hungerLevel === n} onPress={() => setHungerLevel(n)}>
                  {String(n)}
                </Pill>
              ))}
            </View>

            <Label>Bolest / svalovka (1 = žádná, 5 = výrazná)</Label>
            <View style={styles.row}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <Pill key={`s-${n}`} active={sorenessLevel === n} onPress={() => setSorenessLevel(n)}>
                  {String(n)}
                </Pill>
              ))}
            </View>

            <Label>Adherence — kolik % plánu jsi dodržel/a?</Label>
            <View style={styles.row}>
              {[40, 60, 80, 100].map(pct => (
                <Pill key={`a-${pct}`} active={adherencePct === pct} onPress={() => setAdherencePct(pct)}>
                  {pct}%
                </Pill>
              ))}
            </View>

            <Label>Dnešní váha (kg)</Label>
            <Field
              keyboardType="numeric"
              value={currentWeight}
              onChangeText={setCurrentWeight}
              placeholder="Zadej aktuální váhu..."
            />

            {pending ? (
              <View style={[styles.resultBox, { backgroundColor: colors.bgElev, borderColor: colors.border }]}>
                <Text style={[styles.resultText, { color: colors.green }]}>
                  {pending.reason}
                </Text>
                {pending.kcalDelta !== 0 && (
                  <Text style={[styles.resultText, { color: colors.ink, marginTop: 6 }]}>
                    {pending.kcalDelta > 0 ? '+' : ''}{pending.kcalDelta} kcal / den pro příští týden
                  </Text>
                )}
                {pending.adjustedGoalKind && (
                  <Text style={[styles.resultText, { color: colors.orange, marginTop: 6, fontWeight: '900' }]}>
                    Cíl dočasně přepneme na: {pending.adjustedGoalKind}
                  </Text>
                )}
                {pending.warnings.length > 0 && (
                  <View style={{ marginTop: 10, gap: 4 }}>
                    {pending.warnings.map((w, i) => (
                      <Text key={i} style={[styles.resultText, { color: colors.muted }]}>• {w}</Text>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Button style={{ flex: 1 }} variant="secondary" onPress={dismissAdjustment}>
                    Tento týden nepoužít
                  </Button>
                  <Button style={{ flex: 1 }} onPress={acceptAdjustment}>
                    Použít na příští týden
                  </Button>
                </View>
              </View>
            ) : (
              <Button onPress={evaluateCheckIn}>
                {submitting ? 'Vyhodnocuji…' : 'Vyhodnotit týden'}
              </Button>
            )}
          </ScrollView>
          <Button variant="secondary" onPress={onClose}>Zavřít</Button>
        </View>
      </View>
    </Modal>
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  user: { fontWeight: '900' },
  copy: { lineHeight: 20 },
  link: { fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(25, 33, 29, 0.38)' },
  modalSheet: { maxHeight: '82%', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  modalContent: { gap: 12, paddingBottom: 6 },
  modalTitle: { fontSize: 22, fontWeight: '900' },
  small: { fontSize: 13, lineHeight: 18 },
  resultBox: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  resultText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  summaryHeadline: { fontSize: 16, fontWeight: '900', lineHeight: 22, marginTop: 6 },
  summarySectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  summaryBullet: { fontSize: 13, lineHeight: 19 },
  summaryRec: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  summaryMeta: { fontSize: 11, marginTop: 10 },
  errorText: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
});
