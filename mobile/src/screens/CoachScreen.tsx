import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Field, ScreenHeader } from '../components/UI';
import { HeroDecisionCard, SectionCard } from '../components/SimpleUX';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import type { Translate } from '../lib/i18n';
import { useTrenr } from '../context/TrenrContext';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { hasCustomSchedule, nextMatchInfo } from '../lib/training';
import { sportName } from '../lib/training/sports';
import { useCoachThread } from '../hooks/useCoachThread';
import { askCoach } from '../services/api';
import { incrementCoachTeaserUsed, loadCoachTeaserUsed } from '../services/storage';
import type { CoachChatContext } from '../lib/ai/coachChat';
import type { CoachMessage, DailyCoachRecommendation } from '../types/coach';
import { dayDecision } from '../lib/coaching/dayDecision';
import { PaywallModal } from '../components/PaywallModal';
import { getProfileGoalSummary } from '../lib/profile/profile-labels';

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
  const goalSummary = useMemo(() => (
    profile ? getProfileGoalSummary(profile, t) : t('trainingGoal.general_fitness')
  ), [profile, t]);
  const threadMemory = useMemo(() => ({
    goalSummary,
    updatedAt: new Date().toISOString(),
  }), [goalSummary]);
  const { messages, persist } = useCoachThread(selectedDate, threadMemory);
  const [followups, setFollowups] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Rychlé otázky podle režimu: sportovec (custom rytmus) řeší zápas/off-field,
  // ne „co jíst před během" / „je můj závod reálný".
  const isCustomSport = profile ? hasCustomSchedule(profile) : false;
  const prompts = useMemo(() => {
    return coachPromptLabels(isCustomSport, t);
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
        goalSummary,
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
              maxLength={2000}
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
      <ScreenHeader eyebrow={t('tab.coach')} title={coachScreenTitle(t)} subtitle={coachScreenSubtitle(t)} />

      <HeroDecisionCard
        eyebrow={coachHeroEyebrow(t)}
        title={recommendation ? coachDecision(recommendation, t).title : t('coach.title')}
        body={recommendation ? coachHeroBody(recommendation, t) : t('coach.todayContextEmpty')}
        accent={readinessColor(recommendation?.readiness.band, colors)}
        statusLabel={recommendation ? coachDecision(recommendation, t).label : undefined}
        statusTone={recommendation?.readiness.band === 'low' ? 'risk' : recommendation?.readiness.band === 'medium' ? 'caution' : 'ready'}
      />

      <SectionCard
        title={t('coach.suggestedTitle')}
        body={coachQuestionsBody(t)}
      >
        <View style={styles.promptList}>
          {prompts.map(prompt => (
            <PromptChip key={prompt} label={prompt} onPress={() => send(prompt)} />
          ))}
        </View>
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
                  : { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              ]}
            >
              {m.role === 'coach' ? <StructuredCoachText text={m.text} /> : (
                <Text style={[styles.bubbleText, { color: colors.accentText }]}>{m.text}</Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.bgElev, borderColor: colors.hairline }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.faint} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.muted }]}>{coachEmptyTitle(t)}</Text>
          <Text style={[styles.emptyBody, { color: colors.faint }]}>{coachEmptyBody(t)}</Text>
        </View>
      )}

      {followups.length > 0 && !sending ? (
        <SectionCard title={t('coach.followups')}>
          <View style={styles.promptList}>
            {followups.slice(0, 3).map(f => <PromptChip key={f} label={f} onPress={() => send(f)} />)}
          </View>
        </SectionCard>
      ) : null}

      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </Screen>
  );
}

function PromptChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    // No icon: every chip carried the same sparkle, so it distinguished nothing
    // and cost the label horizontal space it was already being shrunk to fit.
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.promptChip, { borderColor: colors.hairline, backgroundColor: colors.bgElev }, pressed && { opacity: 0.82 }]}>
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

function coachScreenSubtitle(t: Translate): string {
  return t('coach.screenSubtitle');
}

function coachScreenTitle(t: Translate): string {
  return t('coach.screenTitle');
}

function coachHeroEyebrow(t: Translate): string {
  return t('coach.heroEyebrow');
}

function coachPromptLabels(isCustomSport: boolean, t: Translate): string[] {
  if (isCustomSport) {
    return [t('coach.qWhyPlan'), t('coach.qSleptBadly'), t('coach.qMatchPrep')];
  }
  return [t('coach.qWhyPlan'), t('coach.qFuelToday'), t('coach.qSleptBadly')];
}

function coachDecision(rec: DailyCoachRecommendation, t: Translate) {
  const session = rec.training?.session;
  return dayDecision(rec, !session || session.kind === 'rest', t);
}

function coachHeroBody(rec: DailyCoachRecommendation, t: Translate): string {
  const session = rec.training?.session;
  if (!session || session.kind === 'rest' || rec.readiness.recommendedIntensity === 'rest') {
    return t('coach.askCounts');
  }
  if (rec.readiness.recommendedIntensity === 'hard') return t('coach.askHowWell');
  return t('coach.askMatters');
}

function coachQuestionsBody(t: Translate): string {
  return t('coach.questionsBody');
}

function coachEmptyTitle(t: Translate): string {
  return t('coach.nothingAskedTitle');
}

function coachEmptyBody(t: Translate): string {
  return t('coach.nothingAskedBody');
}

const styles = StyleSheet.create({
  screen: { gap: 14, flexGrow: 1 },
  promptList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promptChip: { flexBasis: '31%', flexGrow: 1, minWidth: 84, minHeight: 58, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 5, paddingVertical: 8 },
  promptText: { flexShrink: 1, fontSize: 12, lineHeight: 15, fontWeight: '600', textAlign: 'center' },
  thread: { gap: 10 },
  emptyState: { flex: 1, minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody: { fontSize: 13, lineHeight: 18, fontWeight: '500', textAlign: 'center', maxWidth: 260 },
  bubble: { maxWidth: '90%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  structured: { gap: 6 },
  coachLead: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  coachLine: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  composer: { gap: 6 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerField: { flex: 1, maxHeight: 92 },
  sendButton: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
  disclaimer: { fontSize: 12, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' },
});
