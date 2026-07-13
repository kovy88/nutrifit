import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Button,
  Pill,
  ScreenHeader,
  SettingRow,
  SourceStatusCard,
} from '../components/UI';
import { CollapsibleDetails, InfoRow, SectionCard } from '../components/SimpleUX';
import { Screen } from '../components/Screen';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { deleteAccount, exportAccountData } from '../services/api';
import { useHealthSources } from '../hooks/useHealthSources';
import { useMorningBriefingSchedule } from '../hooks/useMorningBriefingSchedule';
import { usePreWorkoutReminder } from '../hooks/usePreWorkoutReminder';
import { usePostWorkoutReminder } from '../hooks/usePostWorkoutReminder';
import { useStravaConnect } from '../hooks/useStravaConnect';
import { useWhoopConnect } from '../hooks/useWhoopConnect';
import { useGarminConnect } from '../hooks/useGarminConnect';
import { useOuraConnect } from '../hooks/useOuraConnect';
import { useLanguage } from '../context/LanguageContext';
import { SUPPORTED_LOCALES, LOCALE_LABELS } from '../lib/i18n';
import type { Translate, TranslationKey } from '../lib/i18n';
import type { OAuthService } from '../lib/health';

const PRIVACY_URL = 'https://nutri-fit-omega.vercel.app/legal.html#privacy';
const TERMS_URL = 'https://nutri-fit-omega.vercel.app/legal.html#terms';

type OAuthSourceMeta = {
  service: OAuthService;
  label: string;
  descKey: TranslationKey;
  providesKey: TranslationKey;
};

const OAUTH_SOURCES: OAuthSourceMeta[] = [
  { service: 'strava', label: 'Strava', descKey: 'settings.srcStravaDesc', providesKey: 'settings.srcStravaProvides' },
  { service: 'whoop', label: 'Whoop', descKey: 'settings.srcWhoopDesc', providesKey: 'settings.srcWhoopProvides' },
  { service: 'garmin', label: 'Garmin Connect', descKey: 'settings.srcGarminDesc', providesKey: 'settings.srcGarminProvides' },
  { service: 'polar', label: 'Polar Flow', descKey: 'settings.srcPolarDesc', providesKey: 'settings.srcPolarProvides' },
  { service: 'oura', label: 'Oura Ring', descKey: 'settings.srcOuraDesc', providesKey: 'settings.srcOuraProvides' },
  { service: 'fitbit', label: 'Fitbit', descKey: 'settings.srcFitbitDesc', providesKey: 'settings.srcFitbitProvides' },
];

export function SettingsScreen() {
  const { colors, fonts } = useTheme();
  const navigation = useNavigation<any>();
  const { locale, setLocale, t } = useLanguage();
  const { connectedOAuth, native, isLoading, disconnect, refresh: refreshSources } = useHealthSources();
  const briefing = useMorningBriefingSchedule();
  const preWorkout = usePreWorkoutReminder();
  const postWorkout = usePostWorkoutReminder();
  const strava = useStravaConnect();
  const whoop = useWhoopConnect();
  const garmin = useGarminConnect();
  const oura = useOuraConnect();
  const { user, profile, setProfile, purgeAllUserData, signOut, isSubscribed, setIsSubscribed } = useTrenr();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const healthMode = profile?.healthProviderMode ?? 'auto';
  const healthModeOptions: Array<'manual' | 'mock' | 'auto'> = __DEV__ ? ['manual', 'mock', 'auto'] : ['manual', 'auto'];
  const nativeConnected = isNativeHealthConnected(native.available, native.permission);

  // Re-fetch connected sources once a provider flips to "connected" after an
  // OAuth round-trip. Runs as an effect (not inline in the render body) so it
  // fires once per actual status change instead of on every render while the
  // two states are momentarily out of sync.
  useEffect(() => {
    const justConnected =
      (strava.status === 'connected' && !connectedOAuth.includes('strava')) ||
      (whoop.status === 'connected' && !connectedOAuth.includes('whoop')) ||
      (garmin.status === 'connected' && !connectedOAuth.includes('garmin')) ||
      (oura.status === 'connected' && !connectedOAuth.includes('oura'));
    if (justConnected) void refreshSources();
  }, [strava.status, whoop.status, garmin.status, oura.status, connectedOAuth, refreshSources]);

  function handleConnect(service: OAuthService) {
    if (service === 'strava') {
      if (strava.status === 'unavailable') {
        Alert.alert(t('settings.stravaNotConfTitle'), t('settings.stravaNotConfMsg'));
        return;
      }
      void strava.connect();
      return;
    }
    if (service === 'whoop') {
      if (whoop.status === 'unavailable') {
        Alert.alert(t('settings.whoopNotConfTitle'), t('settings.whoopNotConfMsg'));
        return;
      }
      void whoop.connect();
      return;
    }
    if (service === 'garmin') {
      if (garmin.status === 'unavailable') {
        Alert.alert(t('settings.garminNotConfTitle'), t('settings.garminNotConfMsg'));
        return;
      }
      void garmin.connect();
      return;
    }
    if (service === 'oura') {
      if (oura.status === 'unavailable') {
        Alert.alert(t('settings.ouraNotConfTitle'), t('settings.ouraNotConfMsg'));
        return;
      }
      void oura.connect();
      return;
    }
    Alert.alert(t('settings.connectGenericTitle', { service }), t('settings.connectGenericMsg'));
  }

  function handleConnectNative() {
    Alert.alert(
      native.platform === 'ios' ? t('settings.nativeIos') : t('settings.nativeAndroid'),
      nativeConnectMessage(native.platform, native.available, locale),
    );
  }

  async function handleSelectMode(mode: 'auto' | 'mock' | 'manual') {
    if (profile) {
      await setProfile({ ...profile, healthProviderMode: mode });
    }
  }

  async function handleExport() {
    if (!user) {
      Alert.alert(t('settings.exportTitle'), t('settings.exportSignIn'));
      return;
    }
    setExporting(true);
    try {
      const data = await exportAccountData(locale);
      const json = JSON.stringify(data, null, 2);
      const fileUri = `${FileSystem.cacheDirectory}nutrifit-export-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      await Share.share({ url: fileUri, title: t('settings.exportShareTitle') });
    } catch (err) {
      Alert.alert(t('settings.exportFailed'), err instanceof Error ? err.message : t('common.tryAgain'));
    } finally {
      setExporting(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      t('settings.deleteTitle'),
      user ? t('settings.deleteMsgUser') : t('settings.deleteMsgLocal'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              if (user) await deleteAccount(locale);
              await purgeAllUserData();
              if (user) await signOut();
            } catch (err) {
              Alert.alert(t('settings.deleteFailed'), err instanceof Error ? err.message : t('common.tryAgain'));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  function openUrl(url: string) {
    Linking.openURL(url).catch(() => Alert.alert(t('settings.openLinkFailed'), url));
  }

  function sourceBusy(service: OAuthService) {
    return (
      (service === 'strava' && strava.status === 'connecting') ||
      (service === 'whoop' && whoop.status === 'connecting') ||
      (service === 'garmin' && garmin.status === 'connecting') ||
      (service === 'oura' && oura.status === 'connecting')
    );
  }

  function sourceError(service: OAuthService) {
    if (service === 'strava') return strava.status === 'error' ? strava.error : undefined;
    if (service === 'whoop') return whoop.status === 'error' ? whoop.error : undefined;
    if (service === 'garmin') return garmin.status === 'error' ? garmin.error : undefined;
    if (service === 'oura') return oura.status === 'error' ? oura.error : undefined;
    return undefined;
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader onBack={() => navigation.goBack()} eyebrow={t('settings.eyebrow')} title={t('settings.title')} subtitle={t('settings.cleanSubtitle')} />

      <SectionCard
        title={t('settings.eyebrow')}
        body={[
          t('profile.languageValue', { language: LOCALE_LABELS[locale] }),
          t('profile.unitsValue', { units: profile?.units === 'imperial' ? t('settings.unitsImperial') : t('settings.unitsMetric') }),
        ]}
        detailLabel={t('plan.detail')}
        detailChildren={(
          <>
            <InfoRow label={t('settings.language')} value={LOCALE_LABELS[locale]} />
            <View style={styles.wrap}>
              {SUPPORTED_LOCALES.map(loc => (
                <Pill key={loc} active={locale === loc} onPress={() => setLocale(loc)}>
                  {LOCALE_LABELS[loc]}
                </Pill>
              ))}
            </View>

            <InfoRow label={t('settings.units')} value={profile?.units === 'imperial' ? t('settings.unitsImperial') : t('settings.unitsMetric')} />
            <View style={styles.wrap}>
              {(['metric', 'imperial'] as const).map(us => (
                <Pill key={us} active={(profile?.units ?? 'metric') === us} onPress={() => profile && setProfile({ ...profile, units: us })}>
                  {t(us === 'metric' ? 'settings.unitsMetric' : 'settings.unitsImperial')}
                </Pill>
              ))}
            </View>

            {__DEV__ ? (
              <CollapsibleDetails label={t('settings.debugTitle')}>
              <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular }]}>{t('settings.debugPremiumBody')}</Text>
              <View style={styles.wrap}>
                <Pill active={isSubscribed} onPress={() => setIsSubscribed(!isSubscribed)}>
                  {isSubscribed ? t('settings.debugPremiumOn') : t('settings.debugPremiumOff')}
                </Pill>
              </View>
              </CollapsibleDetails>
            ) : null}
          </>
        )}
      />

      <SectionCard
        title={settingsNotificationsTitle(locale)}
        body={[
          morningReminderSummary(briefing.settings.enabled, briefing.settings.hour, briefing.settings.minute, locale),
          workoutReminderSummary(preWorkout.settings.enabled, postWorkout.settings.enabled, locale),
        ]}
        detailLabel={t('plan.detail')}
        detailChildren={(
          <>
          <ReminderRow
            title={t('settings.morningCoaching')}
            body={t('settings.morningBodyShort')}
            enabled={briefing.settings.enabled}
            status={briefing.settings.enabled ? `${String(briefing.settings.hour).padStart(2, '0')}:${String(briefing.settings.minute).padStart(2, '0')}` : t('settings.off')}
            onToggle={() => briefing.update({ enabled: !briefing.settings.enabled })}
          >
            {briefing.settings.enabled ? (
              <>
                <View style={styles.wrap}>
                  {[6, 7, 8, 9, 10].map(hour => (
                    <Pill key={hour} active={briefing.settings.hour === hour} onPress={() => briefing.update({ hour })}>
                      {String(hour).padStart(2, '0')}:00
                    </Pill>
                  ))}
                </View>
                {briefing.permission !== 'granted' && briefing.permission !== 'unavailable' ? (
                  <Button variant="secondary" onPress={briefing.requestPermission}>{t('settings.allowNotif')}</Button>
                ) : null}
                {briefing.permission === 'unavailable' ? <Text style={[styles.note, { color: colors.faint }]}>{t('settings.expoGoNoteShort')}</Text> : null}
              </>
            ) : null}
          </ReminderRow>

          <ReminderRow
            title={t('settings.preTitle')}
            body={t('settings.preBodyShort')}
            enabled={preWorkout.settings.enabled}
            status={preWorkout.settings.enabled ? t('settings.minBefore', { m: preWorkout.settings.minutesBefore }) : t('settings.off')}
            onToggle={() => preWorkout.update({ enabled: !preWorkout.settings.enabled })}
          >
            {preWorkout.settings.enabled ? (
              <>
                <View style={styles.wrap}>
                  {[30, 60, 90, 120].map(minutesBefore => (
                    <Pill key={minutesBefore} active={preWorkout.settings.minutesBefore === minutesBefore} onPress={() => preWorkout.update({ minutesBefore })}>
                      {minutesBefore} min
                    </Pill>
                  ))}
                </View>
                <Text style={[styles.note, { color: colors.faint }]}>{t('settings.preNoteShort')}</Text>
              </>
            ) : null}
          </ReminderRow>

          <ReminderRow
            title={t('settings.postTitle')}
            body={t('settings.postBodyShort')}
            enabled={postWorkout.settings.enabled}
            status={postWorkout.settings.enabled ? t('settings.minAfter', { m: postWorkout.settings.minutesAfter }) : t('settings.off')}
            onToggle={() => postWorkout.update({ enabled: !postWorkout.settings.enabled })}
          >
            {postWorkout.settings.enabled ? (
              <>
                <View style={styles.wrap}>
                  {[0, 5, 15, 30].map(minutesAfter => (
                    <Pill key={minutesAfter} active={postWorkout.settings.minutesAfter === minutesAfter} onPress={() => postWorkout.update({ minutesAfter })}>
                      {minutesAfter === 0 ? t('settings.rightAfter') : t('settings.plusMin', { m: minutesAfter })}
                    </Pill>
                  ))}
                </View>
                <Text style={[styles.note, { color: colors.faint }]}>{t('settings.postNoteShort')}</Text>
              </>
            ) : null}
          </ReminderRow>
          </>
        )}
      />

      <SectionCard
        title={settingsHealthTitle(locale)}
        body={[
          healthSourceSummary(healthMode, connectedOAuth.length, nativeConnected, locale),
          healthSourceState(healthMode, connectedOAuth.length, native.available, native.permission, t, locale),
        ]}
        statusLabel={healthSourceStatus(healthMode, connectedOAuth.length, nativeConnected, t, locale)}
        statusTone={healthSourceTone(healthMode, connectedOAuth.length, nativeConnected)}
        detailLabel={t('plan.detail')}
        detailChildren={(
          <>
            <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular }]}>
              {t('settings.healthSourceDesc')}
            </Text>
            <View style={styles.wrap}>
              {healthModeOptions.map(mode => {
                const label = healthModeLabel(mode, t, locale);
                const isSelected = healthMode === mode;
                return (
                  <Pill key={mode} active={isSelected} onPress={() => handleSelectMode(mode)}>
                    {label}
                  </Pill>
                );
              })}
            </View>

          <SourceStatusCard
            title={nativeSourceTitle(native.platform, t, locale)}
            body={nativeHealthBody(native.platform, native.available, native.permission, locale)}
            meta={native.platform !== 'unsupported' ? nativeHealthMeta(native.platform, native.available, locale) : undefined}
            status={nativeHealthStatus(native.platform, native.available, native.permission, t, locale)}
            statusTone={nativeHealthStatusTone(native.platform, native.available, native.permission)}
            action={native.platform !== 'unsupported' ? <Button variant="secondary" onPress={handleConnectNative}>{t('settings.detailInstructions')}</Button> : undefined}
          />

          <CollapsibleDetails label={isLoading ? t('settings.loadingSources') : t('settings.oauthTitle')}>
            <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular }]}>{t('settings.oauthBodyShort')}</Text>
            <View style={styles.sourceList}>
              {OAUTH_SOURCES.map(src => {
                const connected = connectedOAuth.includes(src.service);
                const busy = sourceBusy(src.service);
                const error = sourceError(src.service);
                return (
                  <SourceStatusCard
                    key={src.service}
                    title={src.label}
                    body={t(src.descKey)}
                    meta={[
                      t('settings.provides', { x: t(src.providesKey) }),
                      src.service === 'strava' && strava.athleteName && connected ? t('settings.athlete', { name: strava.athleteName }) : '',
                    ].filter(Boolean).join(' · ')}
                    status={connected ? t('settings.connectedShort') : busy ? t('settings.opening') : t('settings.notConnected')}
                    statusTone={connected ? 'ready' : busy ? 'info' : 'neutral'}
                    error={error ? t('settings.errorPrefix', { e: error }) : undefined}
                    action={connected ? (
                      <Button variant="secondary" onPress={() => confirmDisconnect(src, disconnect, t)}>{t('settings.disconnect')}</Button>
                    ) : (
                      <Button disabled={busy} onPress={() => handleConnect(src.service)}>
                        {busy ? t('settings.opening') : t('settings.connect')}
                      </Button>
                    )}
                  />
                );
              })}
            </View>
          </CollapsibleDetails>

          <SourceStatusCard
            title={t('settings.noApiTitle')}
            body={t('settings.noApiBodyShort', { platform: native.platform === 'ios' ? 'Apple Health' : 'Health Connect' })}
            status={t('settings.info')}
            statusTone="info"
          />
          </>
        )}
      />

      <SectionCard
        title={t('settings.privacyTitle')}
        body={t('settings.privacyBodyShort')}
        detailLabel={t('plan.detail')}
        detailChildren={(
          <>
            <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular }]}>{t('settings.privacyBodyShort')}</Text>
            <View style={styles.privacyActions}>
              <Button variant="secondary" onPress={() => openUrl(PRIVACY_URL)}>{t('settings.privacyPolicy')}</Button>
              <Button variant="secondary" onPress={() => openUrl(TERMS_URL)}>{t('settings.terms')}</Button>
              <Button variant="secondary" disabled={exporting} onPress={handleExport}>
                {exporting ? t('settings.exporting') : t('settings.exportData')}
              </Button>
              <Button variant="danger" disabled={deleting} onPress={handleDeleteAccount}>
                {deleting ? t('settings.deleting') : user ? t('settings.deleteAccountBtn') : t('settings.deleteLocalBtn')}
              </Button>
            </View>
            {!user ? <Text style={[styles.note, { color: colors.faint }]}>{t('settings.notSignedInNote')}</Text> : null}
          </>
        )}
      />
    </Screen>
  );
}

function ReminderRow({
  title,
  body,
  enabled,
  status,
  onToggle,
  children,
}: {
  title: string;
  body: string;
  enabled: boolean;
  status: string;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <SettingRow
      title={title}
      body={body}
      meta={status}
      action={<Pill active={enabled} onPress={onToggle}>{enabled ? t('settings.on') : t('settings.off')}</Pill>}
    >
      {children}
    </SettingRow>
  );
}

function confirmDisconnect(src: OAuthSourceMeta, disconnect: (s: OAuthService) => Promise<void>, t: Translate) {
  Alert.alert(
    t('settings.disconnectTitle', { label: src.label }),
    t('settings.disconnectMsg'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.disconnect'), style: 'destructive', onPress: () => disconnect(src.service) },
    ],
  );
}

function settingsHealthTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Health data' : 'Zdravotní data';
}

function settingsNotificationsTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Notifications' : 'Připomínky';
}

function nativeSourceTitle(platform: 'ios' | 'android' | 'unsupported', t: Translate, locale: 'cs' | 'en'): string {
  if (platform === 'ios') return t('settings.nativeIos');
  if (platform === 'android') return t('settings.nativeAndroid');
  return locale === 'en' ? 'Health data' : 'Zdravotní data';
}

function nativeHealthBody(platform: 'ios' | 'android' | 'unsupported', available: boolean, permission: string, locale: 'cs' | 'en'): string {
  if (platform === 'unsupported') {
    return locale === 'en'
      ? 'This device cannot connect health data here. Manual check-ins still work.'
      : 'Tohle zařízení tady zdravotní data nepřipojí. Ruční check-iny pořád fungují.';
  }
  if (isNativeHealthConnected(available, permission)) {
    return locale === 'en'
      ? 'Connected health data can support sleep, recovery and workouts.'
      : 'Připojená zdravotní data pomáhají se spánkem, regenerací a tréninky.';
  }
  if (available) {
    return locale === 'en'
      ? 'Available, but not connected yet. Manual check-ins still work.'
      : 'Dostupné, ale zatím nepřipojené. Ruční check-iny pořád fungují.';
  }
  return locale === 'en'
    ? 'Not available in this build. You can keep using manual check-ins.'
    : 'V tomhle buildu zatím nedostupné. Můžeš dál používat ruční check-iny.';
}

function nativeHealthMeta(platform: 'ios' | 'android' | 'unsupported', available: boolean, locale: 'cs' | 'en'): string {
  if (platform === 'unsupported') return '';
  if (available) {
    return locale === 'en'
      ? 'Optional. Trenr works without it.'
      : 'Volitelné. Trenr funguje i bez toho.';
  }
  return locale === 'en'
    ? 'Use this later when the native build supports it.'
    : 'Použiješ později, až to bude podporovat nativní build.';
}

function nativeConnectMessage(platform: 'ios' | 'android' | 'unsupported', available: boolean, locale: 'cs' | 'en'): string {
  if (platform === 'unsupported') {
    return locale === 'en'
      ? 'Health data is not available on this device. Manual check-ins are enough to start.'
      : 'Zdravotní data na tomhle zařízení nejsou dostupná. Pro start stačí ruční check-iny.';
  }
  if (available) {
    return locale === 'en'
      ? 'Connect it only if you want Trenr to use sleep, recovery and workout data automatically.'
      : 'Připoj to jen pokud chceš, aby Trenr automaticky používal spánek, regeneraci a tréninky.';
  }
  return locale === 'en'
    ? 'This build cannot connect it yet. Manual check-ins are enough for the daily recommendation.'
    : 'Tenhle build to zatím nepřipojí. Pro denní doporučení stačí ruční check-iny.';
}

function morningReminderSummary(enabled: boolean, hour: number, minute: number, locale: 'cs' | 'en'): string {
  if (!enabled) return locale === 'en' ? 'Morning reminder off' : 'Ranní připomínka vypnutá';
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return locale === 'en' ? `Morning reminder at ${time}` : `Ranní připomínka v ${time}`;
}

function workoutReminderSummary(preEnabled: boolean, postEnabled: boolean, locale: 'cs' | 'en'): string {
  if (preEnabled && postEnabled) {
    return locale === 'en' ? 'Workout reminders before and after' : 'Připomínky před i po tréninku';
  }
  if (preEnabled) return locale === 'en' ? 'Pre-workout reminder on' : 'Připomínka před tréninkem zapnutá';
  if (postEnabled) return locale === 'en' ? 'Post-workout reminder on' : 'Připomínka po tréninku zapnutá';
  return locale === 'en' ? 'Workout reminders off' : 'Tréninkové připomínky vypnuté';
}

function healthModeLabel(mode: 'auto' | 'mock' | 'manual' | 'apple_health' | 'health_connect', t: Translate, locale: 'cs' | 'en'): string {
  if (mode === 'manual') return t('profile.healthManual');
  if (mode === 'mock') return t('profile.healthMock');
  if (mode === 'apple_health') return t('settings.nativeIos');
  if (mode === 'health_connect') return t('settings.nativeAndroid');
  return locale === 'en' ? 'Health data later' : 'Zdravotní data později';
}

function nativeHealthStatus(
  platform: 'ios' | 'android' | 'unsupported',
  available: boolean,
  permission: string,
  t: Translate,
  locale: 'cs' | 'en',
): string {
  if (platform === 'unsupported') return locale === 'en' ? 'Unavailable' : 'Nedostupné';
  if (isNativeHealthConnected(available, permission)) return t('settings.connectedShort');
  if (available) return locale === 'en' ? 'Available' : 'Dostupné';
  return t('settings.notConnected');
}

function nativeHealthStatusTone(
  platform: 'ios' | 'android' | 'unsupported',
  available: boolean,
  permission: string,
): 'neutral' | 'ready' | 'caution' | 'risk' | 'info' {
  if (isNativeHealthConnected(available, permission)) return 'ready';
  if (platform === 'unsupported') return 'neutral';
  if (available) return 'info';
  return 'caution';
}

function healthSourceSummary(
  mode: 'auto' | 'mock' | 'manual' | 'apple_health' | 'health_connect',
  connectedCount: number,
  nativeConnected: boolean,
  locale: 'cs' | 'en',
): string {
  if (connectedCount > 0 || nativeConnected) {
    return locale === 'en' ? 'Health data' : 'Zdravotní data';
  }
  if (mode === 'mock') return locale === 'en' ? 'Demo data' : 'Demo data';
  if (mode === 'manual') return locale === 'en' ? 'Manual data' : 'Ruční data';
  return locale === 'en' ? 'Manual check-ins are active' : 'Ruční check-iny jsou aktivní';
}

function healthSourceState(
  mode: 'auto' | 'mock' | 'manual' | 'apple_health' | 'health_connect',
  connectedCount: number,
  nativeAvailable: boolean,
  permission: string,
  t: Translate,
  locale: 'cs' | 'en',
): string {
  if (connectedCount > 0) {
    return locale === 'en' ? 'Connected sources can support sleep, recovery and workouts.' : 'Připojené zdroje pomáhají se spánkem, regenerací a tréninky.';
  }
  if (isNativeHealthConnected(nativeAvailable, permission)) {
    return locale === 'en'
      ? 'Native health data can support sleep, recovery and workouts.'
      : 'Nativní zdravotní data pomáhají se spánkem, regenerací a tréninky.';
  }
  if (nativeAvailable) {
    return locale === 'en'
      ? 'Health data is available to connect, but not connected yet.'
      : 'Zdravotní data můžeš připojit, ale zatím připojená nejsou.';
  }
  if (mode === 'mock') {
    return locale === 'en' ? 'Useful for trying the app without real health data.' : 'Hodí se na vyzkoušení appky bez reálných zdravotních dat.';
  }
  return locale === 'en'
    ? 'Connect a source later if you want sleep, recovery, and workout imports.'
    : 'Zdroj připoj později, pokud chceš import spánku, regenerace a tréninků.';
}

function healthSourceStatus(
  mode: 'auto' | 'mock' | 'manual' | 'apple_health' | 'health_connect',
  connectedCount: number,
  nativeConnected: boolean,
  t: Translate,
  locale: 'cs' | 'en',
): string {
  if (connectedCount > 0) return t('settings.connectedShort');
  if (nativeConnected) return t('settings.connectedShort');
  if (mode === 'mock') return locale === 'en' ? 'Demo' : 'Demo';
  if (mode === 'manual') return locale === 'en' ? 'Manual' : 'Ručně';
  return t('settings.notConnected');
}

function healthSourceTone(
  mode: 'auto' | 'mock' | 'manual' | 'apple_health' | 'health_connect',
  connectedCount: number,
  nativeConnected: boolean,
): 'neutral' | 'ready' | 'caution' | 'risk' | 'info' {
  if (connectedCount > 0 || nativeConnected || mode === 'manual') return 'ready';
  if (mode === 'mock') return 'info';
  return 'caution';
}

function isNativeHealthConnected(available: boolean, permission: string): boolean {
  return available && (permission === 'granted' || permission === 'partial');
}

const styles = StyleSheet.create({
  screen: { gap: 18 },
  copy: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceList: { gap: 10 },
  privacyActions: { gap: 8 },
});
