// ── SETTINGS SCREEN
//
// Připojené zdroje zdravotních dat, jejich priorita, manuální propojení.
// Otevírá se ze ProfileScreen tlačítkem "Nastavení".
//
// Stávající chování:
//   - Apple Health / Health Connect: zobrazí status (available / unavailable
//     / unsupported). "Připojit" tlačítko zatím jen otevře dokumentaci —
//     reálná integrace přijde s EAS Build + native plugin instalací.
//   - Strava / Whoop / Garmin / Polar / Oura / Fitbit: zobrazí jestli je
//     token uložený. "Připojit" otevře OAuth flow (zatím stub Alert).
//     "Odpojit" smaže token přes useHealthSources.
//   - Vše ostatní (Zepp / Suunto / Mi Fit): pouze poznámka, že lze přes
//     Apple Health / Health Connect sync (chain).

import { useState } from 'react';
import { Alert, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
// Legacy subpath: expo-file-system@56's default export is the new Paths/File
// API; cacheDirectory + writeAsStringAsync live under /legacy.
import * as FileSystem from 'expo-file-system/legacy';
import { Button, Card, Field, H1, Label, Pill, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useNutriFit } from '../context/NutriFitContext';
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

// Mirror of app.json `extra`. Kept here as plain constants so the screen has
// no dependency on expo-constants resolution at runtime.
const PRIVACY_URL = 'https://nutri-fit-omega.vercel.app/legal.html#privacy';
const TERMS_URL = 'https://nutri-fit-omega.vercel.app/legal.html#terms';

type OAuthSourceMeta = {
  service: OAuthService;
  label: string;
  descKey: TranslationKey;
  /** Hint na to, jaké datové kategorie zdroj poskytuje. */
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
  const { colors } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const { connectedOAuth, native, isLoading, disconnect, refresh: refreshSources } = useHealthSources();
  const briefing = useMorningBriefingSchedule();
  const preWorkout = usePreWorkoutReminder();
  const postWorkout = usePostWorkoutReminder();
  const strava = useStravaConnect();
  const whoop = useWhoopConnect();
  const garmin = useGarminConnect();
  const oura = useOuraConnect();
  const { user, purgeAllUserData, signOut } = useNutriFit();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (strava.status === 'connected' && !connectedOAuth.includes('strava')) refreshSources();
  if (whoop.status === 'connected' && !connectedOAuth.includes('whoop')) refreshSources();
  if (garmin.status === 'connected' && !connectedOAuth.includes('garmin')) refreshSources();
  if (oura.status === 'connected' && !connectedOAuth.includes('oura')) refreshSources();

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
    // TODO(oauth): Polar, Fitbit — stejný pattern.
    Alert.alert(t('settings.connectGenericTitle', { service }), t('settings.connectGenericMsg'));
  }

  function handleConnectNative() {
    Alert.alert(
      native.platform === 'ios' ? t('settings.nativeIos') : t('settings.nativeAndroid'),
      native.platform === 'ios' ? t('settings.iosInstrMsg') : t('settings.androidInstrMsg'),
    );
  }

  /** Export all server-side account data as JSON, write to a temp file and
   *  open the system share sheet so the user can save/send it. Requires sign-in
   *  because the endpoint is auth-gated (api/export-data). */
  async function handleExport() {
    if (!user) {
      Alert.alert(t('settings.exportTitle'), t('settings.exportSignIn'));
      return;
    }
    setExporting(true);
    try {
      const data = await exportAccountData();
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

  /** Two-step destructive flow: confirm, delete server-side account + data
   *  (api/delete-account), then purge everything on-device and sign out. After
   *  purge, profile becomes null and RootNavigator returns to onboarding. */
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
              if (user) await deleteAccount();
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
    Linking.openURL(url).catch(() =>
      Alert.alert(t('settings.openLinkFailed'), url),
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>{t('settings.title')}</H1>
        <Subtitle>{t('settings.subtitle')}</Subtitle>

        {/* ── Language switcher ─────────────────────────────────────────── */}
        <Card>
          <Label>{t('settings.language')}</Label>
          <Text style={[styles.body, { color: colors.muted }]}>{t('settings.languageDesc')}</Text>
          <View style={styles.timeRow}>
            {SUPPORTED_LOCALES.map(loc => (
              <Pill key={loc} active={locale === loc} onPress={() => setLocale(loc)}>
                {LOCALE_LABELS[loc]}
              </Pill>
            ))}
          </View>
        </Card>

        {/* ── Morning push notification ─────────────────────────────────── */}
        <Card>
          <Label>{t('settings.morningCoaching')}</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {t('settings.morningBody')}{'\n\n'}
            <Text style={{ fontStyle: 'italic', color: colors.faint }}>
              {t('settings.morningNote')}
            </Text>
          </Text>
          <View style={styles.briefingRow}>
            <Pill
              active={briefing.settings.enabled}
              onPress={() => briefing.update({ enabled: !briefing.settings.enabled })}
            >
              {briefing.settings.enabled ? t('settings.on') : t('settings.off')}
            </Pill>
            <Text style={[styles.briefingTime, { color: colors.ink }]}>
              {String(briefing.settings.hour).padStart(2, '0')}:{String(briefing.settings.minute).padStart(2, '0')}
            </Text>
          </View>
          {briefing.settings.enabled && (
            <>
              <Label>{t('settings.notifTime')}</Label>
              <View style={styles.timeRow}>
                {[6, 7, 8, 9, 10].map(h => (
                  <Pill
                    key={h}
                    active={briefing.settings.hour === h}
                    onPress={() => briefing.update({ hour: h })}
                  >
                    {String(h).padStart(2, '0')}:00
                  </Pill>
                ))}
              </View>
              {briefing.permission !== 'granted' && briefing.permission !== 'unavailable' && (
                <Button variant="secondary" onPress={briefing.requestPermission}>
                  {t('settings.allowNotif')}
                </Button>
              )}
              {briefing.permission === 'unavailable' && (
                <Text style={[styles.note, { color: colors.faint }]}>
                  {t('settings.expoGoNote')}
                </Text>
              )}
            </>
          )}
        </Card>

        {/* ── Pre-workout fueling reminder ───────────────────────────────── */}
        <Card>
          <Label>{t('settings.preTitle')}</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {t('settings.preBody')}
          </Text>
          <View style={styles.briefingRow}>
            <Pill
              active={preWorkout.settings.enabled}
              onPress={() => preWorkout.update({ enabled: !preWorkout.settings.enabled })}
            >
              {preWorkout.settings.enabled ? t('settings.on') : t('settings.off')}
            </Pill>
            <Text style={[styles.briefingTime, { color: colors.ink, fontSize: 18 }]}>
              {t('settings.minBefore', { m: preWorkout.settings.minutesBefore })}
            </Text>
          </View>
          {preWorkout.settings.enabled && (
            <>
              <Label>{t('settings.whenNotify')}</Label>
              <View style={styles.timeRow}>
                {[30, 60, 90, 120].map(m => (
                  <Pill
                    key={m}
                    active={preWorkout.settings.minutesBefore === m}
                    onPress={() => preWorkout.update({ minutesBefore: m })}
                  >
                    {m} min
                  </Pill>
                ))}
              </View>
              <Text style={[styles.note, { color: colors.faint }]}>
                {t('settings.preNote')}
              </Text>
            </>
          )}
        </Card>

        {/* ── Post-workout refuel reminder ───────────────────────────────── */}
        <Card>
          <Label>{t('settings.postTitle')}</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {t('settings.postBody')}
          </Text>
          <View style={styles.briefingRow}>
            <Pill
              active={postWorkout.settings.enabled}
              onPress={() => postWorkout.update({ enabled: !postWorkout.settings.enabled })}
            >
              {postWorkout.settings.enabled ? t('settings.on') : t('settings.off')}
            </Pill>
            <Text style={[styles.briefingTime, { color: colors.ink, fontSize: 18 }]}>
              {t('settings.minAfter', { m: postWorkout.settings.minutesAfter })}
            </Text>
          </View>
          {postWorkout.settings.enabled && (
            <>
              <Label>{t('settings.whenNotify')}</Label>
              <View style={styles.timeRow}>
                {[0, 5, 15, 30].map(m => (
                  <Pill
                    key={m}
                    active={postWorkout.settings.minutesAfter === m}
                    onPress={() => postWorkout.update({ minutesAfter: m })}
                  >
                    {m === 0 ? t('settings.rightAfter') : t('settings.plusMin', { m })}
                  </Pill>
                ))}
              </View>
              <Text style={[styles.note, { color: colors.faint }]}>
                {t('settings.postNote')}
              </Text>
            </>
          )}
        </Card>

        {/* ── Native source: Apple Health or Health Connect ─────────────── */}
        <Card>
          <Label>
            {native.platform === 'ios'
              ? t('settings.nativeIos')
              : native.platform === 'android'
                ? t('settings.nativeAndroid')
                : t('settings.nativeGeneric')}
          </Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {native.platform === 'unsupported'
              ? t('settings.nativeUnsupported')
              : native.available
                ? t('settings.nativeStatus', { status: formatPermission(native.permission, t) })
                : native.platform === 'ios'
                  ? t('settings.nativeIosSoon')
                  : t('settings.nativeAndroidSoon')}
          </Text>
          {native.platform !== 'unsupported' && (
            <Text style={[styles.note, { color: colors.faint }]}>
              {t('settings.nativeTip', { platform: native.platform === 'ios' ? 'Apple Health' : 'Health Connect' })}
            </Text>
          )}
          {native.platform !== 'unsupported' && (
            <Button variant="secondary" onPress={handleConnectNative}>
              {t('settings.detailInstructions')}
            </Button>
          )}
        </Card>

        {/* ── OAuth sources ──────────────────────────────────────────────── */}
        <Card>
          <Label>{t('settings.oauthTitle')}</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {t('settings.oauthBody')}
          </Text>

          {OAUTH_SOURCES.map(src => {
            const connected = connectedOAuth.includes(src.service);
            return (
              <View key={src.service} style={[styles.sourceRow, { borderTopColor: colors.border }]}>
                <View style={styles.sourceTextCol}>
                  <View style={styles.sourceTitleRow}>
                    <Text style={[styles.sourceLabel, { color: colors.ink }]}>{src.label}</Text>
                    {connected && (
                      <Text style={[styles.connectedBadge, { color: colors.green, borderColor: colors.green }]}>
                        {t('settings.connected')}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.sourceDesc, { color: colors.muted }]}>{t(src.descKey)}</Text>
                  <Text style={[styles.sourceProvides, { color: colors.faint }]}>{t('settings.provides', { x: t(src.providesKey) })}</Text>
                  {src.service === 'strava' && strava.status === 'error' && strava.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      {t('settings.errorPrefix', { e: strava.error })}
                    </Text>
                  )}
                  {src.service === 'strava' && strava.athleteName && connected && (
                    <Text style={[styles.sourceProvides, { color: colors.green }]}>
                      {t('settings.athlete', { name: strava.athleteName })}
                    </Text>
                  )}
                  {src.service === 'whoop' && whoop.status === 'error' && whoop.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      {t('settings.errorPrefix', { e: whoop.error })}
                    </Text>
                  )}
                  {src.service === 'garmin' && garmin.status === 'error' && garmin.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      {t('settings.errorPrefix', { e: garmin.error })}
                    </Text>
                  )}
                  {src.service === 'oura' && oura.status === 'error' && oura.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      {t('settings.errorPrefix', { e: oura.error })}
                    </Text>
                  )}
                </View>
                <View style={styles.sourceButtons}>
                  {connected ? (
                    <Button variant="secondary" onPress={() => confirmDisconnect(src, disconnect, t)}>
                      {t('settings.disconnect')}
                    </Button>
                  ) : (
                    <Button
                      disabled={
                        (src.service === 'strava' && strava.status === 'connecting') ||
                        (src.service === 'whoop' && whoop.status === 'connecting') ||
                        (src.service === 'garmin' && garmin.status === 'connecting') ||
                        (src.service === 'oura' && oura.status === 'connecting')
                      }
                      onPress={() => handleConnect(src.service)}
                    >
                      {(src.service === 'strava' && strava.status === 'connecting') ||
                      (src.service === 'whoop' && whoop.status === 'connecting') ||
                      (src.service === 'garmin' && garmin.status === 'connecting') ||
                      (src.service === 'oura' && oura.status === 'connecting')
                        ? t('settings.opening')
                        : t('settings.connect')}
                    </Button>
                  )}
                </View>
              </View>
            );
          })}
        </Card>

        {/* ── Closed ecosystems (no public API) ──────────────────────────── */}
        <Card>
          <Label>{t('settings.noApiTitle')}</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {t('settings.noApiBody', { platform: native.platform === 'ios' ? 'Apple Health' : 'Health Connect' })}
          </Text>
        </Card>

        {/* ── Privacy & data (GDPR: export + erase + policy) ─────────────── */}
        <Card>
          <Label>{t('settings.privacyTitle')}</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {t('settings.privacyBody')}
          </Text>

          <Button variant="secondary" onPress={() => openUrl(PRIVACY_URL)}>
            {t('settings.privacyPolicy')}
          </Button>
          <View style={styles.privacySpacer} />
          <Button variant="secondary" onPress={() => openUrl(TERMS_URL)}>
            {t('settings.terms')}
          </Button>
          <View style={styles.privacySpacer} />
          <Button variant="secondary" disabled={exporting} onPress={handleExport}>
            {exporting ? t('settings.exporting') : t('settings.exportData')}
          </Button>
          <View style={styles.privacySpacer} />
          <Button variant="danger" disabled={deleting} onPress={handleDeleteAccount}>
            {deleting ? t('settings.deleting') : user ? t('settings.deleteAccountBtn') : t('settings.deleteLocalBtn')}
          </Button>
          {!user && (
            <Text style={[styles.note, { color: colors.faint }]}>
              {t('settings.notSignedInNote')}
            </Text>
          )}
        </Card>

        {isLoading && (
          <Text style={[styles.loading, { color: colors.faint }]}>{t('settings.loadingSources')}</Text>
        )}
      </ScrollView>
    </Screen>
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
    case 'granted':  return t('settings.permGranted');
    case 'partial':  return t('settings.permPartial');
    case 'denied':   return t('settings.permDenied');
    case 'not_determined': return t('settings.permNotDetermined');
    case 'unavailable': return t('settings.permUnavailable');
    default: return p;
  }
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 30 },
  body: { fontSize: 14, lineHeight: 20, marginVertical: 8 },
  note: { fontSize: 12, lineHeight: 16, fontStyle: 'italic', marginVertical: 6 },
  sourceRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: 1, alignItems: 'center' },
  sourceTextCol: { flex: 1, gap: 4 },
  sourceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sourceLabel: { fontSize: 16, fontWeight: '800' },
  sourceDesc: { fontSize: 13, lineHeight: 18 },
  sourceProvides: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  sourceButtons: { gap: 6 },
  connectedBadge: {
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 999,
    letterSpacing: 0.4,
  },
  loading: { textAlign: 'center', fontSize: 12, marginTop: 12 },
  briefingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  briefingTime: { fontSize: 22, fontWeight: '900' },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  sourceError: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  privacySpacer: { height: 8 },
});
