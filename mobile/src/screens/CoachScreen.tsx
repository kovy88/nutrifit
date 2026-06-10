import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button, EmptyState, Field, ScreenHeader } from '../components/UI';
import { HeroDecisionCard, SectionCard } from '../components/SimpleUX';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useTrenr } from '../context/TrenrContext';
import { resolveCoachScope, scopeHasNutrition } from '../types';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { hasCustomSchedule, nextMatchInfo } from '../lib/training';
import { sportName } from '../lib/training/sports';
import { useCoachThread } from '../hooks/useCoachThread';
import { askCoach } from '../services/api';
import { incrementCoachTeaserUsed, loadCoachTeaserUsed } from '../services/storage';
import type { CoachChatContext } from '../lib/ai/coachChat';
import type { CoachMessage } from '../types/coach';
import { PaywallModal } from '../components/PaywallModal';

function uid(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Free non-subscribers get a small taste of the coach before the paywall.
const COACH_FREE_LIMIT = 3;

export function CoachScreen() {
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const { profile, selectedDate, ensureAiConsent, isSubscribed } = useTrenr();
  const navigation = useNavigation<any>();
  const showNutrition = profile ? scopeHasNutrition(resolveCoachScope(profile)) : false;
  const [freeUsed, setFreeUsed] = useState(0);
  useEffect(() => { loadCoachTeaserUsed().then(setFreeUsed).catch(() => {}); }, []);
  const { recommendation } = useDailyCoachRecommendation(new Date(selectedDate));
  const threadMemory = useMemo(() => ({
    goalSummary: profile ? `${profile.primaryGoal} + ${profile.trainingGoal}` : 'general_fitness',
    updatedAt: new Date().toISOString(),
  }), [profile?.primaryGoal, profile?.trainingGoal]);
  const { messages, persist } = useCoachThread(selectedDate, threadMemory);
  const [followups, setFollowups] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Rychlé otázky podle režimu: sportovec (custom rytmus) řeší zápas/off-field,
  // ne „co jíst před během" / „je můj závod reálný".
  const isCustomSport = profile ? hasCustomSchedule(profile) : false;
  const prompts = useMemo(() => {
    if (isCustomSport) {
      return [
        t('coach.promptWhy'),
        t('coach.promptBadSleep'),
        t('coach.promptMatchPrep'),
        t('coach.promptMatchFuel'),
        t('coach.promptOffField'),
        t('coach.promptMissedWorkout'),
      ];
    }
    return [
      t('coach.promptWhy'),
      t('coach.promptFuel'),
      t('coach.promptBadSleep'),
      t('coach.promptSwapDinner'),
      t('coach.promptMissedWorkout'),
      t('coach.promptRaceRealistic'),
    ];
  }, [isCustomSport, t]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    if (!isSubscribed && freeUsed >= COACH_FREE_LIMIT) {
      setPaywallOpen(true);
      return;
    }
    const consent = await ensureAiConsent();
    if (!consent) return;

    const prior = messages;
    const userMsg: CoachMessage = { id: uid(), role: 'user', text: q, createdAt: new Date().toISOString() };
    await persist([...prior, userMsg], threadMemory);
    setInput('');
    setFollowups([]);
    setSending(true);
    try {
      const context: CoachChatContext = {
        recommendation,
        goalSummary: profile ? `${profile.primaryGoal} + ${profile.trainingGoal}` : 'general_fitness',
        mainSport: profile?.mainSport ? sportName(profile.mainSport.id, profile.mainSport.label, locale) : null,
        nextMatchInDays: profile?.weeklyActivities ? (nextMatchInfo(profile.weeklyActivities, selectedDate)?.daysUntil ?? null) : null,
        units: profile?.units ?? 'metric',
      };
      const res = await askCoach({ context, history: prior, question: q, locale });
      await persist([
        ...prior,
        userMsg,
        { id: uid(), role: 'coach', text: res.reply, proposedActions: res.actions, createdAt: new Date().toISOString() },
      ], threadMemory);
      setFollowups(res.followups || []);
      if (!isSubscribed) {
        const used = await incrementCoachTeaserUsed();
        setFreeUsed(used);
      }
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('common.tryAgain'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen
      footer={
        <View style={styles.composer}>
          <Field value={input} onChangeText={setInput} placeholder={t('coach.inputPlaceholder')} multiline />
          <Button disabled={sending || !input.trim()} onPress={() => send(input)}>{sending ? t('coach.thinking') : t('coach.send')}</Button>
        </View>
      }
    >
      <ScreenHeader eyebrow={t('tab.coach')} title={t('coach.title')} subtitle={t('coach.subtitle')} />

      <HeroDecisionCard
        eyebrow={t('coach.todayContext')}
        title={recommendation?.headline ?? t('coach.title')}
        body={recommendation?.coachNote ?? t('coach.todayContextEmpty')}
        accent={readinessColor(recommendation?.readiness.band, colors)}
        statusLabel={recommendation ? coachIntensityLabel(recommendation.readiness.recommendedIntensity, locale) : undefined}
        statusTone={recommendation?.readiness.band === 'low' ? 'risk' : recommendation?.readiness.band === 'medium' ? 'caution' : 'ready'}
      />

      <SectionCard
        title={t('coach.suggestedTitle')}
        body={showNutrition ? t('coach.subtitle') : undefined}
        ctaLabel={showNutrition ? t('today.meals') : undefined}
        onPress={showNutrition ? () => navigation.navigate('Jídelníček') : undefined}
      >
        <View style={styles.promptGrid}>
          {prompts.slice(0, 3).map(prompt => (
            <PromptChip key={prompt} label={prompt} onPress={() => send(prompt)} />
          ))}
        </View>
      </SectionCard>

      {messages.length === 0 ? (
        <EmptyState title={t('coach.emptyTitle')} body={t('coach.empty')} />
      ) : (
        <View style={styles.thread}>
          {messages.map(m => (
            <View
              key={m.id}
              style={[
                styles.bubble,
                m.role === 'user'
                  ? { alignSelf: 'flex-end', backgroundColor: colors.accent }
                  : { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              {m.role === 'coach' ? <StructuredCoachText text={m.text} /> : (
                <Text style={[styles.bubbleText, { color: colors.accentText }]}>{m.text}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {followups.length > 0 && !sending ? (
        <SectionCard title={t('coach.followups')}>
          <View style={styles.promptGrid}>
            {followups.map(f => <PromptChip key={f} label={f} onPress={() => send(f)} />)}
          </View>
        </SectionCard>
      ) : null}

      <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('coach.disclaimer')}</Text>
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </Screen>
  );
}

function PromptChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.promptChip, { borderColor: colors.border, backgroundColor: colors.bgElev }, pressed && { opacity: 0.82 }]}>
      <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
      <Text style={[styles.promptText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function StructuredCoachText({ text }: { text: string }) {
  const { colors } = useTheme();
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const compact = lines.length ? lines : [text];
  return (
    <View style={styles.structured}>
      {compact.slice(0, 6).map((line, index) => (
        <Text key={`${line}-${index}`} style={[index === 0 ? styles.coachLead : styles.coachLine, { color: index === 0 ? colors.ink : colors.muted }]}>
          {line.replace(/^[-*]\s*/, '')}
        </Text>
      ))}
    </View>
  );
}

function readinessColor(band: 'low' | 'medium' | 'high' | undefined, colors: ReturnType<typeof useTheme>['colors']): string {
  if (band === 'high') return colors.accent;
  if (band === 'medium') return colors.orange;
  if (band === 'low') return colors.red;
  return colors.muted;
}

function coachIntensityLabel(intensity: string, locale: 'cs' | 'en'): string {
  if (intensity === 'rest') return locale === 'en' ? 'Rest' : 'Volno';
  if (intensity === 'easy') return locale === 'en' ? 'Easy' : 'Lehce';
  if (intensity === 'moderate') return locale === 'en' ? 'Steady' : 'Normálně';
  if (intensity === 'hard') return locale === 'en' ? 'Hard' : 'Tvrdě';
  return locale === 'en' ? 'Today' : 'Dnes';
}

const styles = StyleSheet.create({
  promptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promptChip: { minHeight: 42, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8 },
  promptText: { fontSize: 13, lineHeight: 17, fontWeight: '800' },
  thread: { gap: 10 },
  bubble: { maxWidth: '90%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  structured: { gap: 6 },
  coachLead: { fontSize: 15, lineHeight: 21, fontWeight: '900' },
  coachLine: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  composer: { gap: 10 },
  disclaimer: { fontSize: 12, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' },
});
