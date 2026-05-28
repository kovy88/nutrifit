import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Pill, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import type { DietStyle, ExperienceLevel, Gender, PrimaryGoal, TrainingGoalKind, UserProfile } from '../types';
import { DEFAULT_PROFILE, validateProfile, activityFactorForSessions } from '../utils/nutrition';

export function OnboardingScreen() {
  const { setProfile } = useNutriFit();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(() => ({
    ...DEFAULT_PROFILE,
    age: 0,
    height: 0,
    weight: 0,
  }));
  const progress = useMemo(() => `${step + 1}/4`, [step]);

  function setField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  async function finish() {
    const errors = validateProfile(draft);
    if (errors.length) {
      Alert.alert('Ještě drobnost', errors.join('\n'));
      return;
    }
    await setProfile(draft);
  }

  return (
    <Screen>
      {/* Progress Bar Visual Indicator */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>{progress}</Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${((step + 1) / 4) * 100}%` }]} />
        </View>
      </View>

      <H1>NutriFit nastavíme za minutu.</H1>
      <Subtitle>Mobilní verze počítá denní cíle, plánuje jídelníček a dovolí upravit AI odhady před uložením.</Subtitle>

      {step === 0 && (
        <Card>
          <Label>Hlavní cíl</Label>
          <View style={styles.column}>
            {primaryGoals.map(item => (
              <Pill
                key={item.value}
                active={draft.primaryGoal === item.value}
                onPress={() => setDraft(current => ({ ...current, primaryGoal: item.value, trainingGoal: item.trainingGoal }))}
              >
                {item.label}
              </Pill>
            ))}
          </View>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <Label>Tělesné míry</Label>
          <View style={styles.row}>
            {(['muz', 'zena'] as Gender[]).map(g => (
              <Pill key={g} active={draft.gender === g} onPress={() => setField('gender', g)}>{g === 'muz' ? 'Muž' : 'Žena'}</Pill>
            ))}
          </View>
          <View style={styles.grid}>
            <Field keyboardType="number-pad" value={draft.age === 0 ? '' : String(draft.age)} onChangeText={v => setField('age', Number(v) || 0)} placeholder="Věk (např. 30)" />
            <Field keyboardType="number-pad" value={draft.height === 0 ? '' : String(draft.height)} onChangeText={v => setField('height', Number(v) || 0)} placeholder="Výška cm (např. 175)" />
            <Field keyboardType="number-pad" value={draft.weight === 0 ? '' : String(draft.weight)} onChangeText={v => setField('weight', Number(v) || 0)} placeholder="Váha kg (např. 75)" />
          </View>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <Label>Tréninková aktivita</Label>
          <View style={styles.rowWrap}>
            {trainingGoalsFor(draft.primaryGoal).map(goal => (
              <Pill key={goal.value} active={draft.trainingGoal === goal.value} onPress={() => setField('trainingGoal', goal.value)}>{goal.label}</Pill>
            ))}
          </View>
          <Label>Kolikrát týdně trénuješ?</Label>
          <View style={styles.rowWrap}>
            {[1, 2, 3, 4, 5, 6].map(count => (
              <Pill key={count} active={draft.sessionsPerWeek === count} onPress={() => setDraft(current => ({ ...current, sessionsPerWeek: count, activityFactor: activityFactorForSessions(count) }))}>{count}×</Pill>
            ))}
          </View>
          <Label>Zkušenosti s tréninkem</Label>
          <View style={styles.rowWrap}>
            {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map(exp => (
              <Pill key={exp} active={draft.experience === exp} onPress={() => setField('experience', exp)}>{experienceLabel(exp)}</Pill>
            ))}
          </View>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <Label>Stravovací preference a diety</Label>
          <Field value={draft.likes} onChangeText={v => setField('likes', v)} placeholder="Co rád/a jíš? (oblíbené suroviny)" multiline />
          <Field value={draft.dislikes} onChangeText={v => setField('dislikes', v)} placeholder="Alergie, omezení, co vůbec nejíš" multiline />
          <View style={styles.rowWrap}>
            {(['standardní', 'vegetariánský', 'veganský', 'bezlepkový', 'nízkosacharidový', 'vysokoproteínový'] as DietStyle[]).map(diet => (
              <Pill key={diet} active={draft.diet === diet} onPress={() => setField('diet', diet)}>{diet}</Pill>
            ))}
          </View>
          <View style={styles.explainBox}>
            <Text style={styles.explainText}>
              ✨ Po dokončení ti AI sestaví plnohodnotný denní plán jídelníčku na míru tvým preferencím a automaticky jej upraví podle tvého dnešního tréninku!
            </Text>
          </View>
        </Card>
      )}

      <View style={styles.actions}>
        {step > 0 && <Button variant="secondary" onPress={() => setStep(s => s - 1)}>Zpět</Button>}
        <Button onPress={step === 3 ? finish : () => setStep(s => s + 1)}>{step === 3 ? 'Dokončit a vytvořit plán' : 'Pokračovat'}</Button>
      </View>
      <Text style={styles.disclaimer}>NutriFit není zdravotnický prostředek. Nediagnostikuje, neléčí a nenahrazuje konzultaci s lékařem ani nutričním terapeutem.</Text>
    </Screen>
  );
}

const primaryGoals: Array<{ value: PrimaryGoal; label: string; trainingGoal: TrainingGoalKind }> = [
  { value: 'lose_weight', label: 'Zhubnout', trainingGoal: 'general_fitness' },
  { value: 'maintain_weight', label: 'Udržet váhu', trainingGoal: 'general_fitness' },
  { value: 'gain_muscle', label: 'Nabrat svalovou hmotu', trainingGoal: 'strength_basics' },
  { value: 'run_race', label: 'Příprava na běžecký závod', trainingGoal: 'run_10k' },
];

function trainingGoalsFor(primaryGoal: PrimaryGoal): Array<{ value: TrainingGoalKind; label: string }> {
  if (primaryGoal === 'run_race') return [
    { value: 'run_5k', label: 'Běh 5 km' },
    { value: 'run_10k', label: 'Běh 10 km' },
    { value: 'half_marathon', label: 'Půlmaraton' },
    { value: 'marathon', label: 'Maraton' },
  ];
  if (primaryGoal === 'gain_muscle') return [
    { value: 'strength_basics', label: 'Silové základy' },
    { value: 'general_fitness', label: 'Celková kondice' },
  ];
  return [
    { value: 'general_fitness', label: 'Obecná kondice' },
    { value: 'sports_conditioning', label: 'Sportovní výkon' },
  ];
}

function experienceLabel(value: ExperienceLevel) {
  return ({ beginner: 'Začátečník', intermediate: 'Pokročilý', advanced: 'Zkušený' }[value]);
}

const styles = StyleSheet.create({
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  progressText: { color: colors.green, fontWeight: '800', fontSize: 14 },
  progressBarBg: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.green, borderRadius: 3 },
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  column: { gap: 10 },
  grid: { gap: 10 },
  actions: { gap: 10 },
  disclaimer: { color: colors.faint, fontSize: 12, lineHeight: 18, marginTop: 12 },
  explainBox: { marginTop: 12, padding: 12, backgroundColor: '#f4fbf7', borderRadius: 12, borderWidth: 1, borderColor: '#dcf2e6' },
  explainText: { color: colors.green, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
