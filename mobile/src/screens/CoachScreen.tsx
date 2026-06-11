import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Field, ScreenHeader } from '../components/UI';
import { HeroDecisionCard, SectionCard } from '../components/SimpleUX';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useTrenr } from '../context/TrenrContext';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { hasCustomSchedule, nextMatchInfo } from '../lib/training';
import { sportName } from '../lib/training/sports';
import { useCoachThread } from '../hooks/useCoachThread';
import { askCoach } from '../services/api';
import { incrementCoachTeaserUsed, loadCoachTeaserUsed } from '../services/storage';
import type { CoachChatContext } from '../lib/ai/coachChat';
import type { CoachMessage, DailyCoachRecommendation } from '../types/coach';
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
      ];
    }
    return [
      t('coach.promptWhy'),
      t('coach.promptFuel'),
      t('coach.promptBadSleep'),
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
      contentContainerStyle={styles.screen}
      footer={
        <View style={styles.composer}>
          <View style={styles.composerRow}>
            <Field
              value={input}
              onChangeText={setInput}
              placeholder={t('coach.inputPlaceholder')}
              multiline
              style={styles.composerField}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sending ? t('coach.thinking') : t('coach.send')}
              disabled={sending || !input.trim()}
              onPress={() => send(input)}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: colors.accent },
                (sending || !input.trim()) && styles.sendDisabled,
                pressed && input.trim() && !sending && { opacity: 0.86, transform: [{ scale: 0.97 }] },
              ]}
            >
              <Ionicons name={sending ? 'hourglass-outline' : 'send'} size={18} color={colors.accentText} />
            </Pressable>
          </View>
          <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('coach.disclaimer')}</Text>
        </View>
      }
    >
      <ScreenHeader eyebrow={t('tab.coach')} title={t('coach.title')} subtitle={t('coach.subtitle')} />

      <HeroDecisionCard
        eyebrow={t('coach.todayContext')}
        title={recommendation?.headline ?? t('coach.title')}
        body={recommendation ? coachHeroBody(recommendation, locale) : t('coach.todayContextEmpty')}
        accent={readinessColor(recommendation?.readiness.band, colors)}
        statusLabel={recommendation ? coachIntensityLabel(recommendation.readiness.recommendedIntensity, locale) : undefined}
        statusTone={recommendation?.readiness.band === 'low' ? 'risk' : recommendation?.readiness.band === 'medium' ? 'caution' : 'ready'}
      />

      <SectionCard
        title={t('coach.suggestedTitle')}
        body={coachQuestionsBody(locale)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptGrid}>
          {prompts.map(prompt => (
            <PromptChip key={prompt} label={prompt} onPress={() => send(prompt)} />
          ))}
        </ScrollView>
      </SectionCard>

      {messages.length > 0 ? (
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
      ) : null}

      {followups.length > 0 && !sending ? (
        <SectionCard title={t('coach.followups')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptGrid}>
            {followups.slice(0, 3).map(f => <PromptChip key={f} label={f} onPress={() => send(f)} />)}
          </ScrollView>
        </SectionCard>
      ) : null}

      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </Screen>
  );
}

function PromptChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.promptChip, { borderColor: colors.border, backgroundColor: colors.bgElev }, pressed && { opacity: 0.82 }]}>
      <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.9} style={[styles.promptText, { color: colors.ink }]}>{label}</Text>
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

function coachHeroBody(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string {
  const session = rec.training?.session;
  if (!session || session.kind === 'rest' || rec.readiness.recommendedIntensity === 'rest') {
    return locale === 'en'
      ? 'Ask why today should stay easy, or what to do if you still want to move.'
      : 'Zeptej se, proč má být dnešek lehčí, nebo co dělat, když se chceš hýbat.';
  }
  if (rec.readiness.recommendedIntensity === 'hard') {
    return locale === 'en'
      ? 'Ask how to execute the planned work without adding unnecessary load.'
      : 'Zeptej se, jak odtrénovat plán bez zbytečného přidávání zátěže.';
  }
  return locale === 'en'
    ? 'Ask what matters most today and how to adjust if the day changes.'
    : 'Zeptej se, co je dnes nejdůležitější a jak upravit den, když se něco změní.';
}

function coachQuestionsBody(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Pick one question or type your own. The coach explains the plan; it does not invent new targets.'
    : 'Vyber otázku nebo napiš vlastní. Kouč vysvětluje plán, nevymýšlí nová cílová čísla.';
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 8 },
  promptGrid: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  promptChip: { minHeight: 46, maxWidth: 240, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8 },
  promptText: { flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  thread: { gap: 10 },
  bubble: { maxWidth: '90%', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  structured: { gap: 6 },
  coachLead: { fontSize: 15, lineHeight: 21, fontWeight: '900' },
  coachLine: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  composer: { gap: 6 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerField: { flex: 1, maxHeight: 92 },
  sendButton: { width: 50, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
  disclaimer: { fontSize: 12, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' },
});
