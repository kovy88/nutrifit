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
import { planSessionForDate, planForDate, hasCustomSchedule } from '../lib/training';
import { trainingPhase, type TrainingPhase } from '../lib/training/phase';
import { SPORTS, cloneStarter } from '../lib/training/sports';
import type { Meal, TrainingSession } from '../types';
import type { TranslationKey } from '../lib/i18n';

const PHASE_KEY: Record<TrainingPhase, TranslationKey> = {
  build: 'phase.build',
  peak: 'phase.peak',
  deload: 'phase.deload',
  taper: 'phase.taper',
  race_week: 'phase.race_week',
};
import { useLanguage } from '../context/LanguageContext';
import { useUnits } from '../hooks/useUnits';
import { PaywallModal } from '../components/PaywallModal';
import { loadPlansByDate } from '../services/storage';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';

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
  const { showText, showDistance, distanceUnit } = useUnits();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [likes, setLikes] = useState(profile?.likes || '');
  const [dislikes, setDislikes] = useState(profile?.dislikes || '');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState(selectedDate);
  const [plansByDate, setPlansByDate] = useState<Record<string, Meal[]>>({});
  const { completion, mark } = useTrainingCompletion();

  useEffect(() => {
    if (!profile) return;
    setLikes(profile.likes);
    setDislikes(profile.dislikes);
  }, [profile?.likes, profile?.dislikes]);

  useEffect(() => {
    setExpandedDay(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    void loadPlansByDate().then(plans => {
      if (!cancelled) setPlansByDate(plans);
    });
    return () => { cancelled = true; };
  }, [selectedDate, meals.length]);

  const weekDays = useMemo(() => buildWeek(selectedDate, locale), [selectedDate, locale]);

  if (!profile || !currentMacros) return null;

  const activeProfile = profile;
  const activeMacros = currentMacros;
  const shoppingGroups = buildShoppingList(meals);
  const selectedSession = currentSession ?? planSessionForDate(activeProfile, new Date(selectedDate), {}, locale);
  const weeklyPlan = useMemo(() => planForDate(activeProfile, new Date(selectedDate), {}, locale), [activeProfile, selectedDate, locale]);
  const phase: TrainingPhase | null = hasCustomSchedule(activeProfile)
    ? null
    : trainingPhase({ weekIndex: weeklyPlan.weekIndex, weekStartISO: weeklyPlan.weekStartISO, raceDateISO: activeProfile.raceDateISO, goalKind: activeProfile.trainingGoal });
  const isCustomEmpty = hasCustomSchedule(activeProfile) && weeklyPlan.sessions.every(s => s.kind === 'rest');
  const mainSportId = activeProfile.mainSport?.id;

  async function loadStarterWeek() {
    if (!mainSportId) return;
    await setProfile({ ...activeProfile, weeklyActivities: cloneStarter(mainSportId) });
  }

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
      setPlansByDate(current => ({ ...current, [selectedDate]: next }));
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
    Alert.alert(t('plan.logged'), t('plan.loggedToast', { meal: meal.name, date: formatDateLabel(selectedDate, locale) }));
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
      setPlansByDate(current => ({ ...current, [selectedDate]: nextMeals }));
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

  async function markWorkoutDoneForSelectedDay() {
    if (selectedSession.kind === 'rest') return;
    await mark('completed');
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow={t('tab.plan')}
        title={t('plan.weekTitle')}
        subtitle={t('plan.weekSubtitle', { date: formatDateLabel(selectedDate, locale) })}
        action={
          <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.settings')} style={[styles.iconButton, { borderColor: colors.hairline }]} onPress={() => setPrefsOpen(true)}>
            <Ionicons name="options-outline" size={20} color={colors.accent} />
          </Pressable>
        }
      />

      {phase ? (
        <View style={styles.phaseRow}>
          <View style={[styles.phaseBadge, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}>
            <Text style={[styles.phaseText, { color: colors.accent }]}>{t('phase.prefix')} · {t(PHASE_KEY[phase])}</Text>
          </View>
        </View>
      ) : null}

      <QuickActionButton icon="calendar-outline" label={t('myweek.openCta')} onPress={() => navigation.navigate('MujTyden')} />

      {isCustomEmpty ? (
        <Card>
          <SectionHeader title={t('myweek.emptyTitle')} />
          <Text style={[styles.fueling, { color: colors.muted }]}>{t('myweek.emptyBody')}</Text>
          {mainSportId ? (
            <Button onPress={loadStarterWeek}>{t('myweek.loadStarterFor', { sport: SPORTS[mainSportId].name(locale) })}</Button>
          ) : null}
        </Card>
      ) : null}

      {weeklyPlan.safetyWarnings && weeklyPlan.safetyWarnings.length > 0 ? (
        <Card style={{ borderColor: colors.orange, backgroundColor: colors.orange + '10', marginBottom: 12, padding: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <Ionicons name="warning-outline" size={20} color={colors.orange} />
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.ink, flex: 1 }}>
              {t('plan.ambitiousWarning')}
            </Text>
          </View>
          {weeklyPlan.safetyWarnings.map((warning, index) => (
            <Text key={index} style={{ fontSize: 13, color: colors.muted, lineHeight: 18, marginTop: 2 }}>
              • {warning}
            </Text>
          ))}
        </Card>
      ) : null}

      {weeklyPlan.weeklyVolume && weeklyPlan.weeklyVolume > 0 ? (
        <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.accent }}>
            {t('plan.weeklyVolume', { volume: Math.round(showDistance(weeklyPlan.weeklyVolume)), unit: distanceUnit })}
          </Text>
        </View>
      ) : null}

      <View style={styles.weekList}>
        {weekDays.map(day => {
          const session = planSessionForDate(activeProfile, new Date(day.key), {}, locale);
          const selected = day.key === selectedDate;
          const expanded = day.key === expandedDay;
          const dayMeals = selected ? meals : plansByDate[day.key] ?? [];
          return (
            <PlanDayCard
              key={day.key}
              selected={selected}
              isRest={session.kind === 'rest'}
              isLongRun={session.kind === 'long_run'}
              title={`${day.name} ${day.num}`}
              subtitle={showText(sessionLine(session, t))}
              markers={planMarkers(session, selected ? dailyAdjustment?.carbsDelta ?? 0 : 0, t)}
              onPress={() => {
                setSelectedDate(day.key);
                setExpandedDay(expanded ? day.key : day.key);
              }}
            >
              {expanded ? (
                <View style={styles.dayDetails}>
                  <View style={styles.daySummaryRow}>
                    <View style={styles.daySummaryBlock}>
                      <Text style={[styles.daySummaryLabel, { color: colors.faint }]}>{t('plan.mealSummary')}</Text>
                      <Text style={[styles.daySummaryText, { color: colors.ink }]}>{mealSummary(dayMeals, t)}</Text>
                    </View>
                    <View style={styles.daySummaryBlock}>
                      <Text style={[styles.daySummaryLabel, { color: colors.faint }]}>{t('plan.trainingSummary')}</Text>
                      <Text style={[styles.daySummaryText, { color: colors.ink }]}>{showText(shortSession(session, t))}</Text>
                    </View>
                  </View>
                  <View style={styles.metricRow}>
                    <MetricCard compact label="kcal" value={selected ? activeMacros.kcal : totalMealKcal(dayMeals) || '-'} color={colors.accent} />
                    <MetricCard compact label={t('home.protein')} value={selected ? activeMacros.protein : totalMealProtein(dayMeals) || '-'} unit={selected || totalMealProtein(dayMeals) ? 'g' : undefined} color={colors.green} />
                  </View>
                  <Text style={[styles.fueling, { color: colors.muted }]}>{nutritionNote(session, selected ? dailyAdjustment?.carbsDelta ?? 0 : 0, t)}</Text>
                  <View style={styles.dayActions}>
                    <QuickActionButton icon="restaurant-outline" label={dayMeals.length ? t('today.swapMeal') : t('plan.generate')} onPress={generate} disabled={loading || !selected} />
                    <QuickActionButton icon="options-outline" label={t('today.adjustToday')} onPress={() => navigation.navigate('Trénink')} />
                    {session.kind !== 'rest' ? (
                      <QuickActionButton
                        icon="checkmark-circle-outline"
                        label={completion?.status === 'completed' && selected ? t('today.completed') : t('today.markDone')}
                        onPress={markWorkoutDoneForSelectedDay}
                        disabled={!selected || completion?.status === 'completed'}
                      />
                    ) : null}
                  </View>
                </View>
              ) : null}
            </PlanDayCard>
          );
        })}
      </View>

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
    <Pressable disabled={disabled} onPress={onPress} style={[styles.mealAction, { borderColor: colors.hairline }, disabled && { opacity: 0.45 }]}>
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
  const base = `${session.title} · ${session.durationMinutes} min${distance}`;
  return session.second ? `${base}  +  ${session.second.title} · ${session.second.durationMinutes} min` : base;
}

function planMarkers(session: TrainingSession, carbsDelta: number, t: ReturnType<typeof useLanguage>['t']): string[] {
  const markers: string[] = [];
  if (session.kind === 'rest') markers.push(t('plan.markerRest'));
  if (session.kind === 'long_run') markers.push(t('plan.markerLongRun'));
  if (session.kind === 'match') markers.push(t('plan.markerMatch'));
  if (session.intensity === 'hard' && session.kind !== 'match') markers.push(t('plan.markerHard'));
  if (carbsDelta > 0) markers.push(t('plan.markerFuel'));
  return markers;
}

function mealSummary(meals: Meal[], t: ReturnType<typeof useLanguage>['t']): string {
  if (!meals.length) return t('plan.noMealsYet');
  return t('plan.mealSummaryValue', { count: meals.length, kcal: totalMealKcal(meals) });
}

function totalMealKcal(meals: Meal[]): number {
  return meals.reduce((sum, meal) => sum + meal.kcal, 0);
}

function totalMealProtein(meals: Meal[]): number {
  return meals.reduce((sum, meal) => sum + meal.protein, 0);
}

function nutritionNote(session: TrainingSession, carbsDelta: number, t: ReturnType<typeof useLanguage>['t']): string {
  if (carbsDelta > 0) return t('plan.fuelAdjustmentShort', { carbs: Math.round(carbsDelta) });
  if (session.kind === 'rest') return t('plan.restAdjustmentShort');
  if (session.intensity === 'hard' || session.kind === 'long_run') return t('plan.hardDayAdjustmentShort');
  return t('plan.easyDayAdjustmentShort');
}

const styles = StyleSheet.create({
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  phaseRow: { flexDirection: 'row', marginBottom: 4 },
  phaseBadge: { borderWidth: 0.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  phaseText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  weekList: { gap: 10 },
  dayDetails: { gap: 12 },
  daySummaryRow: { flexDirection: 'row', gap: 10 },
  daySummaryBlock: { flex: 1, gap: 3 },
  daySummaryLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.7 },
  daySummaryText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  metricRow: { flexDirection: 'row', gap: 8 },
  fueling: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', gap: 8 },
  dayActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 9 },
  mealTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mealType: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.7 },
  mealName: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  mealKcal: { fontSize: 15, fontWeight: '700' },
  mealMeta: { fontSize: 13, lineHeight: 18 },
  mealActions: { flexDirection: 'row', gap: 8 },
  mealAction: { flex: 1, minHeight: 42, borderWidth: 0.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  mealActionText: { fontSize: 12, fontWeight: '600' },
  disclaimer: { fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginTop: 4 },
  link: { fontSize: 13, fontWeight: '700' },
  shoppingGroup: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  shoppingTitle: { fontSize: 14, fontWeight: '700' },
  shoppingItems: { fontSize: 13, lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.48)' },
  modalSheet: { maxHeight: '84%', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  modalContent: { gap: 12, paddingBottom: 8 },
  modalTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  detailLine: { fontSize: 14, lineHeight: 21 },
  mealStepper: { gap: 10 },
  mealCount: { textAlign: 'center', fontSize: 14, fontWeight: '700' },
});
