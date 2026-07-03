import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { Button, Field, Label, Pill } from './UI';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import type { PlanAdjustment } from '../types/checkin';
import { planSessionForDate } from '../lib/training';
import { toDateKey } from '../utils/nutrition';
import { useUnits } from '../hooks/useUnits';

export function WeeklyCheckInModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { profile, setProfile, selectedDate, recordCheckIn, applyAdjustment, trainingCompletions } = useTrenr();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { showWeight, toKg, weightUnit } = useUnits();

  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [hungerLevel, setHungerLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [sorenessLevel, setSorenessLevel] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [adherencePct, setAdherencePct] = useState<number>(80);
  const [currentWeight, setCurrentWeight] = useState(profile ? String(showWeight(profile.weight)) : '');
  const [pending, setPending] = useState<PlanAdjustment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;

  async function evaluateCheckIn() {
    if (!profile || submitting) return;
    const entered = parseFloat(currentWeight.replace(',', '.'));
    const nextWeight = toKg(entered);
    if (!nextWeight || nextWeight < 30 || nextWeight > 300) {
      Alert.alert(t('common.error'), t('checkin.weightError'));
      return;
    }

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
        updatedAt: new Date().toISOString(),
      });
      await setProfile({ ...profile, weight: nextWeight });
      setPending(adjustment);
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('checkin.submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function acceptAdjustment() {
    if (!pending) return;
    await applyAdjustment(pending);
    Alert.alert(
      t('checkin.appliedTitle'),
      pending.kcalDelta === 0
        ? t('checkin.noChangeApplied')
        : t('checkin.kcalApplied', {
            direction: pending.kcalDelta > 0 ? t('checkin.increased') : t('checkin.decreased'),
            kcal: Math.abs(pending.kcalDelta),
          }),
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
            <Text style={[styles.modalTitle, { color: colors.ink }]}>{t('checkin.title')}</Text>
            <Text style={[styles.small, { color: colors.muted }]}>{t('checkin.subtitle')}</Text>

            <Label>{t('checkin.energy')}</Label>
            <View style={styles.row}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <Pill key={`e-${n}`} active={energyLevel === n} onPress={() => setEnergyLevel(n)}>
                  {n === 1 ? '1' : n === 5 ? '5' : String(n)}
                </Pill>
              ))}
            </View>

            <Label>{t('checkin.hunger')}</Label>
            <View style={styles.row}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <Pill key={`h-${n}`} active={hungerLevel === n} onPress={() => setHungerLevel(n)}>
                  {String(n)}
                </Pill>
              ))}
            </View>

            <Label>{t('checkin.soreness')}</Label>
            <View style={styles.row}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <Pill key={`s-${n}`} active={sorenessLevel === n} onPress={() => setSorenessLevel(n)}>
                  {String(n)}
                </Pill>
              ))}
            </View>

            <Label>{t('checkin.adherence')}</Label>
            <View style={styles.row}>
              {[40, 60, 80, 100].map(pct => (
                <Pill key={`a-${pct}`} active={adherencePct === pct} onPress={() => setAdherencePct(pct)}>
                  {pct}%
                </Pill>
              ))}
            </View>

            <Label>{t('checkin.weight')} ({weightUnit})</Label>
            <Field
              keyboardType="numeric"
              value={currentWeight}
              onChangeText={setCurrentWeight}
              placeholder={t('checkin.weightPlaceholder')}
            />

            {pending ? (
              <View style={[styles.resultBox, { backgroundColor: colors.bgElev, borderColor: colors.hairline }]}>
                <Text style={[styles.resultText, { color: colors.green }]}>{pending.reason}</Text>
                {pending.kcalDelta !== 0 && (
                  <Text style={[styles.resultText, { color: colors.ink, marginTop: 6 }]}>
                    {pending.kcalDelta > 0 ? '+' : ''}{pending.kcalDelta} {t('checkin.kcalPerDay')}
                  </Text>
                )}
                {pending.adjustedGoalKind && (
                  <Text style={[styles.resultText, { color: colors.orange, marginTop: 6, fontWeight: '700' }]}>
                    {t('checkin.temporaryGoal', { goal: pending.adjustedGoalKind })}
                  </Text>
                )}
                {pending.warnings.length > 0 && (
                  <View style={{ marginTop: 10, gap: 4 }}>
                    {pending.warnings.map((warning, index) => (
                      <Text key={`${warning}-${index}`} style={[styles.resultText, { color: colors.muted }]}>• {warning}</Text>
                    ))}
                  </View>
                )}
                <View style={styles.resultActions}>
                  <Button style={styles.resultAction} variant="secondary" onPress={dismissAdjustment}>
                    {t('checkin.skipAdjustment')}
                  </Button>
                  <Button style={styles.resultAction} onPress={acceptAdjustment}>
                    {t('checkin.applyAdjustment')}
                  </Button>
                </View>
              </View>
            ) : (
              <Button onPress={evaluateCheckIn}>
                {submitting ? t('checkin.evaluating') : t('checkin.evaluate')}
              </Button>
            )}
          </ScrollView>
          <Button variant="secondary" onPress={onClose}>{t('common.close')}</Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(25, 33, 29, 0.38)' },
  modalSheet: { maxHeight: '82%', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  modalContent: { gap: 12, paddingBottom: 6 },
  modalTitle: { fontSize: 22, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 18 },
  resultBox: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  resultText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  resultActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  resultAction: { flex: 1 },
});
