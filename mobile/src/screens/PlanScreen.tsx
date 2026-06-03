import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Label,
  LoadingState,
  MetricCard,
  PlanDayCard,
  QuickActionButton,
  ScreenHeader,
  SectionHeader,
} from '../components/UI';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { generateMealPlan, regenerateMeal } from '../services/api';
import { buildShoppingList, mealToFoodEstimate, plannedMealKey, formatDateLabel, toDateKey } from '../utils/nutrition';
import { planSessionForDate } from '../lib/training';
import type { Meal, TrainingSession } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { PaywallModal } from '../components/PaywallModal';

export function PlanScreen() {
  const {
    profile,
    currentMacros,
    currentSession,
    dailyAdjustment,
    currentMeals: meals,
    currentFoodLog: foodLog,
    setMeals,
    setProfile,
    addFood,
    ensureAiConsent,
    selectedDate,
    setSelectedDate,
    isSubscribed,
  } = useTrenr();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [likes, setLikes] = useState(profile?.likes || '');
  const [dislikes, setDislikes] = useState(profile?.dislikes || '');
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setLikes(profile.likes);
    setDislikes(profile.dislikes);
  }, [profile?.likes, profile?.dislikes]);

  const weekDays = useMemo(() => buildWeek(selectedDate, locale), [selectedDate, locale]);

  if (!profile || !currentMacros) return null;

  const activeProfile = profile;
  const activeMacros = currentMacros;
  const shoppingGroups = buildShoppingList(meals);
  const selectedSession = currentSession ?? planSessionForDate(activeProfile, new Date(selectedDate));

  async function savePrefs() {
    await setProfile({ ...activeProfile, likes, dislikes });
    setPrefsOpen(false);
  }

  async function generate() {
    if (!isSubscribed) {
      setPaywallOpen(true);
      return;
    }
    const consent = await ensureAiConsent();
    if (!consent) return;

    const isPast = selectedDate < toDateKey(new Date());
    if (isPast) {
      const confirm = await new Promise<boolean>(resolve => {
        Alert.alert(t('plan.overwritePastTitle'), t('plan.overwritePastMsg'), [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('plan.overwrite'), onPress: () => resolve(true) },
        ]);
      });
      if (!confirm) return;
    }

    setLoading(true);
    try {
      const next = await generateMealPlan(activeProfile, activeMacros, selectedSession);
      await setMeals(next);
    } catch (err) {
      Alert.alert(t('plan.generateFailed'), err instanceof Error ? err.message : t('plan.tryAgain'));
    } finally {
      setLoading(false);
    }
  }

  async function logPlannedMeal(meal: Meal) {
    if (isMealLogged(meal)) return;
    const isFuture = selectedDate > toDateKey(new Date());
    if (isFuture) {
      const confirm = await new Promise<boolean>(resolve => {
        Alert.alert(t('plan.futureLogTitle'), t('plan.futureLogMsg'), [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('plan.log'), onPress: () => resolve(true) },
        ]);
      });
      if (!confirm) return;
    }
    await addFood(mealToFoodEstimate(meal), 'planned');
    Alert.alert(t('plan.logged'), t('plan.loggedToast', { meal: meal.name, date: formatDateLabel(selectedDate) }));
  }

  function isMealLogged(meal: Meal) {
    const key = plannedMealKey(meal);
    return foodLog.some(item => item.source === 'planned' && item.plannedMealKey === key);
  }

  async function handleRegenerate(meal: Meal, index: number) {
    if (!isSubscribed) {
      setPaywallOpen(true);
      return;
    }
    const consent = await ensureAiConsent();
    if (!consent) return;
    if (isMealLogged(meal)) {
      Alert.alert(t('plan.cannotRegenTitle'), t('plan.cannotRegenMsg'));
      return;
    }
    setRegeneratingIndex(index);
    try {
      const next = await regenerateMeal({ profile: activeProfile, session: selectedSession, current: meal, otherMeals: meals });
      const nextMeals = meals.slice();
      nextMeals[index] = next;
      await setMeals(nextMeals);
    } catch (err) {
      Alert.alert(t('plan.regenFailed'), err instanceof Error ? err.message : t('plan.tryAgainShort'));
    } finally {
      setRegeneratingIndex(null);
    }
  }

  function shareShoppingList() {
    const body = shoppingGroups
      .map(group => `${group.category}\n${group.items.map(item => `- ${item}`).join('\n')}`)
      .join('\n\n');
    Share.share({ message: `${t('plan.shoppingShareHeader')}\n\n${body}` });
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow={t('tab.plan')}
        title={t('plan.weekTitle')}
        subtitle={t('plan.weekSubtitle', { date: formatDateLabel(selectedDate) })}
        action={
          <Pressable style={[styles.iconButton, { borderColor: colors.border }]} onPress={() => setPrefsOpen(true)}>
            <Ionicons name="options-outline" size={20} color={colors.accent} />
          </Pressable>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
        {weekDays.map(day => {
          const session = planSessionForDate(activeProfile, new Date(day.key));
          const selected = day.key === selectedDate;
          return (
            <Pressable
              key={day.key}
              onPress={() => setSelectedDate(day.key)}
              style={[
                styles.dayPill,
                {
                  backgroundColor: selected ? colors.accent : colors.bgElev,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={[styles.dayName, { color: selected ? colors.accentText : colors.faint }]}>{day.name}</Text>
              <Text style={[styles.dayNum, { color: selected ? colors.accentText : colors.ink }]}>{day.num}</Text>
              <Text style={[styles.dayKind, { color: selected ? colors.accentText : colors.muted }]} numberOfLines={1}>
                {shortSession(session, t)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <PlanDayCard
        selected
        title={formatDateLabel(selectedDate)}
        subtitle={sessionLine(selectedSession, t)}
        markers={planMarkers(selectedSession, dailyAdjustment?.carbsDelta ?? 0, t)}
      >
        <View style={styles.metricRow}>
          <MetricCard label="kcal" value={activeMacros.kcal} color={colors.accent} />
          <MetricCard label={t('home.protein')} value={activeMacros.protein} unit="g" color={colors.green} />
        </View>
        {selectedSession.kind === 'long_run' && dailyAdjustment && dailyAdjustment.carbsDelta > 0 ? (
          <Text style={[styles.fueling, { color: colors.accent }]}>{t('plan.longRunFueling', {
            carbs: Math.round(dailyAdjustment.carbsDelta),
            kcal: Math.round(dailyAdjustment.kcalDelta),
          })}</Text>
        ) : null}
      </PlanDayCard>

      <View style={styles.quickGrid}>
        <QuickActionButton icon="sparkles-outline" label={t('plan.generate')} onPress={generate} disabled={loading} />
        <QuickActionButton icon="camera-outline" label={t('plan.openPhoto')} onPress={() => navigation.navigate('Foto')} />
      </View>

      {loading ? <LoadingState title={t('plan.generating')} body={t('plan.loadingSub')} /> : null}

      {meals.length === 0 && !loading ? (
        <EmptyState
          title={t('plan.emptyTitle')}
          body={t('plan.emptyBody')}
          cta={t('plan.buildCoachPlan')}
          onPress={generate}
        />
      ) : null}

      {meals.length > 0 ? (
        <Card>
          <SectionHeader title={t('plan.todayMeals')} />
          {meals.map((meal, index) => (
            <View key={`${meal.mealType}-${index}`} style={[styles.mealRow, { borderTopColor: colors.border }]}>
              <View style={styles.mealTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mealType, { color: colors.accent }]}>{meal.mealType}</Text>
                  <Text style={[styles.mealName, { color: colors.ink }]}>{meal.name}</Text>
                </View>
                <Text style={[styles.mealKcal, { color: colors.ink }]}>{meal.kcal} kcal</Text>
              </View>
              <Text style={[styles.mealMeta, { color: colors.muted }]}>
                {t('plan.mealDetailMacros', { kcal: meal.kcal, p: meal.protein, c: meal.carbs, f: meal.fat, prep: meal.prepTime })}
              </Text>
              <View style={styles.mealActions}>
                <IconAction icon="document-text-outline" label={t('plan.detail')} onPress={() => setSelectedMeal(meal)} />
                <IconAction
                  icon="refresh-outline"
                  label={regeneratingIndex === index ? t('plan.regenerating') : t('plan.regenerate')}
                  disabled={regeneratingIndex !== null}
                  onPress={() => handleRegenerate(meal, index)}
                />
                <IconAction
                  icon={isMealLogged(meal) ? 'checkmark-circle-outline' : 'add-circle-outline'}
                  label={isMealLogged(meal) ? t('plan.logged') : t('plan.eat')}
                  disabled={isMealLogged(meal)}
                  onPress={() => logPlannedMeal(meal)}
                />
              </View>
            </View>
          ))}
          <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('plan.disclaimer')}</Text>
        </Card>
      ) : null}

      {shoppingGroups.length > 0 ? (
        <Card>
          <SectionHeader
            title={t('plan.shoppingList')}
            action={<Text style={[styles.link, { color: colors.accent }]} onPress={shareShoppingList}>{t('plan.share')}</Text>}
          />
          {shoppingGroups.map(group => (
            <View key={group.category} style={[styles.shoppingGroup, { borderTopColor: colors.border }]}>
              <Text style={[styles.shoppingTitle, { color: colors.ink }]}>{group.category}</Text>
              <Text style={[styles.shoppingItems, { color: colors.muted }]}>{group.items.join(', ')}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <PreferencesSheet
        visible={prefsOpen}
        likes={likes}
        dislikes={dislikes}
        mealCount={activeProfile.mealCount}
        onLikes={setLikes}
        onDislikes={setDislikes}
        onMealCount={mealCount => setProfile({ ...activeProfile, mealCount })}
        onSave={savePrefs}
        onClose={() => setPrefsOpen(false)}
      />
      <MealDetailModal meal={selectedMeal} onClose={() => setSelectedMeal(null)} />
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </Screen>
  );
}

function PreferencesSheet({
  visible,
  likes,
  dislikes,
  mealCount,
  onLikes,
  onDislikes,
  onMealCount,
  onSave,
  onClose,
}: {
  visible: boolean;
  likes: string;
  dislikes: string;
  mealCount: number;
  onLikes: (value: string) => void;
  onDislikes: (value: string) => void;
  onMealCount: (value: number) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <Label>{t('plan.prefsTitle')}</Label>
          <Field value={likes} onChangeText={onLikes} placeholder={t('plan.likesPlaceholder')} multiline />
          <Field value={dislikes} onChangeText={onDislikes} placeholder={t('plan.dislikesPlaceholder')} multiline />
          <View style={styles.mealStepper}>
            <Button variant="secondary" onPress={() => onMealCount(Math.max(2, mealCount - 1))}>{t('plan.removeMeal')}</Button>
            <Text style={[styles.mealCount, { color: colors.ink }]}>{t('plan.mealCount', { n: mealCount })}</Text>
            <Button variant="secondary" onPress={() => onMealCount(Math.min(6, mealCount + 1))}>{t('plan.addMeal')}</Button>
          </View>
          <Button onPress={onSave}>{t('common.save')}</Button>
        </View>
      </View>
    </Modal>
  );
}

function MealDetailModal({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  return (
    <Modal visible={Boolean(meal)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        {meal && (
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.mealType, { color: colors.accent }]}>{meal.mealType}</Text>
              <Text style={[styles.modalTitle, { color: colors.ink }]}>{meal.name}</Text>
              <Text style={[styles.mealMeta, { color: colors.muted }]}>
                {t('plan.mealDetailMacros', { kcal: meal.kcal, p: meal.protein, c: meal.carbs, f: meal.fat, prep: meal.prepTime })}
              </Text>
              <Label>{t('plan.ingredients')}</Label>
              {meal.ingredients.map((ingredient, index) => (
                <Text key={`${ingredient}-${index}`} style={[styles.detailLine, { color: colors.muted }]}>- {ingredient}</Text>
              ))}
              <Label>{t('plan.steps')}</Label>
              {meal.steps.map((step, index) => (
                <Text key={`${step}-${index}`} style={[styles.detailLine, { color: colors.muted }]}>{index + 1}. {step}</Text>
              ))}
            </ScrollView>
            <Button variant="secondary" onPress={onClose}>{t('common.close')}</Button>
          </View>
        )}
      </View>
    </Modal>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.mealAction, { borderColor: colors.border }, disabled && { opacity: 0.45 }]}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={[styles.mealActionText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function buildWeek(selectedDate: string, locale: 'cs' | 'en') {
  const base = new Date(selectedDate);
  const day = base.getDay() || 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day - 1));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      key: toDateKey(date),
      name: date.toLocaleDateString(locale === 'en' ? 'en-US' : 'cs-CZ', { weekday: 'short' }),
      num: String(date.getDate()),
    };
  });
}

function shortSession(session: TrainingSession, t: ReturnType<typeof useLanguage>['t']): string {
  if (session.kind === 'rest') return t('home.restDay');
  if (session.kind === 'long_run') return 'Long';
  if (session.kind === 'intervals') return 'Int';
  if (session.kind === 'tempo') return 'Tempo';
  return session.durationMinutes ? `${session.durationMinutes}m` : session.title;
}

function sessionLine(session: TrainingSession, t: ReturnType<typeof useLanguage>['t']): string {
  if (session.kind === 'rest') return t('today.restNote');
  const distance = session.distanceKm ? ` · ${session.distanceKm} km` : '';
  return `${session.title} · ${session.durationMinutes} min${distance}`;
}

function planMarkers(session: TrainingSession, carbsDelta: number, t: ReturnType<typeof useLanguage>['t']): string[] {
  const markers: string[] = [];
  if (session.kind === 'rest') markers.push(t('plan.markerRest'));
  if (session.kind === 'long_run') markers.push(t('plan.markerLongRun'));
  if (session.intensity === 'hard') markers.push(t('plan.markerHard'));
  if (carbsDelta > 0) markers.push(t('plan.markerFuel'));
  return markers;
}

const styles = StyleSheet.create({
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekStrip: { gap: 8, paddingRight: 20 },
  dayPill: { width: 76, minHeight: 88, borderWidth: 1, borderRadius: 16, padding: 10, justifyContent: 'space-between' },
  dayName: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  dayNum: { fontSize: 22, fontWeight: '900' },
  dayKind: { fontSize: 11, fontWeight: '800' },
  metricRow: { flexDirection: 'row', gap: 8 },
  fueling: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  quickGrid: { flexDirection: 'row', gap: 8 },
  mealRow: { borderTopWidth: 1, paddingTop: 14, gap: 9 },
  mealTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mealType: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  mealName: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  mealKcal: { fontSize: 15, fontWeight: '900' },
  mealMeta: { fontSize: 13, lineHeight: 18 },
  mealActions: { flexDirection: 'row', gap: 8 },
  mealAction: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  mealActionText: { fontSize: 12, fontWeight: '800' },
  disclaimer: { fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginTop: 4 },
  link: { fontSize: 13, fontWeight: '900' },
  shoppingGroup: { borderTopWidth: 1, paddingTop: 10, gap: 4 },
  shoppingTitle: { fontSize: 14, fontWeight: '900' },
  shoppingItems: { fontSize: 13, lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.48)' },
  modalSheet: { maxHeight: '84%', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  modalContent: { gap: 12, paddingBottom: 8 },
  modalTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  detailLine: { fontSize: 14, lineHeight: 21 },
  mealStepper: { gap: 10 },
  mealCount: { textAlign: 'center', fontSize: 14, fontWeight: '900' },
});
