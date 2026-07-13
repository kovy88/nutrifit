import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
    return coachPromptLabels(isCustomSport, locale);
  }, [isCustomSport, locale]);

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
      <ScreenHeader eyebrow={t('tab.coach')} title={coachScreenTitle(locale)} subtitle={coachScreenSubtitle(locale)} />

      <HeroDecisionCard
        eyebrow={coachHeroEyebrow(locale)}
        title={recommendation ? coachHeroTitle(recommendation, locale) : t('coach.title')}
        body={recommendation ? coachHeroBody(recommendation, locale) : t('coach.todayContextEmpty')}
        accent={readinessColor(recommendation?.readiness.band, colors)}
        statusLabel={recommendation ? coachStatusLabel(recommendation, locale) : undefined}
        statusTone={recommendation?.readiness.band === 'low' ? 'risk' : recommendation?.readiness.band === 'medium' ? 'caution' : 'ready'}
      />

      <SectionCard
        title={t('coach.suggestedTitle')}
        body={coachQuestionsBody(locale)}
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
      ) : null}

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

function coachScreenSubtitle(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Get a short explanation of the plan, food, or adjustment.'
    : 'Dostaň krátké vysvětlení plánu, jídla nebo úpravy.';
}

function coachScreenTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Ask about today' : 'Zeptej se na dnešek';
}

function coachHeroEyebrow(locale: 'cs' | 'en'): string {
  return locale === 'en' ? "Today's question" : 'Dnešní otázka';
}

function coachPromptLabels(isCustomSport: boolean, locale: 'cs' | 'en'): string[] {
  if (isCustomSport) {
    return locale === 'en'
      ? ['Why this plan today?', 'What if I slept badly?', 'How should I prep for the match?']
      : ['Proč dnes tenhle plán?', 'Co když jsem špatně spal/a?', 'Jak se připravit na zápas?'];
  }
  return locale === 'en'
    ? ['Why this plan today?', 'How should I fuel today?', 'What if I slept badly?']
    : ['Proč dnes tenhle plán?', 'Jak dnes načasovat jídlo?', 'Co když jsem špatně spal/a?'];
}

function coachHeroTitle(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string {
  const session = rec.training?.session;
  if (!session || session.kind === 'rest' || rec.readiness.recommendedIntensity === 'rest') {
    return locale === 'en' ? 'Keep today light' : 'Dnes to drž lehce';
  }
  if (rec.training?.adjusted || rec.readiness.band === 'low' || isEasySessionTitle(session.title)) {
    return locale === 'en' ? 'Easy plan is enough' : 'Lehký plán stačí';
  }
  if (rec.readiness.recommendedIntensity === 'hard' && rec.readiness.band === 'high') {
    return locale === 'en' ? 'Green light today' : 'Dnes máš zelenou';
  }
  return locale === 'en' ? "Stay with today's plan" : 'Drž dnešní plán';
}

function coachStatusLabel(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string {
  const session = rec.training?.session;
  if (!session || session.kind === 'rest' || rec.readiness.recommendedIntensity === 'rest') {
    return locale === 'en' ? 'Rest' : 'Volno';
  }
  if (rec.training?.adjusted || rec.readiness.band === 'low' || isEasySessionTitle(session.title)) {
    return locale === 'en' ? 'Easy today' : 'Lehce';
  }
  if (rec.readiness.recommendedIntensity === 'hard' && rec.readiness.band === 'high') {
    return locale === 'en' ? 'Green light' : 'Jdi na to';
  }
  return locale === 'en' ? 'Steady' : 'Normálně';
}

function coachHeroBody(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string {
  const session = rec.training?.session;
  if (!session || session.kind === 'rest' || rec.readiness.recommendedIntensity === 'rest') {
    return locale === 'en'
      ? 'I can explain what still counts today and what to leave for tomorrow.'
      : 'Vysvětlím, co se dnes počítá a co nechat na zítra.';
  }
  if (rec.readiness.recommendedIntensity === 'hard') {
    return locale === 'en'
      ? 'Ask how to do the work well without adding extra.'
      : 'Zeptej se, jak to odtrénovat dobře bez přidávání navíc.';
  }
  return locale === 'en'
    ? 'Ask what matters most, how to fuel it, or how to adjust.'
    : 'Zeptej se, co je nejdůležitější, jak jíst, nebo jak den upravit.';
}

function coachQuestionsBody(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Start with one question.'
    : 'Začni jednou otázkou.';
}

function isEasySessionTitle(title: string): boolean {
  return /\b(easy|light|recovery|leh|regener|voln)\b/i.test(title);
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  promptList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promptChip: { flexBasis: '31%', flexGrow: 1, minWidth: 84, minHeight: 58, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 5, paddingVertical: 8 },
  promptText: { flexShrink: 1, fontSize: 12, lineHeight: 15, fontWeight: '600', textAlign: 'center' },
  thread: { gap: 10 },
  bubble: { maxWidth: '90%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
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
