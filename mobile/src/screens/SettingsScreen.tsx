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

import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useHealthSources } from '../hooks/useHealthSources';
import type { OAuthService } from '../lib/health';

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
  const { connectedOAuth, native, isLoading, disconnect } = useHealthSources();

  function handleConnect(service: OAuthService) {
    // TODO(oauth): otevřít browser/expo-auth-session s authorize URL,
    // zachytit callback přes Linking, vyměnit code za token přes /api/<service>/exchange,
    // uložit přes AsyncStorageTokenStore.setToken, pak refresh().
    Alert.alert(
      `Připojit ${service}`,
      'OAuth flow zatím není implementovaný. Až bude, klepnutí otevře přihlášení v prohlížeči.',
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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Nastavení</H1>
        <Subtitle>
          Propoj zdroje zdravotních dat. NutriPlan sjednotí všechno do jednoho přehledu, automaticky deduplikuje tréninky a doporučí úpravy podle dat z nejlepšího zdroje.
        </Subtitle>

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
                        ✓ Připojeno
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.sourceDesc, { color: colors.muted }]}>{src.description}</Text>
                  <Text style={[styles.sourceProvides, { color: colors.faint }]}>Poskytuje: {src.provides}</Text>
                </View>
                <View style={styles.sourceButtons}>
                  {connected ? (
                    <Button variant="secondary" onPress={() => confirmDisconnect(src, disconnect)}>
                      Odpojit
                    </Button>
                  ) : (
                    <Button onPress={() => handleConnect(src.service)}>Připojit</Button>
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
});
