import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useTrenr } from '../context/TrenrContext';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { useCoachThread } from '../hooks/useCoachThread';
import { askCoach } from '../services/api';
import type { CoachChatContext } from '../lib/ai/coachChat';
import type { CoachMessage } from '../types/coach';

function uid(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Coach tab — chat nad DNEŠNÍM deterministickým doporučením. AI jen vysvětluje
// a radí; čísla (makra/readiness/objem) nevymýšlí. Fallback v askCoach zajistí,
// že uživatel vždy dostane bezpečnou odpověď i při výpadku.
export function CoachScreen() {
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const { profile, selectedDate, ensureAiConsent } = useTrenr();
  const { recommendation } = useDailyCoachRecommendation(new Date(selectedDate));
  const threadMemory = useMemo(() => ({
    goalSummary: profile ? `${profile.primaryGoal} + ${profile.trainingGoal}` : 'general_fitness',
    updatedAt: new Date().toISOString(),
  }), [profile?.primaryGoal, profile?.trainingGoal]);
  const { messages, persist } = useCoachThread(selectedDate, threadMemory);
  const [followups, setFollowups] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
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
      };
      const res = await askCoach({ context, history: prior, question: q, locale });
      await persist([
        ...prior,
        userMsg,
        { id: uid(), role: 'coach', text: res.reply, createdAt: new Date().toISOString() },
      ], threadMemory);
      setFollowups(res.followups || []);
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('common.tryAgain'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <H1>{t('coach.title')}</H1>
      <Subtitle>{t('coach.subtitle')}</Subtitle>

      <Button variant="secondary" onPress={() => send(t('coach.whyQuestion'))}>{t('coach.why')}</Button>

      {messages.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.muted }]}>{t('coach.empty')}</Text>
        </Card>
      ) : (
        <View style={styles.thread}>
          {messages.map(m => (
            <View
              key={m.id}
              style={[
                styles.bubble,
                m.role === 'user'
                  ? { alignSelf: 'flex-end', backgroundColor: colors.green }
                  : { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.bubbleText, { color: m.role === 'user' ? '#fff' : colors.ink }]}>{m.text}</Text>
            </View>
          ))}
        </View>
      )}

      {sending && <Text style={[styles.thinking, { color: colors.muted }]}>{t('coach.thinking')}</Text>}

      {followups.length > 0 && !sending && (
        <View style={styles.followups}>
          {followups.map((f, i) => (
            <Text
              key={`f-${i}`}
              style={[styles.followupChip, { color: colors.green, borderColor: colors.border }]}
              onPress={() => send(f)}
            >
              {f}
            </Text>
          ))}
        </View>
      )}

      <Card>
        <Field value={input} onChangeText={setInput} placeholder={t('coach.inputPlaceholder')} multiline />
        <Button disabled={sending || !input.trim()} onPress={() => send(input)}>{t('coach.send')}</Button>
      </Card>

      <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('coach.disclaimer')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  thread: { gap: 10 },
  bubble: { maxWidth: '88%', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  thinking: { fontSize: 13, fontStyle: 'italic' },
  followups: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  followupChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '700', overflow: 'hidden' },
  disclaimer: { fontSize: 12, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' },
});
