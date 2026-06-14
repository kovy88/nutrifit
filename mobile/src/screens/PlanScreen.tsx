import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import {
  Button,
  Card,
  Field,
  Label,
  LoadingState,
  ScreenHeader,
  SectionHeader,
} from '../components/UI';
import { CollapsibleDetails, HeroDecisionCard, SectionCard } from '../components/SimpleUX';
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
  const { showText } = useUnits();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [likes, setLikes] = useState(profile?.likes || '');
  const [dislikes, setDislikes] = useState(profile?.dislikes || '');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { completion, mark } = useTrainingCompletion();

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
  const selectedSession = currentSession ?? planSessionForDate(activeProfile, new Date(selectedDate), {}, locale);
  const weeklyPlan = useMemo(() => planForDate(activeProfile, new Date(selectedDate), {}, locale), [activeProfile, selectedDate, locale]);
  const customSchedule = hasCustomSchedule(activeProfile);
  const phase: TrainingPhase | null = customSchedule
    ? null
    : trainingPhase({ weekIndex: weeklyPlan.weekIndex, weekStartISO: weeklyPlan.weekStartISO, raceDateISO: activeProfile.raceDateISO, goalKind: activeProfile.trainingGoal });
  const isCustomEmpty = customSchedule && weeklyPlan.sessions.every(s => s.kind === 'rest');
  const mainSportId = activeProfile.mainSport?.id;
  const selectedDayTitle = selectedSession.kind === 'rest' ? t('today.restDayLabel') : showText(sessionLine(selectedSession, t));
  const selectedDayBody = nutritionNote(selectedSession, dailyAdjustment?.carbsDelta ?? 0, locale);
  const heroAction = meals.length > 0 && selectedSession.kind !== 'rest' && completion?.status !== 'completed' && !loading
      ? { label: t('today.markDone'), onPress: markWorkoutDoneForSelectedDay }
      : undefined;

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
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader
        eyebrow={t('tab.plan')}
        title={t('plan.weekTitle')}
        subtitle={t('plan.weekSubtitle', { date: formatDateLabel(selectedDate, locale) })}
      />

      <HeroDecisionCard
        eyebrow={planHeroEyebrow(phase, locale, t)}
        title={selectedDayTitle}
        body={selectedDayBody}
        statusLabel={formatDateLabel(selectedDate, locale)}
        statusTone={selectedSession.kind === 'rest' ? 'info' : 'ready'}
        actionLabel={heroAction?.label}
        onAction={heroAction?.onPress}
      />

      {isCustomEmpty ? (
        <Card>
          <SectionHeader title={t('myweek.emptyTitle')} />
          <Text style={[styles.fueling, { color: colors.muted }]}>{t('myweek.emptyBody')}</Text>
          {mainSportId ? (
            <Button onPress={loadStarterWeek}>{t('myweek.loadStarterFor', { sport: SPORTS[mainSportId].name(locale) })}</Button>
          ) : null}
        </Card>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
        {weekDays.map(day => {
          const session = planSessionForDate(activeProfile, new Date(day.key), {}, locale);
          const selected = day.key === selectedDate;
          return (
            <WeekDayChip
              key={day.key}
              day={day}
              session={session}
              selected={selected}
              onPress={() => {
                setSelectedDate(day.key);
              }}
              t={t}
            />
          );
        })}
      </ScrollView>

      {loading ? <LoadingState title={t('plan.generating')} body={t('plan.loadingSub')} /> : null}

      <SectionCard
        title={selectedTrainingTitle(locale)}
        body={trainingCardBody(selectedSession, locale, showText(sessionLine(selectedSession, t)))}
        ctaLabel={t('today.adjustToday')}
        onPress={() => navigation.navigate('Trénink')}
      />

      <SectionCard
        title={t('plan.todayMeals')}
        body={meals.length ? mealOverviewRows(meals, locale) : t('plan.emptyBody')}
        ctaLabel={!meals.length && !loading ? generateMealsLabel(locale) : undefined}
        onPress={!meals.length && !loading ? generate : undefined}
        detailLabel={meals.length ? t('plan.detail') : undefined}
        detailChildren={
          <>
            {meals.length ? (
              <>
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
              </>
            ) : null}
          </>
        }
      />

      <SectionCard
        title={moreOptionsTitle(locale)}
        body={moreOptionsBody(customSchedule, shoppingGroups.length, locale)}
        detailLabel={openOptionsLabel(locale)}
        detailChildren={
          <View style={styles.moreOptions}>
            <Button variant="secondary" onPress={() => setPrefsOpen(true)}>{t('plan.prefsTitle')}</Button>
            {customSchedule ? (
              <Button variant="secondary" onPress={() => navigation.navigate('MujTyden')}>{t('myweek.openCta')}</Button>
            ) : null}
            {weeklyPlan.safetyWarnings?.length ? (
              <CollapsibleDetails label={t('plan.ambitiousWarning')}>
                {weeklyPlan.safetyWarnings.map((warning, index) => (
                  <Text key={`${warning}-${index}`} style={[styles.fueling, { color: colors.muted }]}>• {warning}</Text>
                ))}
              </CollapsibleDetails>
            ) : null}
            {shoppingGroups.length > 0 ? (
              <CollapsibleDetails label={t('plan.shoppingList')}>
                {shoppingGroups.map(group => (
                  <View key={group.category} style={[styles.shoppingGroup, { borderTopColor: colors.border }]}>
                    <Text style={[styles.shoppingTitle, { color: colors.ink }]}>{group.category}</Text>
                    <Text style={[styles.shoppingItems, { color: colors.muted }]}>{group.items.join(', ')}</Text>
                  </View>
                ))}
                <Button variant="secondary" onPress={shareShoppingList}>{t('plan.share')}</Button>
              </CollapsibleDetails>
            ) : null}
          </View>
        }
      />

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

function WeekDayChip({
  day,
  session,
  selected,
  onPress,
  t,
}: {
  day: ReturnType<typeof buildWeek>[number];
  session: TrainingSession;
  selected: boolean;
  onPress: () => void;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayChip,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.accent + '18' : colors.bgElev,
        },
        pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text numberOfLines={1} style={[styles.dayName, { color: selected ? colors.accent : colors.faint }]}>{day.name}</Text>
      <Text style={[styles.dayNum, { color: colors.ink }]}>{day.num}</Text>
      <Text numberOfLines={1} style={[styles.daySession, { color: colors.muted }]}>{shortSession(session, t)}</Text>
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

function planHeroEyebrow(phase: TrainingPhase | null, locale: 'cs' | 'en', t: ReturnType<typeof useLanguage>['t']): string {
  if (!phase) return t('tab.plan');
  return locale === 'en'
    ? `This week · ${t(PHASE_KEY[phase])}`
    : `Tento týden · ${t(PHASE_KEY[phase])}`;
}

function sessionLine(session: TrainingSession, t: ReturnType<typeof useLanguage>['t']): string {
  if (session.kind === 'rest') return t('today.restNote');
  const base = sessionLinePart(session);
  return session.second ? `${base}  +  ${sessionLinePart(session.second)}` : base;
}

function sessionLinePart(session: Pick<TrainingSession, 'title' | 'durationMinutes' | 'distanceKm'>): string {
  const title = session.title.trim();
  const duration = titleIncludesDuration(title) ? '' : ` · ${session.durationMinutes} min`;
  const distance = session.distanceKm ? ` · ${session.distanceKm} km` : '';
  return `${title}${duration}${distance}`;
}

function titleIncludesDuration(title: string): boolean {
  return /\b\d+\s*(min|mins|minute|minutes|minut|m)\b/i.test(title);
}

function mealSummary(meals: Meal[], locale: 'cs' | 'en'): string {
  if (!meals.length) {
    return locale === 'en' ? 'No meals planned yet.' : 'Jídla zatím nejsou připravená.';
  }
  return locale === 'en'
    ? `${meals.length} meals are ready for this day.`
    : `${meals.length} jídel je připravených pro tenhle den.`;
}

function mealOverviewRows(meals: Meal[], locale: 'cs' | 'en'): string[] {
  const names = meals.slice(0, 2).map(meal => `${meal.mealType}: ${meal.name}`);
  return [mealSummary(meals, locale), ...names].slice(0, 2);
}

function generateMealsLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Generate meals' : 'Vygenerovat jídla';
}

function nutritionNote(session: TrainingSession, carbsDelta: number, locale: 'cs' | 'en'): string {
  if (carbsDelta > 0) {
    return locale === 'en'
      ? 'Eat a little more around the workout and keep the rest simple.'
      : 'Kolem tréninku se najez trochu víc a zbytek dne drž jednoduše.';
  }
  if (session.kind === 'rest') {
    return locale === 'en'
      ? 'Keep meals steady and let recovery do the work.'
      : 'Drž jídlo stabilní a nech regeneraci udělat svou práci.';
  }
  if (session.intensity === 'hard' || session.kind === 'long_run') {
    return locale === 'en'
      ? 'Fuel the quality work, then return to a simple day.'
      : 'Doplň energii na kvalitní práci a pak se vrať k jednoduchému dni.';
  }
  return locale === 'en'
    ? 'Eat normally and keep the day easy to follow.'
    : 'Jez normálně a drž den snadno splnitelný.';
}

function trainingCardBody(session: TrainingSession, locale: 'cs' | 'en', line: string): string[] {
  if (session.kind === 'rest') {
    return [
      locale === 'en' ? 'No workout planned for this day.' : 'Pro tenhle den není plánovaný trénink.',
      locale === 'en' ? 'Keep it light and do not add intensity.' : 'Drž den lehký a nepřidávej intenzitu.',
    ];
  }
  const note = session.intensity === 'hard'
    ? (locale === 'en' ? 'Protect the hard work: warm up well and do not add extra volume.' : 'Tvrdý den: dobře se zahřej a nepřidávej objem navíc.')
    : session.intensity === 'moderate'
      ? (locale === 'en' ? 'Stay steady and finish with energy left.' : 'Drž stabilní tempo a konči s rezervou.')
      : (locale === 'en' ? 'Keep it easy and conversational.' : 'Drž to lehce a v klidném tempu.');
  return [line, note];
}

function moreOptionsTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'More options' : 'Další možnosti';
}

function openOptionsLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Open' : 'Zobrazit';
}

function moreOptionsBody(customSchedule: boolean, shoppingGroupCount: number, locale: 'cs' | 'en'): string {
  if (customSchedule) {
    return locale === 'en'
      ? 'Custom week, preferences and shopping list stay here.'
      : 'Vlastní týden, preference a nákupní seznam jsou tady.';
  }
  if (shoppingGroupCount > 0) {
    return locale === 'en'
      ? 'Preferences, safety notes and shopping list stay out of the main plan.'
      : 'Preference, bezpečnostní poznámky a nákupní seznam jsou mimo hlavní plán.';
  }
  return locale === 'en'
    ? 'Preferences and advanced plan notes stay tucked away.'
    : 'Preference a pokročilé poznámky k plánu jsou schované tady.';
}

function selectedTrainingTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Training for this day' : 'Trénink pro tenhle den';
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  weekStrip: { gap: 7, paddingRight: 4 },
  dayChip: { width: 70, minHeight: 68, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, justifyContent: 'space-between' },
  dayName: { fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  dayNum: { fontSize: 20, lineHeight: 23, fontWeight: '900' },
  daySession: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  fueling: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  moreOptions: { gap: 9 },
  mealRow: { borderTopWidth: 1, paddingTop: 14, gap: 9 },
  mealTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mealType: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  mealName: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  mealKcal: { fontSize: 15, fontWeight: '900' },
  mealMeta: { fontSize: 13, lineHeight: 18 },
  mealActions: { flexDirection: 'row', gap: 8 },
  mealAction: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
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
