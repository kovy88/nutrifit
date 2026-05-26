import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Pill, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { useState } from 'react';
import { deleteAccount, exportAccountData } from '../services/api';
import type { Goal } from '../types';

export function ProfileScreen() {
  const { profile, setProfile, resetLocalProfile, user, signIn, signOut, signUp } = useNutriFit();
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  if (!profile) return null;

  async function login() {
    try {
      await signIn(auth.email.trim(), auth.password);
    } catch (err) {
      Alert.alert('Přihlášení selhalo', err instanceof Error ? err.message : 'Zkus to prosím znovu.');
    }
  }

  async function register() {
    try {
      await signUp(auth.name.trim(), auth.email.trim(), auth.password);
      Alert.alert('Hotovo', 'Pokud Supabase vyžaduje ověření e-mailu, zkontroluj schránku.');
    } catch (err) {
      Alert.alert('Registrace selhala', err instanceof Error ? err.message : 'Zkus to prosím znovu.');
    }
  }

  async function exportData() {
    try {
      const data = await exportAccountData();
      Alert.alert('Export připraven', `Profil: ${data.profile ? 'ano' : 'ne'}\nHistorie: ${data.mealHistory?.length || 0} záznamů`);
    } catch (err) {
      Alert.alert('Export selhal', err instanceof Error ? err.message : 'Přihlaš se prosím znovu.');
    }
  }

  async function confirmDelete() {
    Alert.alert('Smazat účet?', 'Tahle akce smaže účet a serverová data. Nelze ji vrátit zpět.', [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            await resetLocalProfile();
          } catch (err) {
            Alert.alert('Smazání selhalo', err instanceof Error ? err.message : 'Použij veřejný deletion request link.');
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <H1>Profil</H1>
      <Subtitle>Nákupy Premium nejsou v mobilní v1 dostupné. Pokud budou potřeba, patří do StoreKit/Play Billing, ne do Stripe checkoutu.</Subtitle>

      <Card>
        <Label>Údaje</Label>
        <View style={styles.rowWrap}>
          {(['hubnutí', 'udržení', 'nabírání'] as Goal[]).map(goal => (
            <Pill key={goal} active={profile.goal === goal} onPress={() => setProfile({ ...profile, goal })}>{goal}</Pill>
          ))}
        </View>
        <Field keyboardType="number-pad" value={String(profile.weight)} onChangeText={weight => setProfile({ ...profile, weight: Number(weight) || profile.weight })} />
        <Button variant="secondary" onPress={() => resetLocalProfile()}>Spustit onboarding znovu</Button>
      </Card>

      <Card>
        <Label>Účet</Label>
        {user ? (
          <>
            <Text style={styles.user}>{user.email}</Text>
            <Button variant="secondary" onPress={exportData}>Exportovat data</Button>
            <Button variant="secondary" onPress={signOut}>Odhlásit se</Button>
            <Button variant="danger" onPress={confirmDelete}>Smazat účet a data</Button>
          </>
        ) : (
          <>
            <Field value={auth.name} onChangeText={name => setAuth(v => ({ ...v, name }))} placeholder="Jméno pro registraci" />
            <Field autoCapitalize="none" keyboardType="email-address" value={auth.email} onChangeText={email => setAuth(v => ({ ...v, email }))} placeholder="E-mail" />
            <Field secureTextEntry value={auth.password} onChangeText={password => setAuth(v => ({ ...v, password }))} placeholder="Heslo" />
            <View style={styles.row}>
              <Button variant="secondary" onPress={login}>Přihlásit</Button>
              <Button onPress={register}>Registrovat</Button>
            </View>
          </>
        )}
      </Card>

      <Card>
        <Label>Store compliance</Label>
        <Text style={styles.copy}>NutriFit není zdravotnický prostředek, nediagnostikuje, neléčí a nenahrazuje odbornou péči.</Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/legal.html#privacy')}>Ochrana osobních údajů</Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://nutri-fit-omega.vercel.app/delete-account.html')}>Veřejná žádost o smazání účtu</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  user: { color: colors.ink, fontWeight: '900' },
  copy: { color: colors.muted, lineHeight: 20 },
  link: { color: colors.blue, fontWeight: '900' },
});
