import { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { generateMealPlan, regenerateMeal } from '../services/api';
import { buildShoppingList, mealToFoodEstimate, plannedMealKey, formatDateLabel, toDateKey } from '../utils/nutrition';
import type { Meal } from '../types';
import { DateHeader } from '../components/DateHeader';
import { useLanguage } from '../context/LanguageContext';

function PlanLoadingIndicator() {
  const { t } = useLanguage();
  const [msgIdx, setMsgIdx] = useState(0);
  const messages = [
    t('plan.loading0'),
    t('plan.loading1'),
    t('plan.loading2'),
    t('plan.loading3'),
    t('plan.loading4'),
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIdx(prev => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card style={styles.loadingCard}>
      <ActivityIndicator size="large" color={colors.green} />
      <Text style={styles.loadingText}>{messages[msgIdx]}</Text>
      <Text style={styles.loadingSub}>{t('plan.loadingSub')}</Text>
    </Card>
  );
}

export function PlanScreen() {
  const {
    profile,
    currentMacros: todayMacros,
    currentSession: todaySession,
    currentMeals: meals,
    currentFoodLog: foodLog,
    setMeals,
    setProfile,
    addFood,
    ensureAiConsent,
    selectedDate,
  } = useNutriFit();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  // Debouncing local states for likes and dislikes
  const [likes, setLikes] = useState(profile?.likes || '');
  const [dislikes, setDislikes] = useState(profile?.dislikes || '');

  useEffect(() => {
    if (profile) {
      setLikes(profile.likes);
      setDislikes(profile.dislikes);
    }
  }, [profile?.likes, profile?.dislikes]);

  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(() => {
      if (likes !== profile.likes || dislikes !== profile.dislikes) {
        setProfile({ ...profile, likes, dislikes });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [likes, dislikes]);

  if (!profile || !todayMacros) return null;
  const activeProfile = profile;
  const activeMacros = todayMacros;
  const shoppingGroups = buildShoppingList(meals);

  async function generate() {
    const consent = await ensureAiConsent();
    if (!consent) return;

    const isPast = selectedDate < toDateKey(new Date());
    if (isPast) {
      const confirm = await new Promise<boolean>(resolve => {
        Alert.alert(
          t('plan.overwritePastTitle'),
          t('plan.overwritePastMsg'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('plan.overwrite'), onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirm) return;
    }

    setLoading(true);
    try {
      const next = await generateMealPlan(activeProfile, activeMacros, todaySession);
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
        Alert.alert(
          t('plan.futureLogTitle'),
          t('plan.futureLogMsg'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('plan.log'), onPress: () => resolve(true) },
          ]
        );
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

  /** Regenerate a single meal slot. Replaces only that one in the array;
   *  the rest of the plan and the daily total stay untouched (±10 % per macro). */
  async function handleRegenerate(meal: Meal, index: number) {
    const consent = await ensureAiConsent();
    if (!consent) return;
    if (isMealLogged(meal)) {
      Alert.alert(t('plan.cannotRegenTitle'), t('plan.cannotRegenMsg'));
      return;
    }
    setRegeneratingIndex(index);
    try {
      const next = await regenerateMeal({
        profile: activeProfile,
        session: todaySession,
        current: meal,
        otherMeals: meals,
      });
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
      <DateHeader />
      <H1>{t('plan.title')}</H1>
      <Subtitle>{t('plan.subtitle', { date: formatDateLabel(selectedDate), goal: todaySession?.title || t('plan.restDayGoal') })}</Subtitle>

      <Card>
        <Label>{t('plan.prefsTitle')}</Label>
        <Field value={likes} onChangeText={setLikes} placeholder={t('plan.likesPlaceholder')} multiline />
        <Field value={dislikes} onChangeText={setDislikes} placeholder={t('plan.dislikesPlaceholder')} multiline />
        <View style={styles.row}>
          <Button variant="secondary" onPress={() => setProfile({ ...profile, mealCount: Math.max(2, profile.mealCount - 1) })}>{t('plan.removeMeal')}</Button>
          <Button variant="secondary" onPress={() => setProfile({ ...profile, mealCount: Math.min(6, profile.mealCount + 1) })}>{t('plan.addMeal')}</Button>
        </View>
        <Text style={styles.small}>{t('plan.mealCount', { n: profile.mealCount })}</Text>
        <Button disabled={loading} onPress={generate}>{loading ? t('plan.generating') : t('plan.generate')}</Button>
      </Card>

      {loading && <PlanLoadingIndicator />}

      <Card>
        <Label>{t('plan.lastPlan')}</Label>
        {meals.length === 0 ? (
          <Text style={styles.empty}>{t('plan.noPlan')}</Text>
        ) : (
          <>
            {meals.map((meal, index) => (
              <View key={`${meal.mealType}-${index}`} style={styles.mealCard}>
                <Text style={styles.mealType}>{meal.mealType}</Text>
                <Text style={styles.mealName}>{meal.name}</Text>
                <View style={styles.macroRow}>
                  <Text style={styles.macroPill}>{meal.kcal} kcal</Text>
                  <Text style={styles.macroPill}>{t('home.macroProteinShort')} {meal.protein}g</Text>
                  <Text style={styles.macroPill}>{t('home.macroCarbsShort')} {meal.carbs}g</Text>
                  <Text style={styles.macroPill}>{t('home.macroFatShort')} {meal.fat}g</Text>
                </View>
                <Text style={styles.small}>{t('plan.mealMeta', { prep: meal.prepTime, difficulty: meal.difficulty, fiber: meal.fiber })}</Text>
                <Text style={styles.ingredients}>{meal.ingredients.slice(0, 6).join(', ')}</Text>
                <View style={styles.row}>
                  <Button variant="secondary" onPress={() => setSelectedMeal(meal)}>{t('plan.detail')}</Button>
                  <Button
                    variant="secondary"
                    disabled={regeneratingIndex !== null}
                    onPress={() => handleRegenerate(meal, index)}
                  >
                    {regeneratingIndex === index ? '⏳' : '🔄'}
                  </Button>
                  <Button disabled={isMealLogged(meal)} onPress={() => logPlannedMeal(meal)}>
                    {isMealLogged(meal) ? t('plan.logged') : t('plan.eat')}
                  </Button>
                </View>
              </View>
            ))}
            <Text style={styles.planDisclaimer}>
              {t('plan.disclaimer')}
            </Text>
          </>
        )}
      </Card>

      {shoppingGroups.length > 0 && (
        <Card>
          <View style={styles.headerRow}>
            <Label>{t('plan.shoppingList')}</Label>
            <Text style={styles.link} onPress={shareShoppingList}>{t('plan.share')}</Text>
          </View>
          {shoppingGroups.map(group => (
            <View key={group.category} style={styles.shoppingGroup}>
              <Text style={styles.shoppingTitle}>{group.category}</Text>
              {group.items.map(item => (
                <Text key={item} style={styles.shoppingItem}>• {item}</Text>
              ))}
            </View>
          ))}
        </Card>
      )}

      <MealDetailModal meal={selectedMeal} onClose={() => setSelectedMeal(null)} />
    </Screen>
  );
}

function MealDetailModal({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <Modal visible={Boolean(meal)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        {meal && (
          <View style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.mealType}>{meal.mealType}</Text>
              <Text style={styles.modalTitle}>{meal.name}</Text>
              <Text style={styles.small}>{t('plan.mealDetailMacros', { kcal: meal.kcal, p: meal.protein, c: meal.carbs, f: meal.fat, prep: meal.prepTime })}</Text>
              <Label>{t('plan.ingredients')}</Label>
              {meal.ingredients.map((ingredient, index) => (
                <Text key={`${ingredient}-${index}`} style={styles.detailLine}>• {ingredient}</Text>
              ))}
              <Label>{t('plan.steps')}</Label>
              {meal.steps.map((step, index) => (
                <Text key={`${step}-${index}`} style={styles.detailLine}>{index + 1}. {step}</Text>
              ))}
            </ScrollView>
            <Button variant="secondary" onPress={onClose}>{t('common.close')}</Button>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  small: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.faint },
  mealCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 8 },
  mealType: { color: colors.green, fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  mealName: { color: colors.ink, fontWeight: '900', fontSize: 17 },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  macroPill: { color: colors.ink, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontWeight: '800', fontSize: 12, backgroundColor: '#fbfbf8' },
  ingredients: { color: colors.muted, lineHeight: 20 },
  link: { color: colors.green, fontWeight: '900' },
  shoppingGroup: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 4 },
  shoppingTitle: { color: colors.ink, fontWeight: '900' },
  shoppingItem: { color: colors.muted, lineHeight: 20 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(25, 33, 29, 0.38)' },
  modalSheet: { maxHeight: '82%', backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
  modalContent: { gap: 12, paddingBottom: 6 },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  detailLine: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  planDisclaimer: { color: colors.faint, fontSize: 12, lineHeight: 18, marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, fontStyle: 'italic' },
  loadingCard: { alignItems: 'center', paddingVertical: 30, gap: 14, backgroundColor: '#f4fbf7', borderColor: '#dcf2e6', borderWidth: 1, marginVertical: 10 },
  loadingText: { color: colors.green, fontSize: 16, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  loadingSub: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
});
