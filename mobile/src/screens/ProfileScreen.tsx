import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Button, Card, Field, Label, Pill, ScreenHeader } from '../components/UI';
import { SectionCard } from '../components/SimpleUX';
import { Screen } from '../components/Screen';
import { WeightInput } from '../components/WeightInput';
import { useTrenr } from '../context/TrenrContext';
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { deleteAccount, exportAccountData } from '../services/api';
import type { CoachScope, DietStyle, ExperienceLevel, Gender, PlanIntensity, UserProfile } from '../types';
import { resolveCoachScope, scopeHasTraining } from '../types';
import { activityFactorForSessions } from '../utils/nutrition';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { LOCALE_LABELS, type TranslationKey } from '../lib/i18n';
import { USER_PRIMARY_GOALS } from '../constants/goals';
import { useHealthSources } from '../hooks/useHealthSources';
import { useUnits } from '../hooks/useUnits';
import {
  getExperienceLabel,
  getGoalLabel,
  getNutritionModeLabel,
  getRaceGoalLabel,
  summarizeLikesDislikes,
} from '../lib/profile/profile-labels';
import { PROFILE_NUTRITION_MODES, PROFILE_TRAINING_GOALS } from '../lib/profile/profile-options';

type EditSection = 'goal' | 'basics' | 'training' | 'nutrition' | 'account' | null;

export function ProfileScreen() {
  const { profile, setProfile, resetLocalProfile, purgeAllUserData, user, signIn, signOut, signUp } = useTrenr();
  const navigation = useNavigation<any>();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const { native, connectedOAuth } = useHealthSources();
  const { showWeight, weightUnit } = useUnits();
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  const [editing, setEditing] = useState<EditSection>(null);

  if (!profile) return null;

  const scope = resolveCoachScope(profile);
  const profileTitle = user?.email ?? t('profile.yourProfile');
  const sessionsLabel = t('profile.sessionsValue', { count: profile.sessionsPerWeek });
  const planPace = t(`planIntensity.${profile.planIntensity ?? 'moderate'}` as TranslationKey);
  const goalRows = [
    `${getGoalLabel(profile, t)} + ${getRaceGoalLabel(profile.trainingGoal, t)}`,
    t('profile.planLine', { pace: planPace, sessions: sessionsLabel }),
  ];
  const bodyRows = [
    [
      profile.age ? t('profile.ageValue', { age: profile.age }) : t('profile.notSet'),
      profile.height ? t('profile.heightValue', { height: profile.height }) : t('profile.notSet'),
      t('profile.weightValue', { weight: showWeight(profile.weight), unit: weightUnit }),
    ].join(' · '),
    getExperienceLabel(profile.experience, t),
  ];
  const trainingRows = [
    sessionsLabel,
    trainingContext(profile, t),
    restDaySummary(profile.preferredRestDays, t),
    profile.injuryFlag ? t('profile.injuryCaution') : t('profile.noInjury'),
  ];
  const nutritionRows = [
    getNutritionModeLabel(profile.nutritionMode ?? 'balanced', t),
    `${t(`diet.${profile.diet}` as TranslationKey)} · ${t('profile.mealsValue', { count: profile.mealCount })}`,
    summarizeLikesDislikes(profile.likes, profile.dislikes, t),
  ];
  const healthRows = [
    profileHealthModeLabel(profile.healthProviderMode, connectedOAuth.length, native.available, locale),
    profileHealthState(profile.healthProviderMode, connectedOAuth.length, native.available, locale),
  ];
  const settingsRows = [
    t('profile.languageValue', { language: LOCALE_LABELS[locale] }),
    t('profile.unitsValue', { units: profile.units === 'imperial' ? t('settings.unitsImperial') : t('settings.unitsMetric') }),
  ];
  const accountRows = [
    user?.email ? t('profile.accountSignedIn', { email: user.email }) : t('profile.accountSignedOut'),
    t('profile.restartBody'),
  ];

  function toggle(section: Exclude<EditSection, null>) {
    setEditing(current => current === section ? null : section);
  }

  async function login() {
    try {
      await signIn(auth.email.trim(), auth.password);
    } catch (err) {
      Alert.alert(t('profile.loginFailed'), err instanceof Error ? err.message : t('profile.tryAgain'));
    }
  }

  async function register() {
    try {
      await signUp(auth.name.trim(), auth.email.trim(), auth.password);
      Alert.alert(t('profile.registerDone'), t('profile.registerDoneMsg'));
    } catch (err) {
      Alert.alert(t('profile.registerFailed'), err instanceof Error ? err.message : t('profile.tryAgain'));
    }
  }

  async function exportData() {
    try {
      const data = await exportAccountData();
      Alert.alert(t('profile.exportReady'), t('profile.exportSummary', { profile: t(data.profile ? 'common.yes' : 'common.no'), count: data.mealHistory?.length || 0 }));
    } catch (err) {
      Alert.alert(t('profile.exportFailed'), err instanceof Error ? err.message : t('profile.signInAgain'));
    }
  }

  async function confirmDelete() {
    Alert.alert(t('profile.deleteTitle'), t('profile.deleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            await purgeAllUserData();
          } catch (err) {
            Alert.alert(t('profile.deleteFailed'), err instanceof Error ? err.message : t('profile.deleteFailedMsg'));
          }
        },
      },
    ]);
  }

  function openUrl(url: string) {
    Linking.openURL(url).catch(() => Alert.alert(t('settings.openLinkFailed'), url));
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader eyebrow={t('tab.profile')} title={profileTitle} subtitle={t('profile.personalizeSubtitle')} />

      <ProfileSectionCard
        title={t('profile.currentGoal')}
        rows={goalRows}
        ctaLabel={editing === 'goal' ? t('profile.closeEdit') : t('profile.editGoal')}
        expanded={editing === 'goal'}
        onPress={() => toggle('goal')}
      >
        <GoalEditor profile={profile} scope={scope} setProfile={setProfile} t={t} />
      </ProfileSectionCard>

      <ProfileSectionCard
        title={t('profile.bodyBasics')}
        rows={bodyRows}
        ctaLabel={editing === 'basics' ? t('profile.closeEdit') : t('profile.editBasics')}
        expanded={editing === 'basics'}
        onPress={() => toggle('basics')}
      >
        <BasicsEditor profile={profile} setProfile={setProfile} t={t} />
      </ProfileSectionCard>

      <ProfileSectionCard
        title={t('profile.trainingPrefs')}
        rows={trainingRows}
        ctaLabel={editing === 'training' ? t('profile.closeEdit') : t('profile.editTraining')}
        expanded={editing === 'training'}
        onPress={() => toggle('training')}
      >
        <TrainingEditor profile={profile} scope={scope} setProfile={setProfile} t={t} />
      </ProfileSectionCard>

      <ProfileSectionCard
        title={t('profile.nutritionPrefs')}
        rows={nutritionRows}
        ctaLabel={editing === 'nutrition' ? t('profile.closeEdit') : t('profile.editNutrition')}
        expanded={editing === 'nutrition'}
        onPress={() => toggle('nutrition')}
      >
        <NutritionEditor profile={profile} setProfile={setProfile} t={t} />
      </ProfileSectionCard>

      <ProfileSectionCard
        title={t('profile.healthData')}
        rows={healthRows}
        ctaLabel={locale === 'en' ? 'Manage' : 'Spravovat'}
        onPress={() => navigation.navigate('Settings')}
      />

      <ProfileSectionCard
        title={t('profile.appSettings')}
        rows={settingsRows}
        ctaLabel={t('settings.title')}
        onPress={() => navigation.navigate('Settings')}
      />

      <ProfileSectionCard
        title={t('profile.accountData')}
        rows={accountRows}
        ctaLabel={editing === 'account' ? t('profile.closeEdit') : t('profile.manageAccount')}
        expanded={editing === 'account'}
        onPress={() => toggle('account')}
      >
        <AccountEditor
          userEmail={user?.email}
          auth={auth}
          setAuth={setAuth}
          login={login}
          register={register}
          signOut={signOut}
          exportData={exportData}
          confirmDelete={confirmDelete}
          resetLocalProfile={resetLocalProfile}
          t={t}
        />
      </ProfileSectionCard>

      <SectionCard title={t('profile.safetyAbout')} body={[t('profile.safetyShort'), t('profile.safetyBodyShort')]}>
        <View style={styles.linkRow}>
          <Text style={[styles.link, { color: colors.blue }]} onPress={() => openUrl('https://nutri-fit-omega.vercel.app/legal.html#privacy')}>{t('profile.privacyPolicy')}</Text>
          <Text style={[styles.link, { color: colors.blue }]} onPress={() => openUrl('https://nutri-fit-omega.vercel.app/delete-account.html')}>{t('profile.publicDeleteRequest')}</Text>
        </View>
      </SectionCard>
    </Screen>
  );
}

function ProfileSectionCard({
  title,
  rows,
  ctaLabel,
  expanded,
  onPress,
  children,
}: {
  title: string;
  rows: string[];
  ctaLabel?: string;
  expanded?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  const visibleRows = rows.slice(0, 2).filter(Boolean);

  return (
    <Card style={styles.profileCard}>
      <View style={styles.profileCardHeader}>
        <Text numberOfLines={1} style={[styles.profileCardTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
        {ctaLabel && onPress ? (
          <Pressable
            accessibilityRole="button"
            onPress={onPress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.profileEditButton,
              { borderColor: colors.border, backgroundColor: colors.bgElev },
              pressed && { opacity: 0.82 },
            ]}
          >
            <Text numberOfLines={1} style={[styles.profileEditText, { color: colors.accent, fontFamily: fonts.bold }]}>{ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.profileRows}>
        {visibleRows.map((row, index) => (
          <Text key={`${title}-${index}`} numberOfLines={2} style={[styles.profileRowText, { color: colors.muted, fontFamily: fonts.medium }]}>{row}</Text>
        ))}
      </View>
      {expanded && children ? <View style={styles.editor}>{children}</View> : null}
    </Card>
  );
}

function GoalEditor({
  profile,
  scope,
  setProfile,
  t,
}: {
  profile: UserProfile;
  scope: CoachScope;
  setProfile: (profile: UserProfile) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Label>{t('profile.focus')}</Label>
      <View style={styles.wrap}>
        {(['both', 'training', 'nutrition'] as CoachScope[]).map(s => (
          <Pill key={s} active={scope === s} onPress={() => void setProfile({ ...profile, coachScope: s })}>
            {t(('scope.' + s) as TranslationKey)}
          </Pill>
        ))}
      </View>

      <Label>{t('profile.mainGoal')}</Label>
      <View style={styles.wrap}>
        {USER_PRIMARY_GOALS.map(goal => (
          <Pill
            key={goal.value}
            active={profile.primaryGoal === goal.value}
            onPress={() => void setProfile({ ...profile, primaryGoal: goal.value, trainingGoal: goal.trainingGoal })}
          >
            {t(goal.labelKey)}
          </Pill>
        ))}
      </View>

      <Label>{t('profile.trainingGoal')}</Label>
      <View style={styles.wrap}>
        {PROFILE_TRAINING_GOALS.map(goal => (
          <Pill key={goal.value} active={profile.trainingGoal === goal.value} onPress={() => void setProfile({ ...profile, trainingGoal: goal.value })}>
            {t(goal.labelKey)}
          </Pill>
        ))}
      </View>

      <Label>{t('profile.planIntensity')}</Label>
      <View style={styles.wrap}>
        {planIntensities.map(intensity => (
          <Pill key={intensity.value} active={(profile.planIntensity ?? 'moderate') === intensity.value} onPress={() => void setProfile({ ...profile, planIntensity: intensity.value })}>
            {t(intensity.labelKey)}
          </Pill>
        ))}
      </View>
    </>
  );
}

function BasicsEditor({
  profile,
  setProfile,
  t,
}: {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Label>{t('profile.sex')}</Label>
      <View style={styles.wrap}>
        {(['muz', 'zena'] as Gender[]).map(gender => (
          <Pill key={gender} active={profile.gender === gender} onPress={() => void setProfile({ ...profile, gender })}>
            {gender === 'muz' ? t('onb.male') : t('onb.female')}
          </Pill>
        ))}
      </View>

      <Label>{t('onb.ageField')}</Label>
      <Field keyboardType="number-pad" value={String(profile.age || '')} onChangeText={age => void setProfile({ ...profile, age: parseOptionalInt(age, 100) ?? 0 })} />

      <Label>{t('onb.heightField')}</Label>
      <Field keyboardType="number-pad" value={String(profile.height || '')} onChangeText={height => void setProfile({ ...profile, height: parseOptionalInt(height, 250) ?? 0 })} />

      <Label>{t('profile.currentWeight')}</Label>
      <WeightInput weightKg={profile.weight} onChangeKg={weight => void setProfile({ ...profile, weight })} />

      <Label>{t('onb.experienceQuestion')}</Label>
      <View style={styles.wrap}>
        {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map(experience => (
          <Pill key={experience} active={profile.experience === experience} onPress={() => void setProfile({ ...profile, experience })}>
            {getExperienceLabel(experience, t)}
          </Pill>
        ))}
      </View>
    </>
  );
}

function TrainingEditor({
  profile,
  scope,
  setProfile,
  t,
}: {
  profile: UserProfile;
  scope: CoachScope;
  setProfile: (profile: UserProfile) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Label>{t('profile.sessionsPerWeek')}</Label>
      <View style={styles.wrap}>
        {[1, 2, 3, 4, 5, 6].map(count => (
          <Pill key={count} active={profile.sessionsPerWeek === count} onPress={() => void setProfile({ ...profile, sessionsPerWeek: count, activityFactor: activityFactorForSessions(count) })}>
            {count}×
          </Pill>
        ))}
      </View>

      {scopeHasTraining(scope) ? (
        <>
          <Label>{t('profile.restDays')}</Label>
          <View style={styles.wrap}>
            {WEEKDAY_REST.map(day => (
              <Pill
                key={day.value}
                active={(profile.preferredRestDays ?? []).includes(day.value)}
                onPress={() => void setProfile({ ...profile, preferredRestDays: toggleRestDay(profile.preferredRestDays, day.value) })}
              >
                {t(day.labelKey)}
              </Pill>
            ))}
          </View>
        </>
      ) : null}

      <Label>{t('profile.injuryCaution')}</Label>
      <View style={styles.wrap}>
        <Pill active={profile.injuryFlag === false || profile.injuryFlag === undefined} onPress={() => void setProfile({ ...profile, injuryFlag: false })}>{t('profile.noInjury')}</Pill>
        <Pill active={profile.injuryFlag === true} onPress={() => void setProfile({ ...profile, injuryFlag: true })}>{t('profile.injuryCaution')}</Pill>
      </View>
    </>
  );
}

function NutritionEditor({
  profile,
  setProfile,
  t,
}: {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Label>{t('profile.nutritionMode')}</Label>
      <View style={styles.wrap}>
        {PROFILE_NUTRITION_MODES.map(mode => (
          <Pill key={mode.value} active={(profile.nutritionMode ?? 'balanced') === mode.value} onPress={() => void setProfile({ ...profile, nutritionMode: mode.value })}>
            {t(mode.labelKey)}
          </Pill>
        ))}
      </View>

      <Label>{t('profile.dietType')}</Label>
      <View style={styles.wrap}>
        {dietStyles.map(diet => (
          <Pill key={diet} active={profile.diet === diet} onPress={() => void setProfile({ ...profile, diet })}>
            {t(`diet.${diet}` as TranslationKey)}
          </Pill>
        ))}
      </View>

      <Label>{t('plan.mealCount', { n: profile.mealCount })}</Label>
      <View style={styles.inlineActions}>
        <Button variant="secondary" onPress={() => void setProfile({ ...profile, mealCount: Math.max(2, profile.mealCount - 1) })}>{t('plan.removeMeal')}</Button>
        <Button variant="secondary" onPress={() => void setProfile({ ...profile, mealCount: Math.min(6, profile.mealCount + 1) })}>{t('plan.addMeal')}</Button>
      </View>

      <Label>{t('profile.foodLikes')}</Label>
      <Field value={profile.likes} onChangeText={likes => void setProfile({ ...profile, likes })} placeholder={t('profile.foodLikesPlaceholder')} multiline />

      <Label>{t('profile.foodDislikes')}</Label>
      <Field value={profile.dislikes} onChangeText={dislikes => void setProfile({ ...profile, dislikes })} placeholder={t('profile.foodDislikesPlaceholder')} multiline />
    </>
  );
}

function AccountEditor({
  userEmail,
  auth,
  setAuth,
  login,
  register,
  signOut,
  exportData,
  confirmDelete,
  resetLocalProfile,
  t,
}: {
  userEmail?: string;
  auth: { name: string; email: string; password: string };
  setAuth: Dispatch<SetStateAction<{ name: string; email: string; password: string }>>;
  login: () => Promise<void>;
  register: () => Promise<void>;
  signOut: () => Promise<void>;
  exportData: () => Promise<void>;
  confirmDelete: () => Promise<void>;
  resetLocalProfile: () => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  if (userEmail) {
    return (
      <>
        <Text style={styles.accountEmail}>{userEmail}</Text>
        <View style={styles.inlineActions}>
          <Button variant="secondary" onPress={exportData}>{t('profile.exportData')}</Button>
          <Button variant="secondary" onPress={() => void signOut()}>{t('profile.signOut')}</Button>
        </View>
        <Button variant="secondary" onPress={() => void resetLocalProfile()}>{t('profile.restartOnboarding')}</Button>
        <Button variant="danger" onPress={() => void confirmDelete()}>{t('profile.deleteAccount')}</Button>
      </>
    );
  }
  return (
    <>
      <Field value={auth.name} onChangeText={name => setAuth(v => ({ ...v, name }))} placeholder={t('profile.namePlaceholder')} />
      <Field autoCapitalize="none" keyboardType="email-address" value={auth.email} onChangeText={email => setAuth(v => ({ ...v, email }))} placeholder={t('profile.emailPlaceholder')} />
      <Field secureTextEntry value={auth.password} onChangeText={password => setAuth(v => ({ ...v, password }))} placeholder={t('profile.passwordPlaceholder')} />
      <View style={styles.inlineActions}>
        <Button variant="secondary" onPress={() => void login()}>{t('profile.signIn')}</Button>
        <Button onPress={() => void register()}>{t('profile.register')}</Button>
      </View>
      <Button variant="secondary" onPress={() => void resetLocalProfile()}>{t('profile.restartOnboarding')}</Button>
    </>
  );
}

const planIntensities: Array<{ value: PlanIntensity; labelKey: TranslationKey }> = [
  { value: 'easy', labelKey: 'planIntensity.easy' },
  { value: 'moderate', labelKey: 'planIntensity.moderate' },
  { value: 'ambitious_but_safe', labelKey: 'planIntensity.ambitious_but_safe' },
];

const dietStyles: DietStyle[] = [
  'standardní',
  'vegetariánský',
  'veganský',
  'bezlepkový',
  'nízkosacharidový',
  'vysokoproteínový',
];

const WEEKDAY_REST = [
  { value: 1, labelKey: 'weekday.mon' as TranslationKey },
  { value: 2, labelKey: 'weekday.tue' as TranslationKey },
  { value: 3, labelKey: 'weekday.wed' as TranslationKey },
  { value: 4, labelKey: 'weekday.thu' as TranslationKey },
  { value: 5, labelKey: 'weekday.fri' as TranslationKey },
  { value: 6, labelKey: 'weekday.sat' as TranslationKey },
  { value: 0, labelKey: 'weekday.sun' as TranslationKey },
];

function trainingContext(profile: UserProfile, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  const environment = profile.goalProfile?.trainingEnvironment;
  if (environment === 'gym') return t('profile.gymTraining');
  if (environment === 'home') return t('profile.homeTraining');
  if (environment === 'mixed') return t('profile.mixedTraining');
  if (profile.goalProfile?.gymStrengthAvailable) return t('profile.gymTraining');
  return profile.mainSport?.label ?? t('profile.trainingContextDefault');
}

function restDaySummary(days: number[] | undefined, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if (!days?.length) return t('profile.noRestDays');
  return days.map(day => t(WEEKDAY_REST.find(item => item.value === day)?.labelKey ?? 'profile.notSet')).join(' · ');
}

function profileHealthModeLabel(
  mode: UserProfile['healthProviderMode'],
  connectedCount: number,
  nativeAvailable: boolean,
  locale: 'cs' | 'en',
): string {
  if (connectedCount > 0 || nativeAvailable || mode === 'apple_health' || mode === 'health_connect') {
    return locale === 'en' ? 'Health data' : 'Zdravotní data';
  }
  if (mode === 'mock') return locale === 'en' ? 'Demo data' : 'Demo data';
  if (mode === 'manual') return locale === 'en' ? 'Manual check-ins' : 'Ruční check-iny';
  return locale === 'en' ? 'Health data not connected' : 'Zdravotní data nejsou připojená';
}

function profileHealthState(
  mode: UserProfile['healthProviderMode'],
  connectedCount: number,
  nativeAvailable: boolean,
  locale: 'cs' | 'en',
): string {
  if (connectedCount > 0) {
    return locale === 'en'
      ? 'Connected sources can support your daily recommendation.'
      : 'Připojené zdroje pomáhají dennímu doporučení.';
  }
  if (nativeAvailable) {
    return locale === 'en'
      ? 'Native health data is available for setup.'
      : 'Nativní zdravotní data jsou dostupná k nastavení.';
  }
  if (mode === 'mock') {
    return locale === 'en'
      ? 'Demo values are only for trying the app.'
      : 'Demo hodnoty slouží jen na vyzkoušení appky.';
  }
  return locale === 'en'
    ? 'Manual check-ins work now; sources can be connected later.'
    : 'Ruční check-iny fungují hned, zdroje můžeš připojit později.';
}

function toggleRestDay(current: number[] | undefined, day: number): number[] {
  const set = new Set(current ?? []);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return Array.from(set).sort((a, b) => a - b);
}

function parseOptionalInt(value: string, max: number): number | undefined {
  const parsed = Math.round(Number(value.replace(',', '.')));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : undefined;
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  profileCard: { borderRadius: 16, padding: 14, gap: 8 },
  profileCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  profileCardTitle: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  profileEditButton: { minHeight: 34, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', maxWidth: 150 },
  profileEditText: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  profileRows: { gap: 4 },
  profileRowText: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  sectionRows: { gap: 5 },
  sectionLead: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  rowText: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  editor: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkRow: { gap: 8, marginTop: 10 },
  link: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  accountEmail: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
});
