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
import type { OAuthService } from '../lib/health';

// Mirror of app.json `extra`. Kept here as plain constants so the screen has
// no dependency on expo-constants resolution at runtime.
const PRIVACY_URL = 'https://nutri-fit-omega.vercel.app/legal.html#privacy';
const TERMS_URL = 'https://nutri-fit-omega.vercel.app/legal.html#terms';

type OAuthSourceMeta = {
  service: OAuthService;
  label: string;
  description: string;
  /** Hint na to, jaké datové kategorie zdroj poskytuje. */
  provides: string;
};

const OAUTH_SOURCES: OAuthSourceMeta[] = [
  {
    service: 'strava',
    label: 'Strava',
    description: 'Tréninky (běh, kolo, plavání, …) s GPS a HR.',
    provides: 'tréninky',
  },
  {
    service: 'whoop',
    label: 'Whoop',
    description: 'Spánek, HRV, klidový tep a recovery. Vyžaduje aktivní Whoop subscription.',
    provides: 'spánek · HRV · RHR',
  },
  {
    service: 'garmin',
    label: 'Garmin Connect',
    description: 'Tréninky + denní aktivita + spánek + HR. Vyžaduje schválení Garmin partner programem.',
    provides: 'kroky · tréninky · spánek',
  },
  {
    service: 'polar',
    label: 'Polar Flow',
    description: 'Tréninky a HR z Polar hodinek.',
    provides: 'tréninky · HR',
  },
  {
    service: 'oura',
    label: 'Oura Ring',
    description: 'Spánek, HRV, recovery, teplota.',
    provides: 'spánek · HRV · RHR',
  },
  {
    service: 'fitbit',
    label: 'Fitbit',
    description: 'Kroky, spánek, HR z Fitbit hodinek.',
    provides: 'kroky · spánek · HR',
  },
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
        Alert.alert(
          'Strava není nakonfigurovaná',
          'Aplikace nezná Strava client ID. Doplň `EXPO_PUBLIC_STRAVA_CLIENT_ID` do `.env` a po rebuildovi to půjde.',
        );
        return;
      }
      void strava.connect();
      return;
    }
    if (service === 'whoop') {
      if (whoop.status === 'unavailable') {
        Alert.alert(
          'Whoop není nakonfigurovaný',
          'Aplikace nezná Whoop client ID. Doplň `EXPO_PUBLIC_WHOOP_CLIENT_ID` do `.env` (a nastav `WHOOP_CLIENT_SECRET` na Vercelu) a po rebuildovi to půjde.',
        );
        return;
      }
      void whoop.connect();
      return;
    }
    if (service === 'garmin') {
      if (garmin.status === 'unavailable') {
        Alert.alert(
          'Garmin Connect není nakonfigurovaný',
          'Aplikace nezná Garmin client ID. Doplň `EXPO_PUBLIC_GARMIN_CLIENT_ID` do `.env` (a `GARMIN_CLIENT_SECRET` na Vercelu). Pozn: Garmin developer access vyžaduje review (~2 týdny).',
        );
        return;
      }
      void garmin.connect();
      return;
    }
    if (service === 'oura') {
      if (oura.status === 'unavailable') {
        Alert.alert(
          'Oura není nakonfigurovaná',
          'Aplikace nezná Oura client ID. Registrace na https://cloud.ouraring.com/oauth/applications, pak doplň `EXPO_PUBLIC_OURA_CLIENT_ID` do `.env` + `OURA_CLIENT_SECRET` na Vercelu.',
        );
        return;
      }
      void oura.connect();
      return;
    }
    // TODO(oauth): Polar, Fitbit — stejný pattern.
    Alert.alert(
      `Připojit ${service}`,
      'OAuth flow pro tuhle službu se chystá. Strava, Whoop, Garmin a Oura jsou hotové, zbytek následuje stejným patternem.',
    );
  }

  function handleConnectNative() {
    Alert.alert(
      native.platform === 'ios' ? 'Apple Health' : 'Health Connect',
      native.platform === 'ios'
        ? 'Reálné napojení vyžaduje EAS Build s nainstalovaným @kingstinct/react-native-healthkit a HealthKit entitlement v app.json.'
        : 'Reálné napojení vyžaduje EAS Build s nainstalovaným react-native-health-connect a Android 14+ (nebo Health Connect z Play Store).',
    );
  }

  /** Export all server-side account data as JSON, write to a temp file and
   *  open the system share sheet so the user can save/send it. Requires sign-in
   *  because the endpoint is auth-gated (api/export-data). */
  async function handleExport() {
    if (!user) {
      Alert.alert('Export dat', 'Pro export svých dat ze serveru se nejdřív přihlas v profilu.');
      return;
    }
    setExporting(true);
    try {
      const data = await exportAccountData();
      const json = JSON.stringify(data, null, 2);
      const fileUri = `${FileSystem.cacheDirectory}nutrifit-export-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      await Share.share({ url: fileUri, title: 'NutriFit export dat' });
    } catch (err) {
      Alert.alert('Export se nepodařil', err instanceof Error ? err.message : 'Zkus to prosím znovu.');
    } finally {
      setExporting(false);
    }
  }

  /** Two-step destructive flow: confirm, delete server-side account + data
   *  (api/delete-account), then purge everything on-device and sign out. After
   *  purge, profile becomes null and RootNavigator returns to onboarding. */
  function handleDeleteAccount() {
    Alert.alert(
      'Smazat účet a data?',
      user
        ? 'Trvale smažeme tvůj účet a všechna data na serveru i v telefonu. Tuto akci nelze vrátit zpět.'
        : 'Smažeme všechna data v telefonu (profil, plány, záznamy, váhu, tokeny). Tuto akci nelze vrátit zpět.',
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              if (user) await deleteAccount();
              await purgeAllUserData();
              if (user) await signOut();
            } catch (err) {
              Alert.alert('Smazání se nepodařilo', err instanceof Error ? err.message : 'Zkus to prosím znovu.');
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
      Alert.alert('Nepodařilo se otevřít odkaz', url),
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
            Pošleme ti každé ráno push s readiness + dnešním tréninkem + úpravou jídelníčku.{'\n\n'}
            <Text style={{ fontStyle: 'italic', color: colors.faint }}>
              Reálné notifikace fungují až po `npx expo install expo-notifications` + EAS Build. Zatím se nastavení pamatuje a tělo zprávy je vidět v Pokrok obrazovce.
            </Text>
          </Text>
          <View style={styles.briefingRow}>
            <Pill
              active={briefing.settings.enabled}
              onPress={() => briefing.update({ enabled: !briefing.settings.enabled })}
            >
              {briefing.settings.enabled ? '✓ Zapnuto' : 'Vypnuto'}
            </Pill>
            <Text style={[styles.briefingTime, { color: colors.ink }]}>
              {String(briefing.settings.hour).padStart(2, '0')}:{String(briefing.settings.minute).padStart(2, '0')}
            </Text>
          </View>
          {briefing.settings.enabled && (
            <>
              <Label>Čas notifikace</Label>
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
                  Povolit notifikace v systému
                </Button>
              )}
              {briefing.permission === 'unavailable' && (
                <Text style={[styles.note, { color: colors.faint }]}>
                  💡 Expo Go bez balíčku `expo-notifications` neumí native notifikace. Nastavení se uloží a aktivuje po doinstalování.
                </Text>
              )}
            </>
          )}
        </Card>

        {/* ── Pre-workout fueling reminder ───────────────────────────────── */}
        <Card>
          <Label>🍌 Pre-workout fueling reminder</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            X minut před plánovaným tréninkem dostaneš push s přesnými dávkami sacharidů + bílkovin podle workout intensity a tvé váhy.
          </Text>
          <View style={styles.briefingRow}>
            <Pill
              active={preWorkout.settings.enabled}
              onPress={() => preWorkout.update({ enabled: !preWorkout.settings.enabled })}
            >
              {preWorkout.settings.enabled ? '✓ Zapnuto' : 'Vypnuto'}
            </Pill>
            <Text style={[styles.briefingTime, { color: colors.ink, fontSize: 18 }]}>
              {preWorkout.settings.minutesBefore} min předem
            </Text>
          </View>
          {preWorkout.settings.enabled && (
            <>
              <Label>Kdy upozornit</Label>
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
                💡 Reminder se neplánuje pro rest day. Tréninkový čas se odhaduje (ranní pro běh, večerní pro silovku).
              </Text>
            </>
          )}
        </Card>

        {/* ── Post-workout refuel reminder ───────────────────────────────── */}
        <Card>
          <Label>🔋 Post-workout refuel reminder</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            X minut po skončení tréninku ti připomeneme anabolic window — protein + sacharidy pro regeneraci.
          </Text>
          <View style={styles.briefingRow}>
            <Pill
              active={postWorkout.settings.enabled}
              onPress={() => postWorkout.update({ enabled: !postWorkout.settings.enabled })}
            >
              {postWorkout.settings.enabled ? '✓ Zapnuto' : 'Vypnuto'}
            </Pill>
            <Text style={[styles.briefingTime, { color: colors.ink, fontSize: 18 }]}>
              {postWorkout.settings.minutesAfter} min po
            </Text>
          </View>
          {postWorkout.settings.enabled && (
            <>
              <Label>Kdy upozornit</Label>
              <View style={styles.timeRow}>
                {[0, 5, 15, 30].map(m => (
                  <Pill
                    key={m}
                    active={postWorkout.settings.minutesAfter === m}
                    onPress={() => postWorkout.update({ minutesAfter: m })}
                  >
                    {m === 0 ? 'Hned po' : `+${m} min`}
                  </Pill>
                ))}
              </View>
              <Text style={[styles.note, { color: colors.faint }]}>
                💡 Pro hypertrofii doporučujeme do 30 min — "anabolic window" pro maximální resyntézu svalového proteinu.
              </Text>
            </>
          )}
        </Card>

        {/* ── Native source: Apple Health or Health Connect ─────────────── */}
        <Card>
          <Label>
            {native.platform === 'ios'
              ? '🍎 Apple Health'
              : native.platform === 'android'
                ? '🤖 Health Connect (Android)'
                : '⚪ Nativní zdroj'}
          </Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            {native.platform === 'unsupported'
              ? 'Tato platforma nemá unifikované health API. Použij OAuth zdroje nebo manuální zápis.'
              : native.available
                ? `Stav: ${formatPermission(native.permission)}. Načítá kroky, spánek, RHR, HRV a tréninky.`
                : native.platform === 'ios'
                  ? 'Zatím nedostupné v této verzi — bude aktivní po EAS Build s HealthKit pluginem.'
                  : 'Zatím nedostupné — bude aktivní po EAS Build s Health Connect pluginem.'}
          </Text>
          {native.platform !== 'unsupported' && (
            <Text style={[styles.note, { color: colors.faint }]}>
              💡 Tip: Pokud nosíš Zepp / Mi Band / Amazfit / Garmin / Suunto, zapni v jejich appce sync do{' '}
              {native.platform === 'ios' ? 'Apple Health' : 'Health Connect'} — pak dorazí data automaticky sem.
            </Text>
          )}
          {native.platform !== 'unsupported' && (
            <Button variant="secondary" onPress={handleConnectNative}>
              Detail / instrukce
            </Button>
          )}
        </Card>

        {/* ── OAuth sources ──────────────────────────────────────────────── */}
        <Card>
          <Label>Online služby (OAuth)</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            Propojení skrz oficiální API. Token zůstává jen na tvém telefonu a my ho můžeme kdykoliv smazat.
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
                  <Text style={[styles.sourceDesc, { color: colors.muted }]}>{src.description}</Text>
                  <Text style={[styles.sourceProvides, { color: colors.faint }]}>Poskytuje: {src.provides}</Text>
                  {src.service === 'strava' && strava.status === 'error' && strava.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      Chyba: {strava.error}
                    </Text>
                  )}
                  {src.service === 'strava' && strava.athleteName && connected && (
                    <Text style={[styles.sourceProvides, { color: colors.green }]}>
                      Atlet: {strava.athleteName}
                    </Text>
                  )}
                  {src.service === 'whoop' && whoop.status === 'error' && whoop.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      Chyba: {whoop.error}
                    </Text>
                  )}
                  {src.service === 'garmin' && garmin.status === 'error' && garmin.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      Chyba: {garmin.error}
                    </Text>
                  )}
                  {src.service === 'oura' && oura.status === 'error' && oura.error && (
                    <Text style={[styles.sourceError, { color: colors.red }]}>
                      Chyba: {oura.error}
                    </Text>
                  )}
                </View>
                <View style={styles.sourceButtons}>
                  {connected ? (
                    <Button variant="secondary" onPress={() => confirmDisconnect(src, disconnect)}>
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
          <Label>Bez vlastního API</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            Některé ekosystémy (Zepp / Mi Fit / Amazfit, Suunto, Withings na starší modely) nemají veřejné API.{'\n\n'}
            Funkční cesta: v jejich vlastní appce zapni sync do{' '}
            {native.platform === 'ios' ? 'Apple Health' : 'Health Connect'} — data potom dorazí sem přes nativní zdroj.
          </Text>
        </Card>

        {/* ── Privacy & data (GDPR: export + erase + policy) ─────────────── */}
        <Card>
          <Label>🔒 Soukromí a data</Label>
          <Text style={[styles.body, { color: colors.muted }]}>
            Máš plnou kontrolu nad svými daty. Můžeš si je kdykoliv vyexportovat nebo trvale smazat účet.
          </Text>

          <Button variant="secondary" onPress={() => openUrl(PRIVACY_URL)}>
            Zásady ochrany osobních údajů
          </Button>
          <View style={styles.privacySpacer} />
          <Button variant="secondary" onPress={() => openUrl(TERMS_URL)}>
            Podmínky použití
          </Button>
          <View style={styles.privacySpacer} />
          <Button variant="secondary" disabled={exporting} onPress={handleExport}>
            {exporting ? 'Exportuji…' : 'Exportovat moje data (JSON)'}
          </Button>
          <View style={styles.privacySpacer} />
          <Button variant="danger" disabled={deleting} onPress={handleDeleteAccount}>
            {deleting ? 'Mažu…' : user ? 'Smazat účet a data' : 'Smazat data z telefonu'}
          </Button>
          {!user && (
            <Text style={[styles.note, { color: colors.faint }]}>
              💡 Nejsi přihlášen — smaže se jen lokální kopie dat na tomto telefonu.
            </Text>
          )}
        </Card>

        {isLoading && (
          <Text style={[styles.loading, { color: colors.faint }]}>Načítám stav zdrojů…</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function confirmDisconnect(src: OAuthSourceMeta, disconnect: (s: OAuthService) => Promise<void>) {
  Alert.alert(
    `Odpojit ${src.label}?`,
    'Token bude smazán z telefonu. Data, která jsme z této služby v minulosti načetli, nebudou ovlivněna.',
    [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odpojit', style: 'destructive', onPress: () => disconnect(src.service) },
    ],
  );
}

function formatPermission(p: string): string {
  switch (p) {
    case 'granted':  return 'aktivní';
    case 'partial':  return 'částečně povoleno';
    case 'denied':   return 'odmítnuto';
    case 'not_determined': return 'čeká na povolení';
    case 'unavailable': return 'nedostupné';
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
