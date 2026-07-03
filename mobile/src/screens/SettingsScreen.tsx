import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Button,
  Card,
  Pill,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SettingRow,
  SourceStatusCard,
  StatusPill,
} from '../components/UI';
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

type SettingsTab = 'coach' | 'data' | 'privacy';

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
  const [tab, setTab] = useState<SettingsTab>('coach');
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      native.platform === 'ios' ? t('settings.iosInstrMsg') : t('settings.androidInstrMsg'),
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
      <SegmentedControl
        value={tab}
        options={[
          { value: 'coach', label: t('settings.tabCoach') },
          { value: 'data', label: t('settings.tabData') },
          { value: 'privacy', label: t('settings.tabPrivacy') },
        ]}
        onChange={setTab}
      />

      {tab === 'coach' && (
        <>
          <Card>
            <SectionHeader title={t('settings.language')} />
            <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular }]}>{t('settings.languageDesc')}</Text>
            <View style={styles.wrap}>
              {SUPPORTED_LOCALES.map(loc => (
                <Pill key={loc} active={locale === loc} onPress={() => setLocale(loc)}>
                  {LOCALE_LABELS[loc]}
                </Pill>
              ))}
            </View>
          </Card>

          <Card>
            <SectionHeader title={t('settings.units')} />
            <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular }]}>{t('settings.unitsDesc')}</Text>
            <View style={styles.wrap}>
              {(['metric', 'imperial'] as const).map(us => (
                <Pill key={us} active={(profile?.units ?? 'metric') === us} onPress={() => profile && setProfile({ ...profile, units: us })}>
                  {t(us === 'metric' ? 'settings.unitsMetric' : 'settings.unitsImperial')}
                </Pill>
              ))}
            </View>
          </Card>

          {__DEV__ && (
            <Card>
              <SectionHeader title={t('settings.devSettings')} />
              <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular }]}>{t('settings.devSettingsDesc')}</Text>
              <View style={styles.wrap}>
                <Pill active={isSubscribed} onPress={() => setIsSubscribed(!isSubscribed)}>
                  {isSubscribed ? t('settings.premiumActive') : t('settings.premiumInactive')}
                </Pill>
              </View>
            </Card>
          )}

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

      {tab === 'data' && (
        <>
          <Card>
            <SectionHeader title={t('settings.healthSourceTitle')} />
            <Text style={[styles.copy, { color: colors.muted, fontFamily: fonts.regular, marginBottom: 12 }]}>
              {t('settings.healthSourceDesc')}
            </Text>
            <View style={styles.wrap}>
              {(['manual', 'mock', 'auto'] as const).map(mode => {
                const label = mode === 'manual' ? t('settings.healthModeManual') 
                            : mode === 'mock' ? t('settings.healthModeMock') 
                            : t('settings.healthModeAuto');
                const isSelected = (profile?.healthProviderMode || 'auto') === mode;
                return (
                  <Pill key={mode} active={isSelected} onPress={() => handleSelectMode(mode)}>
                    {label}
                  </Pill>
                );
              })}
            </View>
            <Text style={[styles.note, { color: colors.faint, marginTop: 10 }]}>
              {t('settings.healthSourceExplain')}
            </Text>
          </Card>

          <SourceStatusCard
            title={native.platform === 'ios' ? t('settings.nativeIos') : native.platform === 'android' ? t('settings.nativeAndroid') : t('settings.nativeGeneric')}
            body={native.platform === 'unsupported'
              ? t('settings.nativeUnsupported')
              : native.available
                ? t('settings.nativeStatus', { status: formatPermission(native.permission, t) })
                : native.platform === 'ios'
                  ? t('settings.nativeIosSoon')
                  : t('settings.nativeAndroidSoon')}
            meta={native.platform !== 'unsupported' ? t('settings.nativeTipShort', { platform: native.platform === 'ios' ? 'Apple Health' : 'Health Connect' }) : undefined}
            status={native.available ? t('settings.available') : t('settings.pending')}
            statusTone={native.available ? 'ready' : 'caution'}
            action={native.platform !== 'unsupported' ? <Button variant="secondary" onPress={handleConnectNative}>{t('settings.detailInstructions')}</Button> : undefined}
          />

          <Card>
            <SectionHeader title={t('settings.oauthTitle')} action={isLoading ? <StatusPill label={t('settings.loadingSources')} tone="info" /> : null} />
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
          </Card>

          <SourceStatusCard
            title={t('settings.noApiTitle')}
            body={t('settings.noApiBodyShort', { platform: native.platform === 'ios' ? 'Apple Health' : 'Health Connect' })}
            status={t('settings.info')}
            statusTone="info"
          />
        </>
      )}

      {tab === 'privacy' && (
        <>
          <Card>
            <SectionHeader title={t('settings.privacyTitle')} />
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
          </Card>
        </>
      )}
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

function formatPermission(p: string, t: Translate): string {
  switch (p) {
    case 'granted': return t('settings.permGranted');
    case 'partial': return t('settings.permPartial');
    case 'denied': return t('settings.permDenied');
    case 'not_determined': return t('settings.permNotDetermined');
    case 'unavailable': return t('settings.permUnavailable');
    default: return p;
  }
}

const styles = StyleSheet.create({
  screen: { gap: 18 },
  copy: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceList: { gap: 10 },
  privacyActions: { gap: 8 },
});
