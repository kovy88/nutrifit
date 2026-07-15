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
import { CollapsibleDetails, HeroDecisionCard } from '../components/SimpleUX';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { generateMealPlan, regenerateMeal } from '../services/api';
import { buildShoppingList, mealToFoodEstimate, plannedMealKey, formatDateLabel, toDateKey } from '../utils/nutrition';
import { planSessionForDate, planForDate, hasCustomSchedule } from '../lib/training';
import { trainingPhase, type TrainingPhase } from '../lib/training/phase';
import { SPORTS, cloneStarter } from '../lib/training/sports';
import type { Meal, TrainingSession } from '../types';
import type { TranslationKey } from '../lib/i18n';
import { useLanguage } from '../context/LanguageContext';
import { useUnits } from '../hooks/useUnits';
import { PaywallModal } from '../components/PaywallModal';
import { loadPlansByDate } from '../services/storage';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';

const PHASE_KEY: Record<TrainingPhase, TranslationKey> = {
  build: 'phase.build',
  peak: 'phase.peak',
  deload: 'phase.deload',
  taper: 'phase.taper',
  race_week: 'phase.race_week',
};

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
  const [mealsExpanded, setMealsExpanded] = useState(false);
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const { completion, mark } = useTrainingCompletion();

  useEffect(() => {
    if (!profile) return;
    setLikes(profile.likes);
    setDislikes(profile.dislikes);
  }, [profile?.likes, profile?.dislikes]);

  // Computed unconditionally (before the early return below) so hook order
  // stays stable across renders — e.g. profile can flip to null mid-session
  // after account deletion while this screen is still mounted.
  const weeklyPlanOrNull = useMemo(
    () => (profile ? planForDate(profile, new Date(selectedDate), {}, locale) : null),
    [profile, selectedDate, locale],
  );

  if (!profile || !currentMacros) return null;

  const activeProfile = profile;
  const activeMacros = currentMacros;
  const shoppingGroups = buildShoppingList(meals, locale);
  const selectedSession = currentSession ?? planSessionForDate(activeProfile, new Date(selectedDate), {}, locale);
  const weeklyPlan = weeklyPlanOrNull!;
  const customSchedule = hasCustomSchedule(activeProfile);
  const phase: TrainingPhase | null = customSchedule
    ? null
    : trainingPhase({ weekIndex: weeklyPlan.weekIndex, weekStartISO: weeklyPlan.weekStartISO, raceDateISO: activeProfile.raceDateISO, goalKind: activeProfile.trainingGoal });
  const isCustomEmpty = customSchedule && weeklyPlan.sessions.every(s => s.kind === 'rest');
  const mainSportId = activeProfile.mainSport?.id;
  const selectedDayTitle = selectedSession.kind === 'rest' ? t('today.restDayLabel') : showText(sessionLine(selectedSession, t));
  const selectedDayBody = mergedDayNote(selectedSession, dailyAdjustment?.carbsDelta ?? 0, locale);
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
      const next = await generateMealPlan(activeProfile, activeMacros, selectedSession, locale);
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
    await addFood(mealToFoodEstimate(meal, locale), 'planned');
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
      const next = await regenerateMeal({ profile: activeProfile, session: selectedSession, current: meal, otherMeals: meals, locale });
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

  function shiftSelectedDate(days: number) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    setSelectedDate(toDateKey(next));
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader
        eyebrow={t('tab.plan')}
        title={t('plan.weekTitle')}
        action={
          <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.settings')} style={[styles.iconButton, { borderColor: colors.hairline }]} onPress={() => setPrefsOpen(true)}>
            <Ionicons name="options-outline" size={20} color={colors.accent} />
          </Pressable>
        }
      />

      <DateNav dateKey={selectedDate} locale={locale} onShift={shiftSelectedDate} t={t} />

      <HeroDecisionCard
        eyebrow={planHeroEyebrow(phase, locale, t)}
        title={selectedDayTitle}
        body={selectedDayBody}
        statusLabel={formatDateLabel(selectedDate, locale)}
        statusTone={selectedSession.kind === 'rest' ? 'info' : 'ready'}
      >
        <View style={styles.heroActions}>
          <Button style={styles.heroActionButton} variant="secondary" onPress={() => navigation.navigate('Trénink')}>
            {t('today.adjustToday')}
          </Button>
          {heroAction ? (
            <Button style={styles.heroActionButton} onPress={heroAction.onPress}>{heroAction.label}</Button>
          ) : null}
        </View>
      </HeroDecisionCard>

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

      {loading ? <LoadingState title={t('plan.generating')} body={t('plan.loadingSub')} /> : null}

      <Card style={styles.rowsCard}>
        <PlanRow
          icon="restaurant-outline"
          title={t('plan.todayMeals')}
          subtitle={meals.length ? mealSummary(meals, locale) : t('plan.emptyBody')}
          expandable={meals.length > 0}
          expanded={mealsExpanded}
          onPress={() => {
            if (!meals.length) {
              if (!loading) generate();
              return;
            }
            setMealsExpanded(value => !value);
          }}
        />
        {mealsExpanded && meals.length ? (
          <View style={styles.detailBody}>
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
          </View>
        ) : null}

        <PlanRow
          icon="options-outline"
          title={moreOptionsTitle(locale)}
          subtitle={moreOptionsBody(customSchedule, shoppingGroups.length, locale)}
          expanded={optionsExpanded}
          onPress={() => setOptionsExpanded(value => !value)}
          style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
        />
        {optionsExpanded ? (
          <View style={styles.detailBody}>
            <Button variant="secondary" onPress={() => setPrefsOpen(true)}>{t('plan.prefsTitle')}</Button>
            {customSchedule ? (
              <Button variant="secondary" onPress={() => navigation.navigate('MujTyden')}>{t('myweek.openCta')}</Button>
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
        ) : null}
      </Card>

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
    <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.mealAction, { borderColor: colors.border, backgroundColor: colors.bgElev }, disabled && { opacity: 0.45 }]}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={[styles.mealActionText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function PlanRow({
  icon,
  title,
  subtitle,
  onPress,
  expanded,
  expandable = true,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  expanded?: boolean;
  expandable?: boolean;
  style?: any;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, style, pressed && { opacity: 0.82 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.bgElev }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      <Ionicons
        name={expandable ? (expanded ? 'chevron-up-outline' : 'chevron-down-outline') : 'chevron-forward-outline'}
        size={18}
        color={colors.muted}
      />
    </Pressable>
  );
}

function DateNav({
  dateKey,
  locale,
  onShift,
  t,
}: {
  dateKey: string;
  locale: 'cs' | 'en';
  onShift: (days: number) => void;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.dateNav}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('a11y.prevDay')}
        onPress={() => onShift(-1)}
        style={({ pressed }) => [styles.dateNavArrow, { backgroundColor: colors.bgElev }, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name="chevron-back" size={18} color={colors.accent} />
      </Pressable>
      <Text style={[styles.dateNavLabel, { color: colors.ink }]}>{formatDayNav(dateKey, locale)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('a11y.nextDay')}
        onPress={() => onShift(1)}
        style={({ pressed }) => [styles.dateNavArrow, { backgroundColor: colors.bgElev }, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name="chevron-forward" size={18} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function formatDayNav(dateKey: string, locale: 'cs' | 'en'): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString(locale === 'en' ? 'en-US' : 'cs-CZ', { weekday: 'short' });
  return `${weekday} ${day}.${month}. ${year}`;
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
    return locale === 'en' ? 'No meals yet.' : 'Zatím žádná jídla.';
  }
  return locale === 'en' ? `${meals.length} meals ready.` : `${meals.length} jídel připraveno.`;
}

function nutritionNote(session: TrainingSession, carbsDelta: number, locale: 'cs' | 'en'): string {
  if (carbsDelta > 0) {
    return locale === 'en' ? 'Eat a bit more around training.' : 'Kolem tréninku se najez trochu víc.';
  }
  if (session.kind === 'rest') {
    return locale === 'en' ? 'Steady meals, let recovery work.' : 'Stabilní jídlo, nech regeneraci pracovat.';
  }
  if (session.intensity === 'hard' || session.kind === 'long_run') {
    return locale === 'en' ? 'Fuel the hard work.' : 'Doplň energii na náročný trénink.';
  }
  return locale === 'en' ? 'Eat normally.' : 'Jez normálně.';
}

function intensityNote(session: TrainingSession, locale: 'cs' | 'en'): string {
  if (session.intensity === 'hard') return locale === 'en' ? 'Warm up well, no extra volume.' : 'Dobře se zahřej, bez objemu navíc.';
  if (session.intensity === 'moderate') return locale === 'en' ? 'Stay steady, finish with energy left.' : 'Drž tempo, konči s rezervou.';
  return locale === 'en' ? 'Easy and conversational.' : 'Lehce, v klidném tempu.';
}

function mergedDayNote(session: TrainingSession, carbsDelta: number, locale: 'cs' | 'en'): string {
  const fueling = nutritionNote(session, carbsDelta, locale);
  if (session.kind === 'rest') return fueling;
  return `${intensityNote(session, locale)} ${fueling}`;
}

function moreOptionsTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'More options' : 'Další možnosti';
}

function moreOptionsBody(customSchedule: boolean, shoppingGroupCount: number, locale: 'cs' | 'en'): string {
  if (customSchedule) {
    return locale === 'en' ? 'Custom week and preferences.' : 'Vlastní týden a preference.';
  }
  if (shoppingGroupCount > 0) {
    return locale === 'en' ? 'Preferences and shopping list.' : 'Preference a nákupní seznam.';
  }
  return locale === 'en' ? 'Preferences and plan notes.' : 'Preference a poznámky k plánu.';
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  dateNavArrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dateNavLabel: { fontSize: 16, fontWeight: '700', minWidth: 150, textAlign: 'center' },
  fueling: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  heroActions: { flexDirection: 'row', gap: 8 },
  heroActionButton: { flex: 1, minHeight: 46 },
  rowsCard: { borderRadius: 16, padding: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 13 },
  detailBody: { gap: 9, paddingHorizontal: 12, paddingBottom: 12 },
  mealRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 9 },
  mealTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mealType: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  mealName: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  mealKcal: { fontSize: 15, fontWeight: '700' },
  mealMeta: { fontSize: 13, lineHeight: 18 },
  mealActions: { flexDirection: 'row', gap: 8 },
  mealAction: { flex: 1, minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  mealActionText: { fontSize: 12, fontWeight: '600' },
  disclaimer: { fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginTop: 4 },
  link: { fontSize: 13, fontWeight: '600' },
  shoppingGroup: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  shoppingTitle: { fontSize: 14, fontWeight: '700' },
  shoppingItems: { fontSize: 13, lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)' },
  modalSheet: { maxHeight: '84%', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  modalContent: { gap: 12, paddingBottom: 8 },
  modalTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  detailLine: { fontSize: 14, lineHeight: 21 },
  mealStepper: { gap: 10 },
  mealCount: { textAlign: 'center', fontSize: 14, fontWeight: '600' },
});
