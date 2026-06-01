import { Alert, Linking, StyleSheet, Text, View, Modal, ScrollView, Pressable } from 'react-native';
import { Button, Card, Field, H1, Label, Pill } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { deleteAccount, exportAccountData } from '../services/api';
import type { PrimaryGoal, TrainingGoalKind } from '../types';
import type { PlanAdjustment } from '../types/checkin';
import { activityFactorForSessions, toDateKey } from '../utils/nutrition';
import { useWeeklySummary } from '../hooks/useWeeklySummary';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { planSessionForDate } from '../lib/training';
import { useSyncStatus } from '../hooks/useSyncStatus';

export function ProfileScreen() {
  const { profile, setProfile, resetLocalProfile, purgeAllUserData, user, signIn, signOut, signUp } = useNutriFit();
  const navigation = useNavigation<any>();
  const weeklySummary = useWeeklySummary();
  const syncStatus = useSyncStatus();
  const { t } = useLanguage();
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
      <H1>{t('profile.title')}</H1>

      <Card>
        <Label>{t('profile.mainGoal')}</Label>
        <View style={styles.rowWrap}>
          {(['lose_weight', 'maintain_weight', 'gain_muscle', 'run_race'] as PrimaryGoal[]).map(goal => (
            <Pill key={goal} active={profile.primaryGoal === goal} onPress={() => setProfile({ ...profile, primaryGoal: goal })}>{t(('goal.' + goal) as 'goal.lose_weight')}</Pill>
          ))}
        </View>
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
        <Label>{t('profile.currentWeight')}</Label>
        <Field keyboardType="number-pad" value={String(profile.weight)} onChangeText={weight => setProfile({ ...profile, weight: Number(weight) || profile.weight })} />

        {/* Adaptive Weekly Check-In trigger */}
        <Button style={{ marginTop: 10 }} onPress={() => setShowCheckIn(true)}>
          {t('profile.weeklyCheckIn')}
        </Button>

        {/* AI weekly summary trigger */}
        <Button
          style={{ marginTop: 6 }}
          variant="secondary"
          disabled={weeklySummary.isGenerating}
          onPress={() => weeklySummary.generate()}
        >
          {weeklySummary.isGenerating ? t('profile.aiSummaryGenerating') : t('profile.aiSummary')}
        </Button>

        {/* Settings — manage health data sources (Apple Health, Strava, Whoop, ...) */}
        <Button style={{ marginTop: 6 }} variant="secondary" onPress={() => navigation.navigate('Settings')}>
          {t('profile.healthSettings')}
        </Button>

        <Button style={{ marginTop: 6 }} variant="secondary" onPress={() => resetLocalProfile()}>{t('profile.restartOnboarding')}</Button>
      </Card>

      {/* AI weekly summary — last generated review */}
      {weeklySummary.summary && (
        <Card>
          <Label>🧠 Týdenní AI shrnutí</Label>
          <Text style={styles.summaryHeadline}>{weeklySummary.summary.headline}</Text>
          {weeklySummary.summary.highlights.length > 0 && (
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={styles.summarySectionLabel}>✓ Co šlo</Text>
              {weeklySummary.summary.highlights.map((h, i) => (
                <Text key={`hl-${i}`} style={styles.summaryBullet}>• {h}</Text>
              ))}
            </View>
          )}
          {weeklySummary.summary.concerns.length > 0 && (
            <View style={{ marginTop: 10, gap: 4 }}>
              <Text style={styles.summarySectionLabel}>⚠ Hlídej</Text>
              {weeklySummary.summary.concerns.map((c, i) => (
                <Text key={`cn-${i}`} style={styles.summaryBullet}>• {c}</Text>
              ))}
            </View>
          )}
          {weeklySummary.summary.recommendation && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.summarySectionLabel}>→ Příští týden</Text>
              <Text style={styles.summaryRec}>{weeklySummary.summary.recommendation}</Text>
            </View>
          )}
          {weeklySummary.generatedAt && (
            <Text style={styles.summaryMeta}>
              Vygenerováno {new Date(weeklySummary.generatedAt).toLocaleDateString('cs-CZ')} pro týden {weeklySummary.weekStartISO}
            </Text>
          )}
        </Card>
      )}
      {weeklySummary.error && (
        <Card>
          <Text style={{ color: colors.red, fontSize: 12 }}>
            Chyba při generování AI shrnutí: {weeklySummary.error}
          </Text>
        </Card>
      )}

      <Card>
        <Label>{t('profile.account')}</Label>
        <Text style={styles.copy}>
          Sync: {syncStatus.status}
          {syncStatus.pendingWrites ? ` · pending ${syncStatus.pendingWrites}` : ''}
          {syncStatus.lastSyncedAt ? ` · ${new Date(syncStatus.lastSyncedAt).toLocaleString()}` : ''}
        </Text>
        {syncStatus.error && <Text style={{ color: colors.red, fontSize: 12 }}>{syncStatus.error}</Text>}
        {user ? (
          <>
            <Text style={styles.user}>{user.email}</Text>
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
        <Label>Podmínky a ochrana</Label>
        <Text style={styles.copy}>Trenr není zdravotnický prostředek, nediagnostikuje, neléčí a nenahrazuje odbornou péči.</Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/legal.html#privacy')}>Ochrana osobních údajů</Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/delete-account.html')}>Veřejná žádost o smazání účtu</Text>
      </Card>

      <WeeklyCheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </Screen>
  );
}

function WeeklyCheckInModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { profile, setProfile, selectedDate, recordCheckIn, applyAdjustment, trainingCompletions } = useNutriFit();
  const { colors } = useTheme();

  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [hungerLevel, setHungerLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
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
            <Text style={[styles.modalTitle, { color: colors.ink }]}>🎯 Týdenní check-in</Text>
            <Text style={[styles.small, { color: colors.muted }]}>
              Zhodnoť svůj týden. Trenr porovná váhu s minulým týdnem a doporučí úpravy v jídelníčku.
            </Text>

            <Label>Energie tento týden (1–5)</Label>
            <View style={styles.row}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <Pill key={`e-${n}`} active={energyLevel === n} onPress={() => setEnergyLevel(n)}>
                  {n === 1 ? '🪫 1' : n === 5 ? '🔋 5' : String(n)}
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
              <View style={[styles.resultBox, { backgroundColor: colors.isDark ? '#151d1a' : '#f4fbf7', borderColor: colors.isDark ? '#2a3630' : '#dcf2e6' }]}>
                <Text style={[styles.resultText, { color: colors.isDark ? '#309965' : colors.green }]}>
                  {pending.reason}
                </Text>
                {pending.kcalDelta !== 0 && (
                  <Text style={[styles.resultText, { color: colors.ink, marginTop: 6 }]}>
                    {pending.kcalDelta > 0 ? '+' : ''}{pending.kcalDelta} kcal / den pro příští týden
                  </Text>
                )}
                {pending.adjustedGoalKind && (
                  <Text style={[styles.resultText, { color: colors.orange, marginTop: 6, fontWeight: '900' }]}>
                    ⚠ Cíl dočasně přepneme na: {pending.adjustedGoalKind}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  user: { color: colors.ink, fontWeight: '900' },
  copy: { color: colors.muted, lineHeight: 20 },
  link: { color: colors.blue, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(25, 33, 29, 0.38)' },
  modalSheet: { maxHeight: '82%', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  modalContent: { gap: 12, paddingBottom: 6 },
  modalTitle: { fontSize: 22, fontWeight: '900' },
  small: { fontSize: 13, lineHeight: 18 },
  resultBox: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  resultText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  summaryHeadline: { color: colors.ink, fontSize: 16, fontWeight: '900', lineHeight: 22, marginTop: 6 },
  summarySectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  summaryBullet: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  summaryRec: { color: colors.green, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  summaryMeta: { color: colors.faint, fontSize: 11, marginTop: 10 },
});
