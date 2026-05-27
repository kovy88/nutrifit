import { Alert, Linking, StyleSheet, Text, View, Modal, ScrollView, Pressable } from 'react-native';
import { Button, Card, Field, H1, Label, Pill } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { useState } from 'react';
import { deleteAccount, exportAccountData } from '../services/api';
import type { PrimaryGoal, TrainingGoalKind } from '../types';
import { activityFactorForSessions, primaryGoalLabel, toDateKey } from '../utils/nutrition';
import { useTheme } from '../context/ThemeContext';

export function ProfileScreen() {
  const { profile, setProfile, resetLocalProfile, user, signIn, signOut, signUp } = useNutriFit();
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
            await resetLocalProfile();
          } catch (err) {
            Alert.alert('Smazání selhalo', err instanceof Error ? err.message : 'Použij veřejný deletion request link.');
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <H1>Profil</H1>

      <Card>
        <Label>Hlavní cíl</Label>
        <View style={styles.rowWrap}>
          {(['lose_weight', 'maintain_weight', 'gain_muscle', 'run_race'] as PrimaryGoal[]).map(goal => (
            <Pill key={goal} active={profile.primaryGoal === goal} onPress={() => setProfile({ ...profile, primaryGoal: goal })}>{primaryGoalLabel(goal)}</Pill>
          ))}
        </View>
        <Label>Tréninkový cíl</Label>
        <View style={styles.rowWrap}>
          {trainingGoals.map(goal => (
            <Pill key={goal.value} active={profile.trainingGoal === goal.value} onPress={() => setProfile({ ...profile, trainingGoal: goal.value })}>{goal.label}</Pill>
          ))}
        </View>
        <Label>Tréninků týdně</Label>
        <View style={styles.rowWrap}>
          {[1, 2, 3, 4, 5, 6].map(count => (
            <Pill key={count} active={profile.sessionsPerWeek === count} onPress={() => setProfile({ ...profile, sessionsPerWeek: count, activityFactor: activityFactorForSessions(count) })}>{count}×</Pill>
          ))}
        </View>
        <Label>Aktuální váha (kg)</Label>
        <Field keyboardType="number-pad" value={String(profile.weight)} onChangeText={weight => setProfile({ ...profile, weight: Number(weight) || profile.weight })} />
        
        {/* Adaptive Weekly Check-In trigger */}
        <Button style={{ marginTop: 10 }} onPress={() => setShowCheckIn(true)}>
          🎯 Spustit týdenní check-in
        </Button>
        
        <Button style={{ marginTop: 6 }} variant="secondary" onPress={() => resetLocalProfile()}>Spustit onboarding znovu</Button>
      </Card>

      <Card>
        <Label>Účet</Label>
        {user ? (
          <>
            <Text style={styles.user}>{user.email}</Text>
            <Button variant="secondary" onPress={exportData}>Exportovat data</Button>
            <Button variant="secondary" onPress={signOut}>Odhlásit se</Button>
            <Button variant="danger" onPress={confirmDelete}>Smazat účet a data</Button>
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
        <Text style={styles.copy}>NutriFit není zdravotnický prostředek, nediagnostikuje, neléčí a nenahrazuje odbornou péči.</Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/legal.html#privacy')}>Ochrana osobních údajů</Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/delete-account.html')}>Veřejná žádost o smazání účtu</Text>
      </Card>

      <WeeklyCheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </Screen>
  );
}

function WeeklyCheckInModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { profile, setProfile, weights, selectedDate } = useNutriFit();
  const { colors } = useTheme();
  
  const [energyLevel, setEnergyLevel] = useState<'great' | 'normal' | 'tired'>('normal');
  const [hunger, setHunger] = useState<'low' | 'normal' | 'high'>('normal');
  const [currentWeight, setCurrentWeight] = useState(profile ? String(profile.weight) : '');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [suggestedAdjustment, setSuggestedAdjustment] = useState<number>(0);

  if (!profile) return null;

  async function evaluateCheckIn() {
    if (!profile) return;
    const nextWeight = parseFloat(currentWeight.replace(',', '.'));
    if (!nextWeight || nextWeight < 30 || nextWeight > 300) {
      Alert.alert('Chyba', 'Zadej prosím platnou váhu.');
      return;
    }

    // Retrieve weight from 7 days ago to compute difference
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 7);
    const sevenDaysAgoKey = toDateKey(d);
    const weight7DaysAgo = weights[sevenDaysAgoKey] || profile.weight;

    const diff = nextWeight - weight7DaysAgo;
    let adjustment = 0;
    let msg = '';

    if (profile.primaryGoal === 'lose_weight') {
      if (diff > -0.2) {
        adjustment = -100;
        msg = `Za poslední týden tvá váha klesla o ${diff.toFixed(2)} kg (cíl je aspoň -0.3 kg/týden). Doporučujeme mírně snížit denní příjem o 100 kcal, aby se hubnutí opět nastartovalo.`;
      } else {
        msg = `Skvělá práce! Tvá váha klesla o ${Math.abs(diff).toFixed(2)} kg. Hubnutí probíhá zdravým tempem. Pokračuj v aktuálním nastavení příjmu.`;
      }
    } else if (profile.primaryGoal === 'gain_muscle') {
      if (diff < 0.1) {
        adjustment = 100;
        msg = `Za poslední týden se tvá váha zvýšila o ${diff.toFixed(2)} kg (cíl je aspoň +0.15 kg/týden). Doporučujeme navýšit denní příjem o 100 kcal pro podporu svalového růstu.`;
      } else {
        msg = `Skvělá práce! Tvá váha roste tempem +${diff.toFixed(2)} kg za týden. Pokračuj v aktuálním nastavení příjmu.`;
      }
    } else {
      msg = `Tvá váha se změnila o ${diff > 0 ? '+' : ''}${diff.toFixed(2)} kg. Pro udržování hmotnosti je toto ideální rozmezí. Pokračuj v aktuálním nastavení.`;
    }

    setSuggestedAdjustment(adjustment);
    setResultMessage(msg);
  }

  async function applyAdjustment() {
    if (!profile) return;
    const nextWeight = parseFloat(currentWeight.replace(',', '.'));
    await setProfile({
      ...profile,
      weight: nextWeight,
    });
    Alert.alert('Použito', 'Váha byla uložena a denní energetické cíle byly přepočítány.');
    setResultMessage(null);
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
              Zhodnoť svůj týden. NutriFit porovná váhu s minulým týdnem a doporučí úpravy v jídelníčku.
            </Text>

            <Label>Jak se cítíš (energie)?</Label>
            <View style={styles.row}>
              {(['great', 'normal', 'tired'] as const).map(item => (
                <Pill
                  key={item}
                  active={energyLevel === item}
                  onPress={() => setEnergyLevel(item)}
                >
                  {item === 'great' ? '🔋 Výborně' : item === 'normal' ? '⚡ Normálně' : '🪫 Unaveně'}
                </Pill>
              ))}
            </View>

            <Label>Pociťuješ přes den hlad?</Label>
            <View style={styles.row}>
              {(['low', 'normal', 'high'] as const).map(item => (
                <Pill
                  key={item}
                  active={hunger === item}
                  onPress={() => setHunger(item)}
                >
                  {item === 'low' ? '🟢 Minimální' : item === 'normal' ? '🟡 Běžný' : '🔴 Hlad'}
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

            {resultMessage ? (
              <View style={[styles.resultBox, { backgroundColor: colors.isDark ? '#151d1a' : '#f4fbf7', borderColor: colors.isDark ? '#2a3630' : '#dcf2e6' }]}>
                <Text style={[styles.resultText, { color: colors.isDark ? '#309965' : colors.green }]}>
                  {resultMessage}
                </Text>
                {suggestedAdjustment !== 0 && (
                  <Button style={{ marginTop: 12 }} onPress={applyAdjustment}>
                    Uložit váhu a přepočítat cíle
                  </Button>
                )}
              </View>
            ) : (
              <Button onPress={evaluateCheckIn}>Vyhodnotit týden</Button>
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
});
