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
import { darkColors } from '../constants/theme';
import type { Locale, Translate, TranslationKey } from '../lib/i18n';
import type { OnboardingField, TouchedOnboardingFields } from '../lib/onboarding/validation';

// Shared values come from the theme rather than being re-typed here: this object
// used to copy nine of the theme's hexes verbatim, so any palette change (an
// accessibility fix, say) silently skipped this screen. Only the chat-specific
// surfaces and tints below are local.
const CHAT = {
  bg: darkColors.bg,
  bg2: '#09100C',
  panel: darkColors.card,
  panel2: '#151D14',
  line: darkColors.border,
  lineStrong: 'rgba(200, 242, 80, 0.32)',
  text: darkColors.ink,
  muted: darkColors.muted,
  faint: darkColors.faint,
  accent: darkColors.accent,
  accentSoft: 'rgba(200, 242, 80, 0.13)',
  blue: darkColors.blue,
  blueSoft: 'rgba(124, 203, 255, 0.15)',
  danger: darkColors.red,
  composer: darkColors.bgElev,
};

type QuickReply = {
  label: string;
  message?: string;
  patch?: Partial<UserProfile>;
  touched?: OnboardingField[];
};

export function OnboardingScreen() {
  const { setProfile } = useTrenr();
  const { locale, t } = useLanguage();
  const hydrated = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState<OnboardingChatState>(() => withDeterministicMissing({
    draft: emptyDraft(),
    touchedFields: {},
    messages: [introMessage(locale, t)],
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
        messages: stored.messages?.length ? stored.messages : [resumeMessage(locale, t)],
        missingFields: stored.missingFields ?? [],
        confidence: stored.confidence ?? 'low',
      }));
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, [locale, t]);

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
  const summaryItems = profileSummary(chat.draft, chat.touchedFields, locale, t);
  const firstMissing = missing[0];
  const inputFocus = firstMissing;
  const quickReplies = repliesFor(missing, scope, t);
  const showBodyInputs = Boolean(firstMissing && isBodyField(firstMissing));

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const withUser = reduceOnboardingChatState(chat, { type: 'user_message', text });
    const localParsed = applyLocalGoalText(withUser, text);
    const next = withDeterministicMissing(localParsed);
    setChat(next);

    try {
      const reply = await askOnboardingCoach({
        draft: next.draft,
        history: next.messages.map(({ role, text: messageText }) => ({ role, text: messageText })),
        userText: text,
        locale,
        missingFields: next.missingFields,
      });
      // If the AI call failed but the local parser already understood the answer,
      // acknowledge it instead of claiming the message could not be read.
      const aiFailed = reply.confidence === 'low' && Object.keys(reply.extracted).length === 0;
      if (aiFailed && localParsed !== withUser) {
        setChat(current => appendCoachMessage(current, mergeCoachText(t('onbChat.ackGeneric'), nextCoachNudge(current, t))));
      } else {
        setChat(current => reduceCoachReplyWithFollowUp(current, reply, t));
      }
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
      return appendCoachMessage(synced, manualCoachReply(synced, patch, touched, t));
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
      return appendCoachMessage(synced, mergeCoachText(acknowledgement ?? '', nextCoachNudge(synced, t)));
    });
  }

  async function finish() {
    const checked = canCompleteChatOnboarding(chat.draft, chat.touchedFields);
    if (!checked.complete) {
      setChat(current => appendCoachMessage(
        withDeterministicMissing(current),
        missingPrompt(checked.missing[0], t),
      ));
      return;
    }

    const finalProfile: UserProfile = {
      ...checked.profile,
      programStartISO: checked.profile.programStartISO || todayISO(),
    };
    const errors = validateProfile(finalProfile);
    if (errors.length) {
      Alert.alert(t('onbChat.checkProfile'), errors.join('\n'));
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
            <Text style={styles.title}>{t('onbChat.title')}</Text>
          </View>
          <View
            style={styles.progressBadge}
            accessible
            accessibilityLabel={ready ? t('onbChat.ready') : t('onbChat.leftCount', { count: missing.length })}
          >
            <Text style={styles.progressText}>{ready ? t('onbChat.ready') : t('onbChat.leftCount', { count: missing.length })}</Text>
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
                <Text style={styles.typingText}>{t('onbChat.typing')}</Text>
              </View>
            </View>
          ) : null}

          {summaryItems.length ? (
            <View style={styles.summaryPanel}>
              <Text style={styles.panelTitle}>{t('onbChat.soFar')}</Text>
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
              <Text style={styles.readyTitle}>{t('onbChat.readyTitle')}</Text>
              <Text style={styles.readyText}>{t('onbChat.readyText')}</Text>
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.finishButton, pressed && styles.pressed]} onPress={finish}>
                <Text style={styles.finishText}>{t('onbChat.startTrenr')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.missingText}>{missingLine(missing, t)}</Text>
              <View style={styles.quickRow}>
                {quickReplies.map(reply => (
                  <Pressable
                    key={reply.label}
                    accessibilityRole="button"
                    accessibilityLabel={reply.label}
                    style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
                    onPress={() => chooseReply(reply)}
                  >
                    <Text style={styles.quickText}>{reply.label}</Text>
                  </Pressable>
                ))}
              </View>
              {showBodyInputs ? <BodyInputs chat={chat} t={t} onPatch={patchSilently} onConfirm={confirmCurrentAnswer} /> : null}
              {firstMissing === 'raceDateISO' ? (
                <View style={styles.inlinePanel}>
                  <Text style={styles.panelTitle}>{t('onbChat.raceDate')}</Text>
                  <DateTimePicker
                    value={dateFromISO(chat.draft.raceDateISO)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'compact' : 'default'}
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      if (date) {
                        const iso = todayISO(date);
                        applyManualAnswer(raceDateAnswer(iso, t), { raceDateISO: iso }, ['raceDateISO']);
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
              placeholder={placeholderFor(inputFocus, t)}
              placeholderTextColor={CHAT.faint}
              style={styles.input}
              multiline
              maxLength={240}
              selectionColor={CHAT.accent}
              editable={!sending}
              onSubmitEditing={() => { if (Platform.OS !== 'ios') void sendMessage(input); }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onbChat.send')}
              style={({ pressed }) => [styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled, pressed && styles.pressed]}
              onPress={() => void sendMessage(input)}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.sendText}>{t('onbChat.send')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BodyInputs({ chat, t, onPatch, onConfirm }: {
  chat: OnboardingChatState;
  t: Translate;
  onPatch: (patch: Partial<UserProfile>, touched: OnboardingField[]) => void;
  onConfirm: (text: string, acknowledgement?: string) => void;
}) {
  const bodyReady = bodyBasicsReady(chat.draft, chat.touchedFields);
  return (
    <View style={styles.inlinePanel}>
      <Text style={styles.panelTitle}>{t('onbChat.bodyBasics')}</Text>
      <View style={styles.quickRow}>
        {([
          ['muz', t('onbChat.man')],
          ['zena', t('onbChat.woman')],
        ] as Array<[Gender, string]>).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: chat.draft.gender === value && Boolean(chat.touchedFields.gender) }}
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
        <NumberInput label={t('onbChat.age')} value={chat.draft.age} onChange={value => onPatch({ age: value }, ['age'])} />
        <NumberInput label={t('onbChat.heightCm')} value={chat.draft.height} onChange={value => onPatch({ height: value }, ['height'])} />
        <NumberInput label={t('onbChat.weightKg')} value={chat.draft.weight} onChange={value => onPatch({ weight: value }, ['weight'])} decimal />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !bodyReady }}
        disabled={!bodyReady}
        style={({ pressed }) => [styles.confirmMiniButton, !bodyReady && styles.sendButtonDisabled, pressed && bodyReady && styles.pressed]}
        onPress={() => onConfirm(bodyBasicsAnswer(chat.draft, t), bodyBasicsAck(t))}
      >
        <Text style={styles.confirmMiniText}>{t('onbChat.confirmBasics')}</Text>
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
  // Keep the raw text locally so partial decimals like "75." survive re-renders.
  const [text, setText] = useState(value ? String(value) : '');
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (Number(text.replace(',', '.')) !== value) setText(value ? String(value) : '');
  }
  return (
    <View style={styles.numberBox}>
      <Text style={styles.numberLabel}>{label}</Text>
      <TextInput
        value={text}
        accessibilityLabel={label}
        onChangeText={raw => {
          const normalized = raw.replace(',', '.').replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
          setText(normalized);
          const next = decimal ? Number(normalized) : Math.round(Number(normalized));
          onChange(Number.isFinite(next) ? next : 0);
        }}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="–"
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

function bodyBasicsAnswer(draft: UserProfile, t: Translate): string {
  const gender = t(draft.gender === 'zena' ? 'onbChat.genderWoman' : 'onbChat.genderMan');
  return t('onbChat.bodyAnswer', { gender, age: draft.age, height: draft.height, weight: draft.weight });
}

function bodyBasicsAck(t: Translate): string {
  return t('onbChat.bodyAck');
}

function raceDateAnswer(iso: string, t: Translate): string {
  return t('onbChat.raceAnswer', { iso });
}

function emptyDraft(): UserProfile {
  return { ...DEFAULT_PROFILE, age: 0, height: 0, weight: 0 };
}

function introMessage(locale: Locale, t: Translate): OnboardingChatMessage {
  return {
    id: `intro-${locale}`,
    role: 'coach',
    // The intro carries the first question too — there is no separate question card.
    text: mergeCoachText(t('onbChat.intro'), missingPrompt(canCompleteChatOnboarding(emptyDraft(), {}).missing[0], t)),
    createdAt: new Date().toISOString(),
  };
}

function resumeMessage(locale: Locale, t: Translate): OnboardingChatMessage {
  return {
    id: `resume-${locale}-${Date.now()}`,
    role: 'coach',
    text: t('onbChat.resume'),
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
  t: Translate,
): OnboardingChatState {
  const reduced = reduceOnboardingChatState(state, { type: 'coach_reply', reply });
  const synced = withDeterministicMissing(reduced);
  return replaceLastCoachMessage(synced, mergeCoachText(reply.reply, nextCoachNudge(synced, t)));
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

  const applied = applyGoalProfileToUserProfile(state.draft, parsed.goalProfile);
  // The local parser always defaults experience to beginner; never let that
  // overwrite a level the user already picked earlier in the chat.
  const draft = state.touchedFields.experience
    ? {
        ...applied,
        experience: state.draft.experience,
        goalProfile: applied.goalProfile && { ...applied.goalProfile, experienceLevel: state.draft.experience },
      }
    : applied;
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
  t: Translate,
): string {
  return mergeCoachText(manualAcknowledgement(state, patch, touched, t), nextCoachNudge(state, t));
}

function manualAcknowledgement(
  state: OnboardingChatState,
  patch: Partial<UserProfile>,
  touched: OnboardingField[],
  t: Translate,
): string {
  if (touched.includes('coachScope')) {
    return t('onbChat.ackScope', { scope: scopeLabel(resolveCoachScope(state.draft), t).toLowerCase() });
  }
  if (touched.includes('sessionsPerWeek')) {
    return t('onbChat.ackSessions', { count: state.draft.sessionsPerWeek });
  }
  if (touched.includes('experience')) {
    return t('onbChat.ackExperience', { level: experienceLabel(state.draft.experience, t).toLowerCase() });
  }
  if (touched.includes('raceDateISO') && patch.raceDateISO) {
    return t('onbChat.ackRaceDate', { iso: patch.raceDateISO });
  }
  return t('onbChat.ackGeneric');
}

/** Goal suggestions carry a stable `kind` so scope filtering keys off that
 *  rather than off the label text. The old version filtered with
 *  `label.includes('lose' | 'zhub' | '10')`, which silently depended on the
 *  wording never changing and would not survive a third locale. */
const GOAL_REPLIES: { kind: 'lose_fat' | 'run' | 'muscle' | 'fitness'; labelKey: TranslationKey; messageKey: TranslationKey }[] = [
  { kind: 'lose_fat', labelKey: 'onbChat.goalLoseLabel',    messageKey: 'onbChat.goalLoseMsg' },
  { kind: 'run',      labelKey: 'onbChat.goalRunLabel',     messageKey: 'onbChat.goalRunMsg' },
  { kind: 'muscle',   labelKey: 'onbChat.goalMuscleLabel',  messageKey: 'onbChat.goalMuscleMsg' },
  { kind: 'fitness',  labelKey: 'onbChat.goalFitnessLabel', messageKey: 'onbChat.goalFitnessMsg' },
];

const EXPERIENCE_REPLIES: [ExperienceLevel, TranslationKey][] = [
  ['beginner',     'onbChat.levelStarting'],
  ['intermediate', 'onbChat.levelSome'],
  ['advanced',     'onbChat.levelAdvanced'],
];

function repliesFor(missing: ChatOnboardingMissingField[], scope: CoachScope, t: Translate): QuickReply[] {
  const first = missing[0];
  if (!first || isBodyField(first) || first === 'raceDateISO') return [];
  if (first === 'coachScope') {
    return [
      { label: t('onbChat.replyBoth'), patch: { coachScope: 'both' }, touched: ['coachScope'] },
      { label: t('onbChat.replyTrainingOnly'), patch: { coachScope: 'training' }, touched: ['coachScope'] },
      { label: t('onbChat.replyFoodOnly'), patch: { coachScope: 'nutrition' }, touched: ['coachScope'] },
    ];
  }
  if (first === 'goal') {
    // Training-only coaching drops the fat-loss goal; nutrition-only drops the race goal.
    const excluded = scope === 'training' ? 'lose_fat' : scope === 'nutrition' ? 'run' : null;
    return GOAL_REPLIES
      .filter(reply => reply.kind !== excluded)
      .map(reply => ({ label: t(reply.labelKey), message: t(reply.messageKey) }));
  }
  if (first === 'sessionsPerWeek') {
    return [2, 3, 4, 5].map(count => ({
      label: t('onbChat.sessionsChip', { count, unit: t('onbChat.perWeekChip') }),
      patch: { sessionsPerWeek: count },
      touched: ['sessionsPerWeek'],
    }));
  }
  if (first === 'experience') {
    return EXPERIENCE_REPLIES.map(([value, labelKey]) => ({
      label: t(labelKey),
      patch: { experience: value },
      touched: ['experience'],
    }));
  }
  return [];
}

function nextCoachNudge(state: OnboardingChatState, t: Translate): string {
  const completion = canCompleteChatOnboarding(state.draft, state.touchedFields);
  if (completion.complete) return t('onbChat.nudgeComplete');
  return missingPrompt(completion.missing[0], t);
}

function missingPrompt(field: ChatOnboardingMissingField | undefined, t: Translate): string {
  if (!field) return '';
  switch (field) {
    case 'coachScope': return t('onbChat.promptScope');
    case 'goal': return t('onbChat.promptGoal');
    case 'sessionsPerWeek': return t('onbChat.promptSessions');
    case 'experience': return t('onbChat.promptExperience');
    case 'raceDateISO': return t('onbChat.promptRaceDate');
    case 'gender':
    case 'age':
    case 'height':
    case 'weight':
      return t('onbChat.promptBody');
  }
}

function missingLine(missing: ChatOnboardingMissingField[], t: Translate): string {
  if (!missing.length) return '';
  const labels = missing.slice(0, 3).map(field => missingLabel(field, t)).join(', ');
  return t('onbChat.stillNeeded', { labels });
}

function missingLabel(field: ChatOnboardingMissingField, t: Translate): string {
  switch (field) {
    case 'coachScope': return t('onbChat.labelScope');
    case 'goal': return t('onbChat.labelGoal');
    case 'sessionsPerWeek': return t('onbChat.labelSessions');
    case 'experience': return t('onbChat.labelExperience');
    case 'raceDateISO': return t('onbChat.labelRaceDate');
    case 'gender': return t('onbChat.labelGender');
    case 'age': return t('onbChat.labelAge');
    case 'height': return t('onbChat.labelHeight');
    case 'weight': return t('onbChat.labelWeight');
  }
}

function placeholderFor(field: ChatOnboardingMissingField | undefined, t: Translate): string {
  switch (field) {
    case 'goal': return t('onbChat.phGoal');
    case 'coachScope': return t('onbChat.phScope');
    case 'sessionsPerWeek': return t('onbChat.phSessions');
    case 'experience': return t('onbChat.phExperience');
    case 'raceDateISO': return t('onbChat.phRaceDate');
    default: return t('onbChat.phDefault');
  }
}

function profileSummary(draft: UserProfile, touched: TouchedOnboardingFields, locale: Locale, t: Translate): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  const scope = resolveCoachScope(draft);
  if (touched.coachScope) {
    items.push({ label: t('onbChat.sumFocus'), value: scopeLabel(scope, t) });
  }
  if (touched.goalProfile || touched.primaryGoal || touched.trainingGoal) {
    // primaryGoalLabel still takes a locale — it lives in utils/nutrition.ts,
    // which has not been migrated yet.
    items.push({ label: t('onbChat.sumGoal'), value: primaryGoalLabel(draft.primaryGoal, locale) });
  }
  if (scopeHasTraining(scope) && touched.sessionsPerWeek) {
    items.push({
      label: t('onbChat.sumTraining'),
      value: t('onbChat.trainingValue', { count: draft.sessionsPerWeek, unit: t('onbChat.perWeekShort') }),
    });
  }
  if (scopeHasTraining(scope) && touched.experience) {
    items.push({ label: t('onbChat.sumLevel'), value: experienceLabel(draft.experience, t) });
  }
  if (scopeHasNutrition(scope) && touched.age && touched.height && touched.weight) {
    items.push({
      label: t('onbChat.sumBody'),
      value: t('onbChat.bodyValue', { age: draft.age, height: draft.height, weight: draft.weight }),
    });
  }
  return items;
}

function scopeLabel(scope: CoachScope, t: Translate): string {
  if (scope === 'training') return t('onbChat.scopeTraining');
  if (scope === 'nutrition') return t('onbChat.scopeNutrition');
  return t('onbChat.scopeBoth');
}

function experienceLabel(level: ExperienceLevel, t: Translate): string {
  if (level === 'advanced') return t('onbChat.levelAdvanced');
  if (level === 'intermediate') return t('onbChat.levelSome');
  return t('onbChat.levelStarting');
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
    marginBottom: 8,
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
