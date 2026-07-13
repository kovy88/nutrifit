import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import type { CoachScope, ExperienceLevel, Gender, UserProfile } from '../types';
import { resolveCoachScope, scopeHasNutrition, scopeHasTraining } from '../types';
import { activityFactorForSessions, DEFAULT_PROFILE, primaryGoalLabel, validateProfile } from '../utils/nutrition';
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft } from '../services/storage';
import { askOnboardingCoach } from '../services/api';
import { parseGoalText } from '../lib/onboarding/goal-parser';
import { applyGoalProfileToUserProfile } from '../lib/onboarding/goal-profile-adapter';
import {
  canCompleteChatOnboarding,
  type ChatOnboardingMissingField,
} from '../lib/onboarding/chatCompletion';
import {
  reduceOnboardingChatState,
  type OnboardingChatMessage,
  type OnboardingChatState,
} from '../lib/onboarding/chatState';
import type { OnboardingCoachReplyParsed } from '../lib/ai/schemas';
import type { Locale } from '../lib/i18n';
import type { OnboardingField, TouchedOnboardingFields } from '../lib/onboarding/validation';

const CHAT = {
  bg: '#050806',
  bg2: '#09100C',
  panel: '#101710',
  panel2: '#151D14',
  line: 'rgba(232, 241, 224, 0.12)',
  lineStrong: 'rgba(200, 242, 80, 0.32)',
  text: '#F4F7EF',
  muted: '#A2AD9B',
  faint: '#6E7868',
  accent: '#C8F250',
  accentSoft: 'rgba(200, 242, 80, 0.13)',
  blue: '#7CCBFF',
  blueSoft: 'rgba(124, 203, 255, 0.15)',
  danger: '#FF6B5E',
  composer: '#0B110D',
};

type QuickReply = {
  label: string;
  message?: string;
  patch?: Partial<UserProfile>;
  touched?: OnboardingField[];
};

export function OnboardingScreen() {
  const { setProfile } = useTrenr();
  const { locale } = useLanguage();
  const hydrated = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState<OnboardingChatState>(() => withDeterministicMissing({
    draft: emptyDraft(),
    touchedFields: {},
    messages: [introMessage(locale)],
    missingFields: [],
    confidence: 'low',
  }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadOnboardingDraft();
      if (cancelled) return;
      if (!stored) {
        hydrated.current = true;
        return;
      }

      const ageMs = Date.now() - new Date(stored.updatedAt).getTime();
      if (ageMs > 24 * 3600 * 1000) {
        await clearOnboardingDraft();
        hydrated.current = true;
        return;
      }

      setChat(withDeterministicMissing({
        draft: stored.draft,
        touchedFields: stored.touchedFields ?? {},
        messages: stored.messages?.length ? stored.messages : [resumeMessage(locale)],
        missingFields: stored.missingFields ?? [],
        confidence: stored.confidence ?? 'low',
      }));
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    if (!hydrated.current) return;
    void saveOnboardingDraft({
      step: 0,
      draft: chat.draft,
      touchedFields: chat.touchedFields,
      messages: chat.messages,
      missingFields: chat.missingFields,
      confidence: chat.confidence,
      updatedAt: new Date().toISOString(),
    });
  }, [chat]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [chat.messages.length, sending]);

  const completion = useMemo(
    () => canCompleteChatOnboarding(chat.draft, chat.touchedFields),
    [chat.draft, chat.touchedFields],
  );
  const scope = resolveCoachScope(chat.draft);
  const missing = completion.missing;
  const ready = completion.complete;
  const progress = ready ? 1 : progressFromMissing(missing, scope);
  const summaryItems = profileSummary(chat.draft, chat.touchedFields, locale);
  const firstMissing = missing[0];
  const inputFocus = firstMissing;
  const quickReplies = repliesFor(missing, scope, locale);
  const showBodyInputs = Boolean(firstMissing && isBodyField(firstMissing));

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const next = withDeterministicMissing(applyLocalGoalText(
      reduceOnboardingChatState(chat, { type: 'user_message', text }),
      text,
    ));
    setChat(next);

    try {
      const reply = await askOnboardingCoach({
        draft: next.draft,
        history: next.messages.map(({ role, text: messageText }) => ({ role, text: messageText })),
        userText: text,
        locale,
        missingFields: next.missingFields,
      });
      setChat(current => reduceCoachReplyWithFollowUp(current, reply, locale));
    } finally {
      setSending(false);
    }
  }

  function chooseReply(reply: QuickReply) {
    const patch = reply.patch;
    const touched = reply.touched;
    if (patch && touched) {
      applyManualAnswer(reply.message ?? reply.label, patch, touched);
      return;
    }
    void sendMessage(reply.message ?? reply.label);
  }

  function applyManualAnswer(text: string, patch: Partial<UserProfile>, touched: OnboardingField[]) {
    setChat(current => {
      const withUser = reduceOnboardingChatState(current, {
        type: 'user_message',
        text,
      });
      const patched = reduceOnboardingChatState(withUser, {
        type: 'manual_patch',
        patch: normalizeManualPatch(patch),
        touched,
      });
      const synced = withDeterministicMissing(patched);
      return appendCoachMessage(synced, manualCoachReply(synced, patch, touched, locale));
    });
  }

  function patchSilently(patch: Partial<UserProfile>, touched: OnboardingField[]) {
    setChat(current => withDeterministicMissing(
      reduceOnboardingChatState(current, {
        type: 'manual_patch',
        patch: normalizeManualPatch(patch),
        touched,
      }),
    ));
  }

  function confirmCurrentAnswer(text: string, acknowledgement?: string) {
    setChat(current => {
      const withUser = reduceOnboardingChatState(current, { type: 'user_message', text });
      const synced = withDeterministicMissing(withUser);
      return appendCoachMessage(synced, mergeCoachText(acknowledgement ?? '', nextCoachNudge(synced, locale)));
    });
  }

  async function finish() {
    const checked = canCompleteChatOnboarding(chat.draft, chat.touchedFields);
    if (!checked.complete) {
      setChat(current => appendCoachMessage(
        withDeterministicMissing(current),
        missingPrompt(checked.missing[0], locale),
      ));
      return;
    }

    const finalProfile: UserProfile = {
      ...checked.profile,
      programStartISO: checked.profile.programStartISO || todayISO(),
    };
    const errors = validateProfile(finalProfile);
    if (errors.length) {
      Alert.alert(locale === 'en' ? 'Check your profile' : 'Zkontroluj profil', errors.join('\n'));
      return;
    }
    await setProfile(finalProfile);
    await clearOnboardingDraft();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Trenr</Text>
            <Text style={styles.title}>{locale === 'en' ? 'Coach setup' : 'Nastavení kouče'}</Text>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>{ready ? (locale === 'en' ? 'Ready' : 'Hotovo') : `${missing.length}`}</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {chat.messages.map(message => (
            <View key={message.id} style={[styles.bubbleRow, message.role === 'user' && styles.bubbleRowUser]}>
              <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.coachBubble]}>
                {message.role === 'coach' ? <Text style={styles.coachName}>Coach</Text> : null}
                <Text style={[styles.bubbleText, message.role === 'user' && styles.userBubbleText]}>{message.text}</Text>
              </View>
            </View>
          ))}
          {sending ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.bubble, styles.coachBubble, styles.typingBubble]}>
                <Text style={styles.typingText}>{locale === 'en' ? 'Reading your answer...' : 'Čtu tvoji odpověď...'}</Text>
              </View>
            </View>
          ) : null}

          {summaryItems.length ? (
            <View style={styles.summaryPanel}>
              <Text style={styles.panelTitle}>{locale === 'en' ? 'So far' : 'Zatím mám'}</Text>
              <View style={styles.summaryGrid}>
                {summaryItems.map(item => (
                  <View key={item.label} style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>{item.label}</Text>
                    <Text style={styles.summaryValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottom}>
          {ready ? (
            <View style={styles.readyPanel}>
              <Text style={styles.readyTitle}>{locale === 'en' ? 'I have enough to build your plan.' : 'Mám dost informací pro první plán.'}</Text>
              <Text style={styles.readyText}>{locale === 'en' ? 'You can fine-tune details later in Profile.' : 'Detaily můžeš doladit později v profilu.'}</Text>
              <Pressable style={({ pressed }) => [styles.finishButton, pressed && styles.pressed]} onPress={finish}>
                <Text style={styles.finishText}>{locale === 'en' ? 'Start Trenr' : 'Spustit Trenr'}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.questionPanel}>
                <Text style={styles.questionKicker}>{locale === 'en' ? 'Coach asks' : 'Kouč se ptá'}</Text>
                <Text style={styles.questionText}>{missingPrompt(firstMissing, locale)}</Text>
                <Text style={styles.missingText}>{missingLine(missing, locale)}</Text>
              </View>
              <View style={styles.quickRow}>
                {quickReplies.map(reply => (
                  <Pressable
                    key={reply.label}
                    style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
                    onPress={() => chooseReply(reply)}
                  >
                    <Text style={styles.quickText}>{reply.label}</Text>
                  </Pressable>
                ))}
              </View>
              {showBodyInputs ? <BodyInputs chat={chat} locale={locale} onPatch={patchSilently} onConfirm={confirmCurrentAnswer} /> : null}
              {firstMissing === 'raceDateISO' ? (
                <View style={styles.inlinePanel}>
                  <Text style={styles.panelTitle}>{locale === 'en' ? 'Race date' : 'Datum závodu'}</Text>
                  <DateTimePicker
                    value={dateFromISO(chat.draft.raceDateISO)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'compact' : 'default'}
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      if (date) {
                        const iso = todayISO(date);
                        applyManualAnswer(raceDateAnswer(iso, locale), { raceDateISO: iso }, ['raceDateISO']);
                      }
                    }}
                  />
                </View>
              ) : null}
            </>
          )}

          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={placeholderFor(inputFocus, locale)}
              placeholderTextColor={CHAT.faint}
              style={styles.input}
              multiline
              maxLength={240}
              selectionColor={CHAT.accent}
              editable={!sending}
              onSubmitEditing={() => { if (Platform.OS !== 'ios') void sendMessage(input); }}
            />
            <Pressable
              style={({ pressed }) => [styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled, pressed && styles.pressed]}
              onPress={() => void sendMessage(input)}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.sendText}>{locale === 'en' ? 'Send' : 'Poslat'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BodyInputs({ chat, locale, onPatch, onConfirm }: {
  chat: OnboardingChatState;
  locale: Locale;
  onPatch: (patch: Partial<UserProfile>, touched: OnboardingField[]) => void;
  onConfirm: (text: string, acknowledgement?: string) => void;
}) {
  const bodyReady = bodyBasicsReady(chat.draft, chat.touchedFields);
  return (
    <View style={styles.inlinePanel}>
      <Text style={styles.panelTitle}>{locale === 'en' ? 'Body basics' : 'Základ těla'}</Text>
      <View style={styles.quickRow}>
        {([
          ['muz', locale === 'en' ? 'Man' : 'Muž'],
          ['zena', locale === 'en' ? 'Woman' : 'Žena'],
        ] as Array<[Gender, string]>).map(([value, label]) => (
          <Pressable
            key={value}
            style={({ pressed }) => [
              styles.quickChip,
              chat.draft.gender === value && chat.touchedFields.gender && styles.quickChipSelected,
              pressed && styles.pressed,
            ]}
            onPress={() => onPatch({ gender: value }, ['gender'])}
          >
            <Text style={[styles.quickText, chat.draft.gender === value && chat.touchedFields.gender && styles.quickTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.numberGrid}>
        <NumberInput label={locale === 'en' ? 'Age' : 'Věk'} value={chat.draft.age} onChange={value => onPatch({ age: value }, ['age'])} />
        <NumberInput label="cm" value={chat.draft.height} onChange={value => onPatch({ height: value }, ['height'])} />
        <NumberInput label="kg" value={chat.draft.weight} onChange={value => onPatch({ weight: value }, ['weight'])} decimal />
      </View>
      <Pressable
        disabled={!bodyReady}
        style={({ pressed }) => [styles.confirmMiniButton, !bodyReady && styles.sendButtonDisabled, pressed && bodyReady && styles.pressed]}
        onPress={() => onConfirm(bodyBasicsAnswer(chat.draft, locale), bodyBasicsAck(locale))}
      >
        <Text style={styles.confirmMiniText}>{locale === 'en' ? 'Confirm basics' : 'Potvrdit údaje'}</Text>
      </Pressable>
    </View>
  );
}

function NumberInput({ label, value, onChange, decimal }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  decimal?: boolean;
}) {
  return (
    <View style={styles.numberBox}>
      <Text style={styles.numberLabel}>{label}</Text>
      <TextInput
        value={value ? String(value) : ''}
        onChangeText={text => {
          const normalized = text.replace(',', '.').replace(/[^0-9.]/g, '');
          const next = decimal ? Number(normalized) : Math.round(Number(normalized));
          onChange(Number.isFinite(next) ? next : 0);
        }}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="0"
        placeholderTextColor={CHAT.faint}
        selectionColor={CHAT.accent}
        style={styles.numberInput}
      />
    </View>
  );
}

function bodyBasicsReady(draft: UserProfile, touched: TouchedOnboardingFields): boolean {
  return Boolean(
    touched.gender &&
    touched.age &&
    touched.height &&
    touched.weight &&
    draft.age >= 16 &&
    draft.age <= 100 &&
    draft.height >= 100 &&
    draft.height <= 250 &&
    draft.weight >= 30 &&
    draft.weight <= 300,
  );
}

function bodyBasicsAnswer(draft: UserProfile, locale: Locale): string {
  const gender = draft.gender === 'zena'
    ? (locale === 'en' ? 'woman' : 'žena')
    : (locale === 'en' ? 'man' : 'muž');
  return locale === 'en'
    ? `${gender}, ${draft.age} years, ${draft.height} cm, ${draft.weight} kg.`
    : `${gender}, ${draft.age} let, ${draft.height} cm, ${draft.weight} kg.`;
}

function bodyBasicsAck(locale: Locale): string {
  return locale === 'en'
    ? 'Thanks, that is enough for safe nutrition targets.'
    : 'Díky, to stačí pro bezpečné nutriční cíle.';
}

function raceDateAnswer(iso: string, locale: Locale): string {
  return locale === 'en' ? `The race is on ${iso}.` : `Závod je ${iso}.`;
}

function emptyDraft(): UserProfile {
  return { ...DEFAULT_PROFILE, age: 0, height: 0, weight: 0 };
}

function introMessage(locale: Locale): OnboardingChatMessage {
  return {
    id: `intro-${locale}`,
    role: 'coach',
    text: locale === 'en'
      ? "Hey, I'm Trenr. I will ask a few quick questions and build your first plan. First: do you want help with food, training, or both?"
      : 'Ahoj, jsem Trenr. Položím pár rychlých otázek a složím ti první plán. Nejdřív: chceš řešit jídlo, trénink, nebo obojí?',
    createdAt: new Date().toISOString(),
  };
}

function resumeMessage(locale: Locale): OnboardingChatMessage {
  return {
    id: `resume-${locale}-${Date.now()}`,
    role: 'coach',
    text: locale === 'en'
      ? 'We can continue where you left off. I saved what you already told me and will ask only for what is still missing.'
      : 'Můžeme pokračovat tam, kde jsi skončil. Co už jsi mi řekl, mám uložené a doptám se jen na to, co ještě chybí.',
    createdAt: new Date().toISOString(),
  };
}

function withDeterministicMissing(state: OnboardingChatState): OnboardingChatState {
  const completion = canCompleteChatOnboarding(state.draft, state.touchedFields);
  return {
    ...state,
    missingFields: completion.missing,
  };
}

function reduceCoachReplyWithFollowUp(
  state: OnboardingChatState,
  reply: OnboardingCoachReplyParsed,
  locale: Locale,
): OnboardingChatState {
  const reduced = reduceOnboardingChatState(state, { type: 'coach_reply', reply });
  const synced = withDeterministicMissing(reduced);
  return replaceLastCoachMessage(synced, mergeCoachText(reply.reply, nextCoachNudge(synced, locale)));
}

function replaceLastCoachMessage(state: OnboardingChatState, text: string): OnboardingChatState {
  const index = [...state.messages].reverse().findIndex(message => message.role === 'coach');
  if (index < 0) return appendCoachMessage(state, text);
  const actualIndex = state.messages.length - 1 - index;
  const messages = state.messages.map((message, messageIndex) => (
    messageIndex === actualIndex ? { ...message, text } : message
  ));
  return { ...state, messages };
}

function applyLocalGoalText(state: OnboardingChatState, text: string): OnboardingChatState {
  const parsed = parseGoalText(text);
  if (!parsed.goalProfile) return state;

  const draft = applyGoalProfileToUserProfile(state.draft, parsed.goalProfile);
  const touched: TouchedOnboardingFields = {
    ...state.touchedFields,
    goalProfile: true,
    primaryGoal: true,
    trainingGoal: true,
    nutritionMode: true,
    planIntensity: true,
  };
  if (parsed.goalProfile.raceDateISO) touched.raceDateISO = true;
  if (parsed.goalProfile.availableTrainingDays) touched.sessionsPerWeek = true;
  if (parsed.goalProfile.currentWeightKg) touched.weight = true;

  return { ...state, draft, touchedFields: touched };
}

function appendCoachMessage(state: OnboardingChatState, text: string): OnboardingChatState {
  if (!text) return state;
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        id: `coach-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: 'coach',
        text,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function mergeCoachText(base: string, followUp: string): string {
  const cleanBase = base.trim();
  const cleanFollowUp = followUp.trim();
  if (!cleanBase) return cleanFollowUp;
  if (!cleanFollowUp) return cleanBase;
  if (cleanBase.includes(cleanFollowUp)) return cleanBase;
  return `${cleanBase}\n\n${cleanFollowUp}`;
}

function normalizeManualPatch(patch: Partial<UserProfile>): Partial<UserProfile> {
  if (patch.sessionsPerWeek == null) return patch;
  const sessions = Math.max(1, Math.min(7, Math.round(patch.sessionsPerWeek)));
  return {
    ...patch,
    sessionsPerWeek: sessions,
    activityFactor: activityFactorForSessions(sessions),
  };
}

function manualCoachReply(
  state: OnboardingChatState,
  patch: Partial<UserProfile>,
  touched: OnboardingField[],
  locale: Locale,
): string {
  return mergeCoachText(manualAcknowledgement(state, patch, touched, locale), nextCoachNudge(state, locale));
}

function manualAcknowledgement(
  state: OnboardingChatState,
  patch: Partial<UserProfile>,
  touched: OnboardingField[],
  locale: Locale,
): string {
  const en = locale === 'en';
  if (touched.includes('coachScope')) {
    return en
      ? `Good. I will set this up for ${scopeLabel(resolveCoachScope(state.draft), locale).toLowerCase()}.`
      : `Dobře. Nastavím to na ${scopeLabel(resolveCoachScope(state.draft), locale).toLowerCase()}.`;
  }
  if (touched.includes('sessionsPerWeek')) {
    return en
      ? `Got it: ${state.draft.sessionsPerWeek} training days per week.`
      : `Beru: ${state.draft.sessionsPerWeek} tréninky týdně.`;
  }
  if (touched.includes('experience')) {
    return en
      ? `Perfect, I will adapt the start to your ${experienceLabel(state.draft.experience, locale).toLowerCase()} level.`
      : `Jasně, start přizpůsobím úrovni ${experienceLabel(state.draft.experience, locale).toLowerCase()}.`;
  }
  if (touched.includes('raceDateISO') && patch.raceDateISO) {
    return en ? `Race date saved: ${patch.raceDateISO}.` : `Datum závodu mám: ${patch.raceDateISO}.`;
  }
  return en ? 'Got it.' : 'Beru.';
}

function repliesFor(missing: ChatOnboardingMissingField[], scope: CoachScope, locale: Locale): QuickReply[] {
  const first = missing[0];
  if (!first || isBodyField(first) || first === 'raceDateISO') return [];
  if (first === 'coachScope') {
    return [
      { label: locale === 'en' ? 'Food + training' : 'Jídlo + trénink', patch: { coachScope: 'both' }, touched: ['coachScope'] },
      { label: locale === 'en' ? 'Training only' : 'Jen trénink', patch: { coachScope: 'training' }, touched: ['coachScope'] },
      { label: locale === 'en' ? 'Food only' : 'Jen jídlo', patch: { coachScope: 'nutrition' }, touched: ['coachScope'] },
    ];
  }
  if (first === 'goal') {
    const goalReplies: QuickReply[] = [
      { label: locale === 'en' ? 'Lose fat' : 'Chci zhubnout', message: locale === 'en' ? 'I want to lose fat.' : 'Chci zhubnout tuk.' },
      { label: locale === 'en' ? 'Run 10 km' : 'Uběhnout 10 km', message: locale === 'en' ? 'I want to run 10 km.' : 'Chci uběhnout 10 km.' },
      { label: locale === 'en' ? 'Build muscle' : 'Nabrat svaly', message: locale === 'en' ? 'I want to build muscle.' : 'Chci nabrat svaly.' },
      { label: locale === 'en' ? 'Better fitness' : 'Lepší kondice', message: locale === 'en' ? 'I want better fitness.' : 'Chci lepší kondici.' },
    ];
    if (scope === 'training') return goalReplies.filter(reply => !reply.label.toLowerCase().includes(locale === 'en' ? 'lose' : 'zhub'));
    if (scope === 'nutrition') return goalReplies.filter(reply => !reply.label.includes('10'));
    return goalReplies;
  }
  if (first === 'sessionsPerWeek') {
    return [2, 3, 4, 5].map(count => ({
      label: `${count}x ${locale === 'en' ? 'week' : 'týdně'}`,
      patch: { sessionsPerWeek: count },
      touched: ['sessionsPerWeek'],
    }));
  }
  if (first === 'experience') {
    return ([
      ['beginner', locale === 'en' ? 'Starting' : 'Začínám'],
      ['intermediate', locale === 'en' ? 'Some base' : 'Něco mám'],
      ['advanced', locale === 'en' ? 'Advanced' : 'Pokročilý'],
    ] as Array<[ExperienceLevel, string]>).map(([value, label]) => ({
      label,
      patch: { experience: value },
      touched: ['experience'],
    }));
  }
  return [];
}

function nextCoachNudge(state: OnboardingChatState, locale: Locale): string {
  const completion = canCompleteChatOnboarding(state.draft, state.touchedFields);
  if (completion.complete) {
    return locale === 'en'
      ? 'Perfect. I have enough for your first plan.'
      : 'Perfektní. Mám dost informací pro první plán.';
  }
  return missingPrompt(completion.missing[0], locale);
}

function missingPrompt(field: ChatOnboardingMissingField | undefined, locale: Locale): string {
  if (!field) return '';
  const en = locale === 'en';
  switch (field) {
    case 'coachScope': return en ? 'Do you want food, training, or both?' : 'Chceš řešit jídlo, trénink, nebo obojí?';
    case 'goal': return en ? 'What is the main outcome you want?' : 'Jaký je hlavní výsledek, který chceš?';
    case 'sessionsPerWeek': return en ? 'How many training days per week feel realistic?' : 'Kolik tréninkových dnů týdně je pro tebe reálných?';
    case 'experience': return en ? 'What is your current training level?' : 'Jaká je tvoje aktuální tréninková úroveň?';
    case 'raceDateISO': return en ? 'Pick the race date so I can pace the plan safely.' : 'Vyber datum závodu, ať plán nastavím bezpečně.';
    case 'gender':
    case 'age':
    case 'height':
    case 'weight':
      return en ? 'For nutrition I need basic body metrics.' : 'Pro jídelníček potřebuji základní tělesné údaje.';
  }
}

function missingLine(missing: ChatOnboardingMissingField[], locale: Locale): string {
  if (!missing.length) return '';
  const labels = missing.slice(0, 3).map(field => missingLabel(field, locale)).join(', ');
  return locale === 'en' ? `Still needed: ${labels}` : `Ještě potřebuji: ${labels}`;
}

function missingLabel(field: ChatOnboardingMissingField, locale: Locale): string {
  const en = locale === 'en';
  switch (field) {
    case 'coachScope': return en ? 'focus' : 'zaměření';
    case 'goal': return en ? 'goal' : 'cíl';
    case 'sessionsPerWeek': return en ? 'training days' : 'tréninkové dny';
    case 'experience': return en ? 'level' : 'úroveň';
    case 'raceDateISO': return en ? 'race date' : 'datum závodu';
    case 'gender': return en ? 'gender' : 'pohlaví';
    case 'age': return en ? 'age' : 'věk';
    case 'height': return en ? 'height' : 'výška';
    case 'weight': return en ? 'weight' : 'váha';
  }
}

function placeholderFor(field: ChatOnboardingMissingField | undefined, locale: Locale): string {
  const en = locale === 'en';
  switch (field) {
    case 'goal': return en ? 'e.g. I want to run 10 km...' : 'např. chci uběhnout 10 km...';
    case 'coachScope': return en ? 'food, training, or both...' : 'jídlo, trénink, nebo obojí...';
    case 'sessionsPerWeek': return en ? 'e.g. 3 days per week...' : 'např. 3 dny týdně...';
    case 'experience': return en ? 'beginner, intermediate...' : 'začátečník, pokročilý...';
    case 'raceDateISO': return en ? 'e.g. race is on 2026-09-20...' : 'např. závod je 2026-09-20...';
    default: return en ? 'Type anything useful...' : 'Napiš cokoliv užitečného...';
  }
}

function profileSummary(draft: UserProfile, touched: TouchedOnboardingFields, locale: Locale): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  const scope = resolveCoachScope(draft);
  if (touched.coachScope) {
    items.push({ label: locale === 'en' ? 'Focus' : 'Zaměření', value: scopeLabel(scope, locale) });
  }
  if (touched.goalProfile || touched.primaryGoal || touched.trainingGoal) {
    items.push({ label: locale === 'en' ? 'Goal' : 'Cíl', value: primaryGoalLabel(draft.primaryGoal, locale) });
  }
  if (scopeHasTraining(scope) && touched.sessionsPerWeek) {
    items.push({ label: locale === 'en' ? 'Training' : 'Trénink', value: `${draft.sessionsPerWeek}x / ${locale === 'en' ? 'week' : 'týden'}` });
  }
  if (scopeHasTraining(scope) && touched.experience) {
    items.push({ label: locale === 'en' ? 'Level' : 'Úroveň', value: experienceLabel(draft.experience, locale) });
  }
  if (scopeHasNutrition(scope) && touched.age && touched.height && touched.weight) {
    items.push({ label: locale === 'en' ? 'Body' : 'Tělo', value: `${draft.age} / ${draft.height} cm / ${draft.weight} kg` });
  }
  return items;
}

function scopeLabel(scope: CoachScope, locale: Locale): string {
  if (locale === 'en') {
    if (scope === 'training') return 'Training';
    if (scope === 'nutrition') return 'Food';
    return 'Food + training';
  }
  if (scope === 'training') return 'Trénink';
  if (scope === 'nutrition') return 'Jídlo';
  return 'Jídlo + trénink';
}

function experienceLabel(level: ExperienceLevel, locale: Locale): string {
  if (locale === 'en') {
    if (level === 'advanced') return 'Advanced';
    if (level === 'intermediate') return 'Some base';
    return 'Starting';
  }
  if (level === 'advanced') return 'Pokročilý';
  if (level === 'intermediate') return 'Něco mám';
  return 'Začínám';
}

function progressFromMissing(missing: ChatOnboardingMissingField[], scope: CoachScope): number {
  const total = scope === 'training' ? 5 : scope === 'nutrition' ? 6 : 8;
  return Math.max(0.08, Math.min(0.92, (total - missing.length) / total));
}

function isBodyField(field: ChatOnboardingMissingField): boolean {
  return field === 'gender' || field === 'age' || field === 'height' || field === 'weight';
}

function dateFromISO(value?: string): Date {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function todayISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CHAT.bg,
  },
  keyboard: {
    flex: 1,
    backgroundColor: CHAT.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT.line,
  },
  eyebrow: {
    color: CHAT.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  title: {
    color: CHAT.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2,
  },
  progressBadge: {
    minWidth: 58,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT.panel,
    borderWidth: 1,
    borderColor: CHAT.line,
  },
  progressText: {
    color: CHAT.text,
    fontSize: 13,
    fontWeight: '800',
  },
  progressTrack: {
    height: 3,
    backgroundColor: CHAT.panel,
  },
  progressFill: {
    height: 3,
    backgroundColor: CHAT.accent,
  },
  messages: {
    flex: 1,
    backgroundColor: CHAT.bg2,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 22,
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  coachBubble: {
    backgroundColor: CHAT.panel,
    borderWidth: 1,
    borderColor: CHAT.line,
    borderBottomLeftRadius: 6,
  },
  userBubble: {
    backgroundColor: CHAT.accent,
    borderBottomRightRadius: 6,
  },
  typingBubble: {
    paddingVertical: 10,
  },
  coachName: {
    color: CHAT.accent,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0,
  },
  bubbleText: {
    color: CHAT.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  userBubbleText: {
    color: '#071008',
  },
  typingText: {
    color: CHAT.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  summaryPanel: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: CHAT.panel,
    borderWidth: 1,
    borderColor: CHAT.line,
  },
  panelTitle: {
    color: CHAT.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryItem: {
    minWidth: '47%',
    flexGrow: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: CHAT.panel2,
    borderWidth: 1,
    borderColor: CHAT.line,
  },
  summaryLabel: {
    color: CHAT.faint,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryValue: {
    color: CHAT.text,
    fontSize: 14,
    fontWeight: '800',
  },
  bottom: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 10 : 14,
    backgroundColor: CHAT.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT.line,
  },
  missingText: {
    color: CHAT.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  questionPanel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: CHAT.panel,
    borderWidth: 1,
    borderColor: CHAT.line,
    marginBottom: 10,
  },
  questionKicker: {
    color: CHAT.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 4,
  },
  questionText: {
    color: CHAT.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  quickChip: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT.panel,
    borderWidth: 1,
    borderColor: CHAT.line,
  },
  quickChipSelected: {
    backgroundColor: CHAT.accentSoft,
    borderColor: CHAT.lineStrong,
  },
  quickText: {
    color: CHAT.text,
    fontSize: 14,
    fontWeight: '800',
  },
  quickTextSelected: {
    color: CHAT.accent,
  },
  inlinePanel: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: CHAT.panel,
    borderWidth: 1,
    borderColor: CHAT.line,
    marginBottom: 10,
  },
  numberGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  numberBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: CHAT.composer,
    borderWidth: 1,
    borderColor: CHAT.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  numberLabel: {
    color: CHAT.faint,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  numberInput: {
    color: CHAT.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    padding: 0,
    minHeight: 30,
  },
  confirmMiniButton: {
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT.accent,
    marginTop: 10,
  },
  confirmMiniText: {
    color: '#071008',
    fontSize: 14,
    fontWeight: '900',
  },
  readyPanel: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: CHAT.accentSoft,
    borderWidth: 1,
    borderColor: CHAT.lineStrong,
    marginBottom: 10,
  },
  readyTitle: {
    color: CHAT.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  readyText: {
    color: CHAT.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  finishButton: {
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT.accent,
  },
  finishText: {
    color: '#071008',
    fontSize: 16,
    fontWeight: '900',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 8,
    borderRadius: 24,
    backgroundColor: CHAT.composer,
    borderWidth: 1,
    borderColor: CHAT.line,
  },
  input: {
    flex: 1,
    maxHeight: 104,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: CHAT.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  sendButton: {
    minWidth: 72,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT.accent,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: '#071008',
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.75,
  },
});
